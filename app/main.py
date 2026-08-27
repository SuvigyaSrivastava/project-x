"""FastAPI app: lifespan-managed shared HTTP client (this is the whole
point of running as a long-lived service instead of on Lambda -- the
connection pool, cache, and circuit breaker all survive across requests
instead of rebuilding from cold every invocation), routes, and a single
exception handler that keeps route bodies free of try/except noise.
"""
from __future__ import annotations

import logging
import time
import uuid
from contextlib import asynccontextmanager
from typing import AsyncIterator

import httpx
from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.auth.session import InvalidSessionError, parse_cookie_header
from app.cache.cache import StaleWhileRevalidateCache
from app.config import get_settings
from app.linkedin.client import LinkedInClient
from app.linkedin.errors import LinkedInApiError
from app.mapper.profile_mapper import MappedProfile
from app.models.schema import ApiEnvelope
from app.observability.logging import Timer, configure_logging, request_id_ctx
from app.service import ProfileService
from app.utils.rate_limiter import TokenBucket
from app.utils.url_parser import InvalidUrlError, extract_public_identifier

logger = logging.getLogger("api")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging(settings.LOG_LEVEL, settings.SERVICE_NAME)

    limits = httpx.Limits(max_connections=50, max_keepalive_connections=20, keepalive_expiry=90)
    http_client = httpx.AsyncClient(http2=True, limits=limits)
    app.state.http_client = http_client
    app.state.settings = settings
    app.state.cache = StaleWhileRevalidateCache(
        fresh_ttl=settings.CACHE_TTL_SECONDS,
        stale_ttl=settings.CACHE_STALE_SECONDS,
        max_entries=settings.CACHE_MAX_ENTRIES,
    )
    app.state.ip_buckets: dict[str, TokenBucket] = {}

    if settings.LINKEDIN_COOKIE:
        try:
            session = parse_cookie_header(settings.LINKEDIN_COOKIE)
            for w in session.completeness_warnings:
                logger.warning("session_incomplete", extra={"warning": w})
            app.state.linkedin_client = LinkedInClient(http_client, session, settings)
            app.state.credentials_configured = True
        except InvalidSessionError as exc:
            logger.error("session_invalid", extra={"error": str(exc)})
            app.state.linkedin_client = None
            app.state.credentials_configured = False
    else:
        app.state.linkedin_client = None
        app.state.credentials_configured = False

    logger.info("startup_complete", extra={"credentials_configured": app.state.credentials_configured})
    try:
        yield
    finally:
        await http_client.aclose()


app = FastAPI(title="LinkedIn Profile API", version="2.0.0", lifespan=lifespan)


def _add_cors(app: FastAPI) -> None:
    settings = get_settings()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.origins_list(),
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )


_add_cors(app)


@app.middleware("http")
async def request_context(request: Request, call_next):
    req_id = str(uuid.uuid4())
    token = request_id_ctx.set(req_id)
    start = time.monotonic()
    try:
        response = await call_next(request)
    finally:
        request_id_ctx.reset(token)
    duration_ms = round((time.monotonic() - start) * 1000, 1)
    response.headers["x-request-id"] = req_id
    logger.info(
        "request_complete",
        extra={
            "path": request.url.path,
            "method": request.method,
            "status": getattr(response, "status_code", None),
            "duration_ms": duration_ms,
            "request_id": req_id,
        },
    )
    return response


@app.exception_handler(LinkedInApiError)
async def linkedin_error_handler(request: Request, exc: LinkedInApiError) -> JSONResponse:
    req_id = request_id_ctx.get()
    logger.warning("linkedin_error", extra={"code": exc.code, "detail": exc.message})
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.code, "message": exc.message, "request_id": req_id}},
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """Routes here raise HTTPException with `detail` already shaped as
    {"error": {"code", "message"}} -- FastAPI's own default handler would
    otherwise wrap that under a top-level "detail" key, which breaks the
    one-shape error contract every other handler in this file honours.
    This normalizes it and stamps the request_id in either case.
    """
    req_id = request_id_ctx.get()
    if isinstance(exc.detail, dict) and "error" in exc.detail:
        content = exc.detail
        content["error"]["request_id"] = req_id
    else:
        content = {"error": {"code": "HTTP_ERROR", "message": str(exc.detail), "request_id": req_id}}
    return JSONResponse(status_code=exc.status_code, content=content)


@app.exception_handler(InvalidUrlError)
async def invalid_url_handler(request: Request, exc: InvalidUrlError) -> JSONResponse:
    req_id = request_id_ctx.get()
    return JSONResponse(
        status_code=400,
        content={"error": {"code": "INVALID_URL", "message": str(exc), "request_id": req_id}},
    )


def _check_api_key(x_api_key: str | None) -> None:
    settings = get_settings()
    if settings.API_KEY and x_api_key != settings.API_KEY:
        raise HTTPException(status_code=401, detail={"error": {"code": "UNAUTHORIZED", "message": "Missing or invalid X-API-Key."}})


async def _check_rate_limit(request: Request) -> None:
    settings = get_settings()
    if settings.RATE_LIMIT_PER_MINUTE <= 0:
        return
    client_ip = request.client.host if request.client else "unknown"
    buckets: dict[str, TokenBucket] = request.app.state.ip_buckets
    bucket = buckets.get(client_ip)
    if bucket is None:
        min_interval_ms = int(60_000 / settings.RATE_LIMIT_PER_MINUTE)
        bucket = TokenBucket(min_interval_ms=min_interval_ms, burst=settings.RATE_LIMIT_PER_MINUTE)
        buckets[client_ip] = bucket
    if not bucket.try_acquire():
        raise HTTPException(
            status_code=429,
            detail={"error": {"code": "RATE_LIMITED", "message": "Too many requests from this client."}},
        )


@app.get("/health")
async def health(request: Request) -> dict:
    settings: object = request.app.state.settings
    cache: StaleWhileRevalidateCache = request.app.state.cache
    return {
        "status": "ok",
        "credentials_configured": request.app.state.credentials_configured,
        "cache": cache.stats(),
    }


@app.get("/v1/profile", response_model=ApiEnvelope)
async def get_profile(
    request: Request,
    url: str = Query(..., description="LinkedIn profile URL or bare public identifier"),
    refresh: bool = Query(False),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> ApiEnvelope:
    _check_api_key(x_api_key)
    await _check_rate_limit(request)

    if not request.app.state.credentials_configured:
        raise HTTPException(
            status_code=503,
            detail={"error": {"code": "NOT_CONFIGURED", "message": "No LinkedIn session configured on the server."}},
        )

    public_id = extract_public_identifier(url)
    settings = request.app.state.settings
    cache: StaleWhileRevalidateCache = request.app.state.cache
    service = ProfileService(request.app.state.linkedin_client, settings)

    if refresh:
        # A live re-fetch, going straight to LinkedIn -- but still written
        # back into the cache afterward so the *next* request benefits.
        mapped = await service.fetch_and_map(public_id)
        was_cached = False
        cache.put(public_id, mapped)
    else:
        mapped, was_cached = await cache.get_or_fetch(public_id, lambda: service.fetch_and_map(public_id))

    return ApiEnvelope(data=mapped.profile, warnings=mapped.warnings, cached=was_cached)
