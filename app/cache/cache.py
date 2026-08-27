"""A stale-while-revalidate cache with per-key single-flight de-duplication.

Two upgrades over a plain TTL dict:

1. Stale-while-revalidate. A plain TTL cache makes the caller who happens
   to arrive right after expiry pay the full LinkedIn round-trip. Here,
   once an entry is older than `fresh_ttl` but younger than `stale_ttl`,
   it's returned immediately and a background refresh is kicked off (at
   most once -- see the refreshing-set below) so the *next* caller gets a
   fresh copy without anyone blocking on it.

2. Single-flight. If five requests for the same profile land within the
   same second on a cold cache, a naive implementation fires five
   identical LinkedIn calls. This collapses them into one: the first
   caller does the fetch, the rest await the same in-flight coroutine.

This is process-local, same as everything else here for now. The
interface is deliberately narrow (get_or_fetch) so swapping the backing
store for Redis later -- needed the moment you run more than one instance
-- is a change to this one file, not to every caller.
"""
from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Generic, TypeVar

T = TypeVar("T")

logger = logging.getLogger("cache")


@dataclass
class _Entry(Generic[T]):
    value: T
    stored_at: float


class StaleWhileRevalidateCache(Generic[T]):
    def __init__(self, fresh_ttl: int, stale_ttl: int, max_entries: int) -> None:
        self._fresh_ttl = fresh_ttl
        self._stale_ttl = stale_ttl
        self._max_entries = max_entries
        self._store: dict[str, _Entry[T]] = {}
        self._locks: dict[str, asyncio.Lock] = {}
        self._refreshing: set[str] = set()

    def _lock_for(self, key: str) -> asyncio.Lock:
        lock = self._locks.get(key)
        if lock is None:
            lock = asyncio.Lock()
            self._locks[key] = lock
        return lock

    def _evict_if_full(self) -> None:
        if len(self._store) <= self._max_entries:
            return
        oldest_key = min(self._store, key=lambda k: self._store[k].stored_at)
        del self._store[oldest_key]

    async def get_or_fetch(self, key: str, fetch: Callable[[], Awaitable[T]]) -> tuple[T, bool]:
        """Returns (value, was_cached). `fetch` is only ever in flight once
        per key at a time, whether that's the initial fill or a background
        revalidation.
        """
        entry = self._store.get(key)
        now = time.monotonic()

        if entry is not None:
            age = now - entry.stored_at
            if age < self._fresh_ttl:
                return entry.value, True
            if age < self._stale_ttl:
                self._maybe_background_refresh(key, fetch)
                return entry.value, True
            # Past stale_ttl: fall through to a blocking fetch below.

        async with self._lock_for(key):
            # Re-check: another caller may have filled it while we waited.
            entry = self._store.get(key)
            if entry is not None and (now - entry.stored_at) < self._stale_ttl:
                return entry.value, True

            value = await fetch()
            self._store[key] = _Entry(value=value, stored_at=time.monotonic())
            self._evict_if_full()
            return value, False

    def _maybe_background_refresh(self, key: str, fetch: Callable[[], Awaitable[T]]) -> None:
        if key in self._refreshing:
            return
        self._refreshing.add(key)

        async def _run() -> None:
            try:
                async with self._lock_for(key):
                    value = await fetch()
                    self._store[key] = _Entry(value=value, stored_at=time.monotonic())
                    self._evict_if_full()
            except Exception:  # noqa: BLE001 -- a failed background refresh
                # just means we keep serving the existing stale entry;
                # the next caller's request will surface the real error.
                logger.warning("background_refresh_failed", extra={"key": key}, exc_info=True)
            finally:
                self._refreshing.discard(key)

        asyncio.create_task(_run())

    def put(self, key: str, value: T) -> None:
        """Seed or overwrite an entry directly -- used by the `refresh=true`
        path, which fetches live and writes the result back so the next
        caller benefits without also paying the round-trip.
        """
        self._store[key] = _Entry(value=value, stored_at=time.monotonic())
        self._evict_if_full()

    def stats(self) -> dict[str, int]:
        return {"entries": len(self._store), "refreshing": len(self._refreshing)}
