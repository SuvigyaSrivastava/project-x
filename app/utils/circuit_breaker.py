"""A minimal async circuit breaker guarding the LinkedIn client.

If the last few calls all failed with an auth-shaped error, the session is
almost certainly dead -- continuing to hammer LinkedIn with it does nothing
but burn the rate budget and make the eventual "your cookie is stale"
diagnosis take longer to reach. The breaker trips open, fails fast with the
same typed error for a cooldown window, then allows one trial call through
(half-open) to check whether an operator has refreshed the cookie.

None of this is about defeating detection -- it's the standard resilience
pattern (Fowler's "Circuit Breaker") applied to a fragile upstream.
"""
from __future__ import annotations

import time
from enum import Enum
from typing import Callable, TypeVar

T = TypeVar("T")


class CircuitState(str, Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitOpenError(Exception):
    """Raised when a call is rejected because the breaker is open."""


class CircuitBreaker:
    def __init__(self, failure_threshold: int, reset_seconds: float, is_trip_worthy: Callable[[BaseException], bool]) -> None:
        self._threshold = failure_threshold
        self._reset_seconds = reset_seconds
        self._is_trip_worthy = is_trip_worthy
        self._state = CircuitState.CLOSED
        self._consecutive_failures = 0
        self._opened_at: float | None = None

    @property
    def state(self) -> CircuitState:
        if self._state is CircuitState.OPEN and self._opened_at is not None:
            if time.monotonic() - self._opened_at >= self._reset_seconds:
                return CircuitState.HALF_OPEN
        return self._state

    def before_call(self) -> None:
        if self.state is CircuitState.OPEN:
            raise CircuitOpenError(
                "LinkedIn session circuit is open -- recent calls failed with an "
                "auth-shaped error. Refusing further calls until the cooldown "
                "elapses or the cookie is refreshed."
            )

    def record_success(self) -> None:
        self._consecutive_failures = 0
        self._state = CircuitState.CLOSED
        self._opened_at = None

    def record_failure(self, exc: BaseException) -> None:
        if not self._is_trip_worthy(exc):
            return
        self._consecutive_failures += 1
        if self._consecutive_failures >= self._threshold:
            self._state = CircuitState.OPEN
            self._opened_at = time.monotonic()
