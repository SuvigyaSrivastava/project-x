"""Application settings, loaded once at process start from the environment."""
from __future__ import annotations

from functools import lru_cache
from typing import Optional

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")

    # --- LinkedIn session -------------------------------------------------
    # The FULL cookie header from an authenticated browser session, exactly
    # as copied from DevTools. This is deliberately the *only* supported
    # input format for real deployments: a partial cookie set (just li_at +
    # JSESSIONID) is what gets sessions killed within a handful of requests.
    # See app/auth/session.py for how this is parsed and validated.
    LINKEDIN_COOKIE: Optional[str] = None

    # --- HTTP client --------------------------------------------------------
    REQUEST_TIMEOUT_SECONDS: float = 10.0
    MAX_LINKEDIN_CALLS_PER_REQUEST: int = 6
    SECTION_FETCH_CONCURRENCY: int = 4

    # Minimum spacing between outbound LinkedIn calls (token-bucket rate).
    LINKEDIN_MIN_INTERVAL_MS: int = 250
    LINKEDIN_BURST: int = 3

    # --- Circuit breaker ------------------------------------------------
    CIRCUIT_BREAKER_FAILURE_THRESHOLD: int = 3
    CIRCUIT_BREAKER_RESET_SECONDS: float = 30.0

    # --- Cache ------------------------------------------------------------
    CACHE_TTL_SECONDS: int = 3600
    CACHE_STALE_SECONDS: int = 21600  # serve stale up to 6h while revalidating in background
    CACHE_MAX_ENTRIES: int = 2000

    # --- API surface --------------------------------------------------------
    API_KEY: Optional[str] = None
    RATE_LIMIT_PER_MINUTE: int = 20
    ALLOWED_ORIGINS: str = "*"

    # --- Observability ------------------------------------------------------
    LOG_LEVEL: str = "INFO"
    SERVICE_NAME: str = "linkedin-profile-api"

    # --- Optional sections -------------------------------------------------
    # Off by default as of 2026-08-27: two of the five section endpoints
    # (profilePositions, profileEducations) were live-probed and confirmed
    # dead (302 self-redirect); the other three are untested but very likely
    # the same, given 2/2 identical results in the same resource family. See
    # app/linkedin/endpoints.py's module docstring for the full finding.
    # Calling a confirmed-dead path on every request burns call budget and
    # latency for nothing -- flip this back on once real replacement paths
    # (if any exist) are found and verified.
    FETCH_OPTIONAL_SECTIONS: bool = False
    ALLOW_CONTACT_INFO: bool = False

    @field_validator("ALLOWED_ORIGINS")
    @classmethod
    def _split_origins(cls, v: str) -> str:
        return v

    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
