/**
 * Stale-while-revalidate cache with single-flight per key.
 *   hit (fresh)  -> return immediately
 *   hit (stale)  -> return immediately, refresh in background
 *   miss         -> block on one fetch; concurrent callers for the same
 *                    key share that one in-flight promise instead of each
 *                    triggering their own LinkedIn call
 */
interface Entry<V> {
  value: V;
  fetchedAt: number;
}

export class TtlCache<V> {
  private store = new Map<string, Entry<V>>();
  private inFlight = new Map<string, Promise<V>>();

  constructor(
    private readonly ttlSeconds: number,
    private readonly staleSeconds: number,
    private readonly maxEntries = 2000
  ) {}

  private ageSeconds(entry: Entry<V>): number {
    return (Date.now() - entry.fetchedAt) / 1000;
  }

  async getOrFetch(key: string, fetcher: () => Promise<V>): Promise<{ value: V; cached: boolean }> {
    if (this.ttlSeconds <= 0) {
      return { value: await fetcher(), cached: false };
    }

    const existing = this.store.get(key);
    if (existing) {
      const age = this.ageSeconds(existing);
      if (age < this.ttlSeconds) {
        return { value: existing.value, cached: true };
      }
      if (age < this.staleSeconds) {
        // Stale but servable -- return now, refresh in the background.
        this.refreshInBackground(key, fetcher);
        return { value: existing.value, cached: true };
      }
    }

    const inflight = this.inFlight.get(key);
    if (inflight) {
      const value = await inflight;
      return { value, cached: false };
    }

    const promise = fetcher()
      .then((value) => {
        this.put(key, value);
        return value;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });
    this.inFlight.set(key, promise);
    const value = await promise;
    return { value, cached: false };
  }

  private refreshInBackground(key: string, fetcher: () => Promise<unknown>): void {
    if (this.inFlight.has(key)) return;
    const promise = (fetcher() as Promise<V>)
      .then((value) => {
        this.put(key, value);
        return value;
      })
      .catch(() => {
        // Swallow -- the stale value already served this caller. The next
        // caller will retry (or the entry ages past staleSeconds and the
        // next call blocks on a fresh fetch, which will surface the error).
      })
      .finally(() => {
        this.inFlight.delete(key);
      }) as Promise<V>;
    this.inFlight.set(key, promise);
  }

  put(key: string, value: V): void {
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) this.store.delete(oldestKey);
    }
    this.store.set(key, { value, fetchedAt: Date.now() });
  }

  delete(key: string): void {
    this.store.delete(key);
  }
}
