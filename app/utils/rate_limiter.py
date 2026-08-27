"""An async token-bucket limiter for outbound LinkedIn calls.

This is good-citizen pacing, not evasion: LinkedIn is a rate-limited
upstream and a client that never bursts is easier to keep a session alive
on, cheaper to run against a shared account, and just correct behaviour
for any well-mannered API client. It has nothing to do with looking like a
particular browser -- it's about not hammering someone else's service.
"""
from __future__ import annotations

import asyncio
import time


class TokenBucket:
    def __init__(self, min_interval_ms: int, burst: int) -> None:
        self._min_interval = min_interval_ms / 1000
        self._capacity = max(1, burst)
        self._tokens = float(self._capacity)
        self._last_refill = time.monotonic()
        self._lock = asyncio.Lock()

    def _refill(self) -> None:
        now = time.monotonic()
        elapsed = now - self._last_refill
        refill_rate = 1.0 / self._min_interval  # tokens per second
        self._tokens = min(self._capacity, self._tokens + elapsed * refill_rate)
        self._last_refill = now

    async def acquire(self) -> None:
        """Block until a token is available. Used for outbound LinkedIn
        pacing, where waiting is the correct behaviour -- we want the call
        to happen, just not immediately.
        """
        while True:
            async with self._lock:
                self._refill()
                if self._tokens >= 1:
                    self._tokens -= 1
                    return
                refill_rate = 1.0 / self._min_interval
                wait = (1 - self._tokens) / refill_rate
            await asyncio.sleep(wait)

    def try_acquire(self) -> bool:
        """Non-blocking: take a token if one's available, otherwise return
        False immediately. Used for the per-IP API limiter, where a client
        over budget should get a fast 429, not be silently delayed.
        """
        self._refill()
        if self._tokens >= 1:
            self._tokens -= 1
            return True
        return False
