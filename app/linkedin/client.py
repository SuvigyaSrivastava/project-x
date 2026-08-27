"""The Voyager HTTP client.

Deliberately NOT doing: TLS fingerprint impersonation, proxy rotation, or
anything else engineered specifically to defeat LinkedIn's bot detection.
That's out of scope for this project on principle, not just pragmatism --
see the README. What IS in scope, and what this module actually does:

  - Present the same standard headers any authenticated API client sends
    (a real User-Agent, the Rest.li protocol header, an Accept that asks
    for the shape we can parse). This is normal HTTP client behaviour,
    not an evasion technique.
  - Reuse one connection pool across the process's lifetime (HTTP/2,
    keep-alive) instead of paying a fresh TLS handshake per request --
    this is the single biggest latency lever available.
  - Pace outbound calls with a token bucket and stop calling entirely
    once a circuit breaker trips, both purely to be a well-behaved,
    rate-respecting client of someone else's service.
  - Fetch independent profile sections concurrently, bounded by a
    semaphore and a hard per-request call budget, so one lookup can't
    fan out into an unbounded number of upstream calls.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

from app.auth.session import LinkedInSession
from app.config import Settings
from app.linkedin.endpoints import CONTACT_INFO_PATH_TEMPLATE, IDENTITY_DECORATION_ID, IDENTITY_PATH, SECTION_PATHS
from app.linkedin.errors import (
    AuthExpiredError,
    LinkedInApiError,
    PrivateProfileError,
    ProfileNotFoundError,
    UpstreamRateLimitedError,
    UpstreamSchemaChangedError,
    UpstreamTimeoutError,
)
from app.utils.circuit_breaker import CircuitBreaker, CircuitOpenError
from app.utils.rate_limiter import TokenBucket

logger = logging.getLogger("linkedin.client")

_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


def _is_auth_shaped(exc: BaseException) -> bool:
    return isinstance(exc, AuthExpiredError)


class LinkedInClient:
    """One instance is created at app startup and reused for the process's
    lifetime -- see app/main.py's lifespan handler. That's what lets the
    connection pool, rate limiter, and circuit breaker actually do their
    job across requests instead of resetting on every call.
    """

    def __init__(self, http: httpx.AsyncClient, session: LinkedInSession, settings: Settings) -> None:
        self._http = http
        self._session = session
        self._settings = settings
        self._bucket = TokenBucket(settings.LINKEDIN_MIN_INTERVAL_MS, settings.LINKEDIN_BURST)
        self._breaker = CircuitBreaker(
            failure_threshold=settings.CIRCUIT_BREAKER_FAILURE_THRESHOLD,
            reset_seconds=settings.CIRCUIT_BREAKER_RESET_SECONDS,
            is_trip_worthy=_is_auth_shaped,
        )
        self._section_semaphore = asyncio.Semaphore(settings.SECTION_FETCH_CONCURRENCY)

    def _headers(self) -> dict[str, str]:
        return {
            "cookie": self._session.as_header(),
            "csrf-token": self._session.csrf_token,
            "x-restli-protocol-version": "2.0.0",
            "x-li-lang": "en_US",
            "accept": "application/vnd.linkedin.normalized+json+2.1",
            "user-agent": _USER_AGENT,
            "referer": "https://www.linkedin.com/",
        }

    async def _get(self, url: str, params: dict[str, str] | None = None) -> dict[str, Any]:
        self._breaker.before_call()
        await self._bucket.acquire()
        try:
            resp = await self._http.get(
                url,
                params=params,
                headers=self._headers(),
                timeout=self._settings.REQUEST_TIMEOUT_SECONDS,
                follow_redirects=False,
            )
        except httpx.TimeoutException as exc:
            err = UpstreamTimeoutError(f"LinkedIn did not respond in time: {url}")
            self._breaker.record_failure(err)
            raise err from exc
        except httpx.HTTPError as exc:
            err = LinkedInApiError(f"Network error calling LinkedIn: {exc}")
            self._breaker.record_failure(err)
            raise err from exc

        mapped = self._map_status(resp)
        if mapped is not None:
            self._breaker.record_failure(mapped)
            raise mapped

        self._breaker.record_success()
        try:
            return resp.json()
        except ValueError as exc:
            err = UpstreamSchemaChangedError("LinkedIn returned a non-JSON body.")
            raise err from exc

    def _map_status(self, resp: httpx.Response) -> LinkedInApiError | None:
        # 3xx here means LinkedIn is bouncing us to a login/checkpoint wall
        # -- with follow_redirects=False we see it directly instead of
        # chasing it in a loop.
        if resp.status_code in (301, 302, 303, 307, 308):
            return AuthExpiredError(
                "LinkedIn redirected instead of returning profile data -- the "
                "session cookie is stale, was rejected, or hit a checkpoint. "
                "Refresh the cookie; this service does not attempt to solve "
                "checkpoints or CAPTCHAs."
            )
        if resp.status_code == 404:
            return ProfileNotFoundError("LinkedIn reports no such profile.")
        if resp.status_code == 403:
            return PrivateProfileError("Profile is private or not visible to this session.")
        if resp.status_code == 401:
            return AuthExpiredError("LinkedIn rejected the session (401).")
        if resp.status_code == 429:
            return UpstreamRateLimitedError("LinkedIn is throttling this session.")
        if resp.status_code == 410:
            return UpstreamSchemaChangedError(
                "LinkedIn returned 410 Gone -- this endpoint has likely been "
                "retired. See app/linkedin/endpoints.py."
            )
        if resp.status_code >= 500:
            return LinkedInApiError(f"LinkedIn returned a server error ({resp.status_code}).")
        if resp.status_code >= 400:
            return UpstreamSchemaChangedError(f"Unexpected status {resp.status_code} from LinkedIn.")
        return None

    async def fetch_identity(self, public_id: str) -> dict[str, Any]:
        try:
            return await self._get(
                IDENTITY_PATH,
                params={
                    "q": "memberIdentity",
                    "memberIdentity": public_id,
                    "decorationId": IDENTITY_DECORATION_ID,
                },
            )
        except CircuitOpenError as exc:
            raise AuthExpiredError(str(exc)) from exc

    async def fetch_section(self, name: str, profile_urn: str) -> dict[str, Any] | None:
        """A single optional section. Returns None (never raises) on
        failure -- an operator can see the miss in the response's
        `warnings` array without the whole lookup failing. See
        app/service.py for how each section's outcome is folded in.
        """
        async with self._section_semaphore:
            try:
                path = SECTION_PATHS[name]
                return await self._get(path, params={"q": "viewee", "profileUrn": profile_urn})
            except CircuitOpenError:
                return None
            except LinkedInApiError as exc:
                logger.warning("section_fetch_failed", extra={"section": name, "error": exc.code})
                return None

    async def fetch_contact_info(self, public_id: str) -> dict[str, Any] | None:
        if not self._settings.ALLOW_CONTACT_INFO:
            return None
        try:
            return await self._get(CONTACT_INFO_PATH_TEMPLATE.format(public_id=public_id))
        except CircuitOpenError:
            return None
        except LinkedInApiError as exc:
            logger.warning("contact_info_fetch_failed", extra={"error": exc.code})
            return None
