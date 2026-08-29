import { readFileSync } from "node:fs";
import path from "node:path";
import { env } from "../config/env";
import { LinkedInClient, RedirectLoopError } from "./client";
import { parseMwliteHtml } from "./parse";
import { buildProfileUrl } from "./url";
import { CircuitBreaker, CircuitOpenError } from "../utils/circuitBreaker";
import { TokenBucket } from "../utils/tokenBucket";
import { TtlCache } from "../utils/ttlCache";
import { Errors } from "../utils/apiError";
import { logger } from "../utils/logger";
import type { ProfileResponse } from "../types/profile";

const MOCK_FIXTURE_PATH = path.join(__dirname, "..", "..", "fixtures", "profile.html");

function isAuthShaped(err: unknown): boolean {
  return err instanceof RedirectLoopError || (err as { code?: string })?.code === "LINKEDIN_ERROR";
}

export class ProfileService {
  private client: LinkedInClient | null = null;
  private readonly breaker: CircuitBreaker;
  private readonly bucket: TokenBucket;
  private readonly cache: TtlCache<{ data: ProfileResponse["data"]; warnings: string[] }>;
  readonly startupWarnings: string[] = [];

  constructor() {
    this.breaker = new CircuitBreaker(
      env.CIRCUIT_BREAKER_FAILURE_THRESHOLD,
      env.CIRCUIT_BREAKER_RESET_SECONDS,
      isAuthShaped
    );
    this.bucket = new TokenBucket(env.LINKEDIN_MIN_INTERVAL_MS, env.LINKEDIN_BURST);
    this.cache = new TtlCache(env.CACHE_TTL_SECONDS, env.CACHE_STALE_SECONDS);

    if (!env.MOCK_MODE) {
      const cookie = env.LINKEDIN_COOKIE ?? (env.LINKEDIN_LI_AT ? `li_at=${env.LINKEDIN_LI_AT}; JSESSIONID=${env.LINKEDIN_JSESSIONID ?? ""}` : null);
      if (cookie) {
        this.client = new LinkedInClient(cookie);
        this.startupWarnings.push(...this.client.startupWarnings);
        for (const w of this.client.startupWarnings) logger.warn({ warning: w }, "linkedin_cookie_incomplete");
      }
    }
  }

  get configured(): boolean {
    return env.MOCK_MODE || this.client !== null;
  }

  async lookup(publicIdentifier: string, refresh: boolean): Promise<{ data: ProfileResponse["data"]; warnings: string[]; cached: boolean }> {
    if (!this.configured) {
      throw Errors.notConfigured();
    }

    const cacheKey = publicIdentifier.toLowerCase();
    if (refresh) this.cache.delete(cacheKey);

    const { value, cached } = await this.cache.getOrFetch(cacheKey, () => this.fetchAndParse(publicIdentifier));
    return { ...value, cached };
  }

  private async fetchAndParse(publicIdentifier: string): Promise<{ data: ProfileResponse["data"]; warnings: string[] }> {
    const profileUrl = buildProfileUrl(publicIdentifier);

    let html: string;
    if (env.MOCK_MODE) {
      html = readFileSync(MOCK_FIXTURE_PATH, "utf-8");
    } else {
      this.breaker.beforeCall();
      await this.bucket.acquire();
      try {
        html = await this.client!.fetchProfileHtml(publicIdentifier);
      } catch (err) {
        this.breaker.recordFailure(err);
        if (err instanceof CircuitOpenError) throw Errors.circuitOpen(err.message);
        throw err;
      }
      this.breaker.recordSuccess();
    }

    const { data, warnings, resolvedIdentifier } = parseMwliteHtml(html, publicIdentifier, profileUrl);

    // Identity verification: the parsed page should describe the profile we
    // asked for, not just have returned 200. Two checks, matching how
    // confident each signal is:
    //   1. A name was found at all -- catches landing on an error/login
    //      page that still returned 200.
    //   2. If the page carries a canonical/og:url tag, it must match the
    //      identifier we requested -- catches silently getting served a
    //      *different* profile's data. This is a hard reject, not a
    //      warning: returning the wrong person's data is worse than
    //      returning an error.
    if (!data.fullName) {
      warnings.push("No name could be parsed from the response -- treat this result as unverified.");
    }
    if (resolvedIdentifier && resolvedIdentifier !== publicIdentifier.toLowerCase()) {
      throw Errors.linkedInError(
        `Identity check failed: requested '${publicIdentifier}' but the page's own canonical URL resolved to ` +
          `'${resolvedIdentifier}'. Refusing to return data for the wrong profile.`
      );
    }

    if (!env.MOCK_MODE && data.profilePicture === null) {
      const ogImage = await this.client!.fetchPublicOgImage(publicIdentifier);
      if (ogImage) {
        data.profilePicture = { original: ogImage, sizes: [{ url: ogImage, width: null, height: null }] };
      }
    }

    return { data, warnings };
  }
}

export const profileService = new ProfileService();
