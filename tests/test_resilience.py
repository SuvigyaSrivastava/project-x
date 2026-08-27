import asyncio

import pytest

from app.utils.circuit_breaker import CircuitBreaker, CircuitOpenError, CircuitState
from app.utils.rate_limiter import TokenBucket


class _AuthErr(Exception):
    pass


class _OtherErr(Exception):
    pass


def test_circuit_breaker_trips_only_on_auth_shaped_failures():
    breaker = CircuitBreaker(failure_threshold=2, reset_seconds=60, is_trip_worthy=lambda e: isinstance(e, _AuthErr))

    breaker.before_call()  # closed, no error
    breaker.record_failure(_OtherErr("boom"))
    breaker.record_failure(_OtherErr("boom"))
    breaker.before_call()  # still closed -- non-auth errors don't count

    breaker.record_failure(_AuthErr("stale cookie"))
    assert breaker.state is CircuitState.CLOSED  # one auth failure isn't enough at threshold=2
    breaker.record_failure(_AuthErr("stale cookie"))
    assert breaker.state is CircuitState.OPEN

    with pytest.raises(CircuitOpenError):
        breaker.before_call()


def test_circuit_breaker_resets_on_success():
    breaker = CircuitBreaker(failure_threshold=2, reset_seconds=60, is_trip_worthy=lambda e: True)
    breaker.record_failure(_AuthErr("x"))
    breaker.record_success()
    breaker.record_failure(_AuthErr("x"))
    assert breaker.state is CircuitState.CLOSED  # counter was reset by the success


def test_circuit_breaker_half_opens_after_cooldown():
    breaker = CircuitBreaker(failure_threshold=1, reset_seconds=0.05, is_trip_worthy=lambda e: True)
    breaker.record_failure(_AuthErr("x"))
    assert breaker.state is CircuitState.OPEN
    import time

    time.sleep(0.06)
    assert breaker.state is CircuitState.HALF_OPEN
    breaker.before_call()  # half-open allows the trial call through


@pytest.mark.asyncio
async def test_token_bucket_allows_burst_then_paces():
    bucket = TokenBucket(min_interval_ms=50, burst=3)
    # Burst capacity: first 3 acquisitions should not block meaningfully.
    start = asyncio.get_event_loop().time()
    for _ in range(3):
        await bucket.acquire()
    burst_elapsed = asyncio.get_event_loop().time() - start
    assert burst_elapsed < 0.03

    # The 4th call has exhausted the burst and must wait ~one interval.
    start = asyncio.get_event_loop().time()
    await bucket.acquire()
    paced_elapsed = asyncio.get_event_loop().time() - start
    assert paced_elapsed >= 0.03


def test_token_bucket_try_acquire_is_non_blocking():
    bucket = TokenBucket(min_interval_ms=1000, burst=1)
    assert bucket.try_acquire() is True
    assert bucket.try_acquire() is False  # exhausted, returns immediately rather than waiting
