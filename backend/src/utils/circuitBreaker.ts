/**
 * Trips after N consecutive auth-shaped failures (redirect loop, 401, 999)
 * and stays open for a cooldown window. The point is narrow: stop hammering
 * a session that's already dead instead of burning the outbound rate
 * budget re-discovering that on every subsequent call.
 */
export class CircuitOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CircuitOpenError";
  }
}

export class CircuitBreaker {
  private consecutiveFailures = 0;
  private openedAt: number | null = null;

  constructor(
    private readonly failureThreshold: number,
    private readonly resetSeconds: number,
    private readonly isTripWorthy: (err: unknown) => boolean
  ) {}

  beforeCall(): void {
    if (this.openedAt === null) return;
    const elapsedSeconds = (Date.now() - this.openedAt) / 1000;
    if (elapsedSeconds < this.resetSeconds) {
      const remaining = Math.ceil(this.resetSeconds - elapsedSeconds);
      throw new CircuitOpenError(
        `Circuit open after ${this.failureThreshold} consecutive auth-shaped failures. ` +
          `Retrying in ~${remaining}s. Refresh LINKEDIN_COOKIE if this persists.`
      );
    }
    // Cooldown elapsed -- allow a half-open probe.
    this.openedAt = null;
    this.consecutiveFailures = 0;
  }

  recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.openedAt = null;
  }

  recordFailure(err: unknown): void {
    if (!this.isTripWorthy(err)) return;
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.failureThreshold && this.openedAt === null) {
      this.openedAt = Date.now();
    }
  }
}
