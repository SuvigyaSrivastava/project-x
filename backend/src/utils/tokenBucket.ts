/**
 * Paces outbound LinkedIn calls. `minIntervalMs` is the steady-state
 * spacing; `burst` allows a small number of calls to go out back-to-back
 * before the spacing kicks in. This exists because of a very concrete,
 * live-observed finding: LinkedIn's session-kill behaviour tracks calls
 * landing too close together, not just raw volume -- see README.
 */
export class TokenBucket {
  private tokens: number;
  private lastRefill = Date.now();

  constructor(private readonly minIntervalMs: number, private readonly burst: number) {
    this.tokens = burst;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (this.minIntervalMs <= 0) {
      this.tokens = this.burst;
      return;
    }
    const gained = elapsed / this.minIntervalMs;
    if (gained >= 1) {
      this.tokens = Math.min(this.burst, this.tokens + gained);
      this.lastRefill = now;
    }
  }

  async acquire(): Promise<void> {
    if (this.minIntervalMs <= 0) return;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, Math.min(50, this.minIntervalMs)));
    }
  }
}
