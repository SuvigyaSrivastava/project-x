"""Typed exception taxonomy. Every upstream failure mode maps to exactly
one of these, which in turn maps to exactly one HTTP status + error code
in app/main.py. Nothing upstream-shaped (raw LinkedIn bodies, stack
traces) ever crosses that boundary into a response.
"""
from __future__ import annotations


class LinkedInApiError(Exception):
    code: str = "UPSTREAM_ERROR"
    status_code: int = 502

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class ProfileNotFoundError(LinkedInApiError):
    code = "PROFILE_NOT_FOUND"
    status_code = 404


class PrivateProfileError(LinkedInApiError):
    code = "PROFILE_PRIVATE"
    status_code = 403


class AuthExpiredError(LinkedInApiError):
    """The configured session cookie is stale, rejected, or challenged."""

    code = "AUTH_EXPIRED"
    status_code = 502


class UpstreamRateLimitedError(LinkedInApiError):
    code = "UPSTREAM_RATE_LIMITED"
    status_code = 429


class UpstreamSchemaChangedError(LinkedInApiError):
    """LinkedIn's response shape didn't match what the parser expects, OR
    an identity-verification check failed (returned data didn't belong to
    the requested member). Both are treated the same way: don't guess,
    don't return possibly-wrong data, surface it loudly.
    """

    code = "UPSTREAM_SCHEMA_CHANGED"
    status_code = 502


class UpstreamTimeoutError(LinkedInApiError):
    code = "UPSTREAM_TIMEOUT"
    status_code = 504
