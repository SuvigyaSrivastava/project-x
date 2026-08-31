/**
 * Fetches a LinkedIn profile as `mwlite` (mobile lite) HTML: server-rendered,
 * no JavaScript needed, and -- unlike the desktop site or the old Voyager
 * REST API -- not something LinkedIn appears to have retired. See README
 * section "Why mwlite" for how that was established.
 *
 * Two things make this actually work, both load-bearing:
 *   1. The FULL cookie header, not just li_at -- see app/auth/session
 *      equivalent validation below. A partial cookie set reads as a
 *      replayed/stolen cookie and gets killed fast.
 *   2. A cookie jar. LinkedIn can respond to a request with a redirect that
 *      also carries a *replacement* li_at via Set-Cookie, and expects the
 *      retried request to use it. A client that keeps resending the
 *      original cookie loops on that redirect forever.
 */
import { CookieJar } from "tough-cookie";
import { env } from "../config/env";
import { ApiError, Errors } from "../utils/apiError";
import { logger } from "../utils/logger";

const MOBILE_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

const REQUIRED_COOKIES = ["li_at"];
const RECOMMENDED_COOKIES = ["JSESSIONID", "bcookie", "bscookie", "lidc"];
const MAX_REDIRECT_HOPS = 4;

export class RedirectLoopError extends ApiError {
  constructor() {
    super(502, "LINKEDIN_ERROR", "Redirect loop -- the session cookie is stale or incomplete. Capture a fresh one.");
  }
}

function parseCookieHeaderWarnings(raw: string): string[] {
  const warnings: string[] = [];
  const present = new Set(
    raw
      .split(";")
      .map((p) => p.split("=")[0]?.trim())
      .filter((k): k is string => Boolean(k))
  );
  for (const required of REQUIRED_COOKIES) {
    if (!present.has(required)) {
      throw Errors.notConfigured(`LINKEDIN_COOKIE is missing the required '${required}' cookie.`);
    }
  }
  for (const rec of RECOMMENDED_COOKIES) {
    if (!present.has(rec)) {
      warnings.push(
        `'${rec}' is missing from LINKEDIN_COOKIE -- LinkedIn is more likely to treat this session ` +
          "as a replayed cookie and kill it early. Copy the *entire* cookie header from DevTools, not just li_at."
      );
    }
  }
  return warnings;
}

export class LinkedInClient {
  private jar: CookieJar;
  readonly startupWarnings: string[];

  constructor(cookieHeader: string, private readonly targetUrl = "https://www.linkedin.com") {
    this.startupWarnings = parseCookieHeaderWarnings(cookieHeader);
    this.jar = new CookieJar();
    for (const part of cookieHeader.split(";")) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      try {
        this.jar.setCookieSync(`${trimmed}; Path=/; Domain=linkedin.com`, this.targetUrl);
      } catch (err) {
        logger.debug({ err: String(err) }, "skipped one unparseable cookie fragment (value redacted)");
      }
    }
  }

  private async currentCookieHeader(url: string): Promise<string> {
    return this.jar.getCookieStringSync(url);
  }

  private async storeSetCookies(url: string, response: Response): Promise<void> {
    const setCookies = (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    for (const sc of setCookies) {
      try {
        this.jar.setCookieSync(sc, url);
      } catch (err) {
        logger.debug({ err: String(err) }, "failed to store one Set-Cookie (value redacted)");
      }
    }
  }

  /** Fetch a profile's mwlite HTML. Returns the raw HTML body on success,
   * along with the final URL the 200 was actually served from (after any
   * redirects) -- see ProfileService for why that URL matters even when
   * the HTML itself carries no canonical/og:url tag. */
  async fetchProfileHtml(publicIdentifier: string): Promise<{ html: string; finalUrl: string }> {
    let url = `https://www.linkedin.com/in/${publicIdentifier}/`;
    const firstUrl = url;

    for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
      const cookieHeader = await this.currentCookieHeader(url);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), env.REQUEST_TIMEOUT_MS);

      let response: Response;
      try {
        response = await fetch(url, {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          headers: {
            cookie: cookieHeader,
            "user-agent": MOBILE_USER_AGENT,
            accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "accept-language": "en-US,en;q=0.9",
            referer: "https://www.linkedin.com/",
          },
        });
      } catch (err) {
        if (controller.signal.aborted) {
          throw new ApiError(504, "UPSTREAM_TIMEOUT", `LinkedIn did not respond within ${env.REQUEST_TIMEOUT_MS}ms.`);
        }
        throw Errors.linkedInError(`Network error calling LinkedIn: ${String(err)}`);
      } finally {
        clearTimeout(timeout);
      }

      await this.storeSetCookies(url, response);

      if (response.status === 200) {
        return { html: await response.text(), finalUrl: url };
      }
      if (response.status === 404) {
        throw Errors.profileNotFound();
      }
      if (response.status === 999 || response.status === 429) {
        throw Errors.linkedInRateLimited();
      }
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) {
          throw Errors.linkedInError(`LinkedIn redirected (${response.status}) with no Location header.`);
        }
        const nextUrl = new URL(location, url).toString();
        if (nextUrl === url || nextUrl === firstUrl) {
          // Same-URL redirect: this is the "rotating a cookie" pattern --
          // storeSetCookies already captured the replacement, so retry once
          // more with the jar's updated value rather than treating this as
          // an immediate failure.
          if (hop === MAX_REDIRECT_HOPS) throw new RedirectLoopError();
          url = nextUrl;
          continue;
        }
        if (/\/authwall|\/checkpoint|\/uas\/login/i.test(nextUrl)) {
          throw Errors.linkedInError(
            "LinkedIn redirected to a login/checkpoint wall -- the session cookie is stale, was " +
              "rejected, or hit a checkpoint. This service does not attempt to solve checkpoints or CAPTCHAs."
          );
        }
        url = nextUrl;
        continue;
      }
      throw Errors.linkedInError(`Unexpected status ${response.status} from LinkedIn.`);
    }
    throw new RedirectLoopError();
  }

  /** Unauthenticated fetch of the public (logged-out) profile page, used
   * only to read its og:image for the profile photo -- see parse.ts. Never
   * throws; a failure here shouldn't fail the whole lookup. */
  async fetchPublicOgImage(publicIdentifier: string): Promise<string | null> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), env.REQUEST_TIMEOUT_MS);
      const response = await fetch(`https://www.linkedin.com/in/${publicIdentifier}/`, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "user-agent":
            "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
          accept: "text/html",
        },
      }).finally(() => clearTimeout(timeout));
      if (response.status !== 200) return null;
      const html = await response.text();
      const match = html.match(/<meta property="og:image" content="([^"]+)"/i);
      return match?.[1] ?? null;
    } catch {
      return null;
    }
  }
}
