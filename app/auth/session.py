"""Parses and validates a LinkedIn browser session from a full cookie header.

Every serious audit of this problem converges on the same finding: a
partial cookie set (just li_at + JSESSIONID) gets a session invalidated
within a handful of requests, because LinkedIn treats it as a replayed,
stolen cookie rather than a real browser. The fix isn't cleverness, it's
completeness -- send the whole cookie jar a real browser would, exactly as
copied out of DevTools.

This module owns exactly one job: turn that raw header into a validated,
structured session object. It does not talk to the network.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from http.cookies import SimpleCookie


class InvalidSessionError(ValueError):
    """Raised when the configured cookie header is missing required cookies."""


# Cookies a real browser sends that are NOT needed for the Voyager API and
# would only bloat the header / logs if we captured and stored them.
_IGNORED_COOKIE_PREFIXES = ("li_gc", "lang", "liap", "AnalyticsSyncHistory", "_gcl", "UserMatchHistory")

# Cookies that matter: li_at authenticates the request. JSESSIONID doubles
# as the CSRF token. bcookie/bscookie are the browser-identity pair LinkedIn
# checks li_at against -- an li_at arriving without them looks like a
# replayed cookie from a different browser. lidc is LinkedIn's datacenter
# routing cookie; omitting it doesn't kill the session but can route you to
# an inconsistent edge node mid-flow.
_REQUIRED = ("li_at", "JSESSIONID")
_STRONGLY_RECOMMENDED = ("bcookie", "bscookie")
_ROUTING = ("lidc",)


@dataclass(frozen=True)
class LinkedInSession:
    cookies: dict[str, str]
    csrf_token: str
    completeness_warnings: tuple[str, ...] = field(default_factory=tuple)

    @property
    def is_full(self) -> bool:
        return not self.completeness_warnings

    def as_header(self) -> str:
        """Re-serialize to a Cookie header string for the HTTP client."""
        return "; ".join(f"{k}={v}" for k, v in self.cookies.items())


def _strip_quotes(value: str) -> str:
    return value.strip().strip('"')


def parse_cookie_header(raw: str) -> LinkedInSession:
    """Parse a full `Cookie:` header value (as copied from DevTools) into a
    validated LinkedInSession.

    Raises InvalidSessionError if li_at or JSESSIONID are missing -- those
    two are non-negotiable. Everything else that's missing becomes a
    completeness warning rather than a hard failure, because the service
    should still start (and the operator should still see, loudly, that
    their session is more fragile than it needs to be).
    """
    if not raw or not raw.strip():
        raise InvalidSessionError("LINKEDIN_COOKIE is empty.")

    jar: SimpleCookie = SimpleCookie()
    # SimpleCookie chokes on values containing unescaped characters LinkedIn
    # sometimes ships (e.g. raw '"' inside bcookie); parse permissively.
    for part in raw.split(";"):
        part = part.strip()
        if not part or "=" not in part:
            continue
        name, _, value = part.partition("=")
        name = name.strip()
        value = _strip_quotes(value)
        if any(name.startswith(p) for p in _IGNORED_COOKIE_PREFIXES):
            continue
        jar[name] = value

    cookies = {k: v.value for k, v in jar.items()}

    missing_required = [c for c in _REQUIRED if c not in cookies or not cookies[c]]
    if missing_required:
        raise InvalidSessionError(
            f"Missing required cookie(s): {', '.join(missing_required)}. "
            "Copy the *entire* Cookie header from DevTools, not just li_at."
        )

    warnings: list[str] = []
    for c in _STRONGLY_RECOMMENDED:
        if c not in cookies:
            warnings.append(
                f"'{c}' is missing -- LinkedIn binds li_at to the browser-identity "
                "pair (bcookie/bscookie); without it this session may be treated "
                "as a replayed cookie and invalidated early."
            )
    for c in _ROUTING:
        if c not in cookies:
            warnings.append(f"'{c}' is missing -- requests may route to an inconsistent edge node.")

    csrf_token = _strip_quotes(cookies["JSESSIONID"])

    return LinkedInSession(cookies=cookies, csrf_token=csrf_token, completeness_warnings=tuple(warnings))
