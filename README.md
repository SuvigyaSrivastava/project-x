# LinkedIn Profile API

`GET /v1/profile?url=<linkedin-profile-url>` → structured JSON. Python 3.11, FastAPI, httpx, run as one long-lived async process rather than on a scale-to-zero function.

This is a deliberate iteration on a specific baseline (see [Improvements over the baseline](#improvements-over-the-baseline)), not a from-scratch design — most of the choices below exist because something in that baseline had a sharp edge worth filing off.

## Why a long-running process, not Lambda

The single biggest latency cost in a per-request Lambda isn't the LinkedIn call, it's everything that has to be rebuilt before it: a fresh TLS handshake, a fresh connection, a cold cache, a rate limiter and circuit breaker that remember nothing about the last request. A process that stays up keeps all four warm across requests:

- One `httpx.AsyncClient` with HTTP/2 and keep-alive, created once at startup (`app/main.py`'s lifespan handler) and reused for the life of the process.
- One in-memory cache that actually accumulates hits instead of starting empty on every cold start.
- One circuit breaker and rate limiter with real, continuous state.

The cost is the one this design accepts on purpose: a small instance has to stay running (`min_machines_running = 1` in `fly.toml`; Render's free tier is explicitly *not* used in `render.yaml`, because it sleeps after 15 minutes idle and throws all of the above away).

## What this does NOT do

No CAPTCHA bypass. No TLS fingerprint impersonation. No proxy rotation to dodge IP-based blocking. No device or timing fingerprint spoofing. `app/linkedin/client.py` sends the same standard headers any authenticated API client sends — that's normal HTTP behaviour, not an evasion technique — and stops there. If LinkedIn redirects to a checkpoint, the client surfaces `AuthExpiredError` and stops; it does not try to get past it.

This isn't a compliance afterthought bolted on at the end — it's the actual boundary the rest of the design works inside. Every "make this faster / more resilient" decision below is about being a well-behaved, well-engineered client of someone else's API: pacing calls, not repeating failed ones into a dead session, verifying you got the right data back. None of that requires — or benefits from — pretending to be something you're not.

## Architecture

```
caller
  │  GET /v1/profile?url=...  (+ optional X-API-Key)
  ▼
FastAPI route  ── per-IP token-bucket limiter, API key check
  │
  ▼
StaleWhileRevalidateCache ── single-flight per key
  │  hit (fresh)        → return immediately
  │  hit (stale)        → return immediately, refresh in background
  │  miss                → block on:
  ▼
ProfileService
  │
  ├─▶ LinkedInClient.fetch_identity()        ── 1 call, always
  │     (rate-limited, circuit-breaker-gated, HTTP/2 keep-alive)
  │
  └─▶ asyncio.gather(                        ── up to 5 calls, concurrent,
        fetch_section("positions"),             bounded by a semaphore
        fetch_section("educations"),
        fetch_section("skills"),
        fetch_section("certifications"),
        fetch_section("languages"),
      )
        each section fails independently -- a 502 from one doesn't
        fail the request, it adds one line to `warnings`
  │
  ▼
profile_mapper (pure functions)
  │  resolve_identity(): verify the returned profile IS the one requested
  │  extract_*(): verify each nested record is OWNED by that same profile
  ▼
ProfileResponse + warnings[] + cached:bool
```

## Improvements over the baseline

The baseline this iterates on (Lambda + API Gateway, `identity/dash/profiles` with a `profileView` compatibility fallback) already did real identity verification and kept credentials out of logs — that's exactly why it was worth building on rather than starting over. What changed and why:

| Area | Baseline | Here | Why |
|---|---|---|---|
| Runtime | Lambda, cold start per fresh instance | One long-lived process | Connection pool, cache, breaker all survive across requests — see above |
| Section fetches | Sequential, small per-request call budget | Concurrent (`asyncio.gather` + semaphore) | p99 tracks the slowest single section, not the sum of all of them |
| Cache | TTL only | Stale-while-revalidate + single-flight | A caller never blocks on a cold cache someone else is already refreshing; an expired-but-recent entry is served instantly while a background task refreshes it |
| Auth failure handling | Fails each call independently | Circuit breaker trips after N consecutive auth-shaped failures | Stops hammering a session that's already dead instead of burning the rate budget finding that out five more times |
| Identity verification | Top-level `publicIdentifier` match | Top-level match **+** per-record ownership check on every experience/education/skill/cert/language entry | A schema change that starts leaking a *different* member's nested records into the response is caught, not just a top-level identity swap |
| Cookie handling | `li_at` + `JSESSIONID` | Full cookie header, parsed and validated; missing `bcookie`/`bscookie`/`lidc` logs a specific warning naming what's missing | Every serious writeup of this problem converges on the same finding: a partial cookie set is what gets a session killed in the first few requests |
| Errors | Typed exceptions → status codes | Same, plus a normalized envelope (`{"error": {code, message, request_id}}`) enforced by one exception handler so a raw `HTTPException(detail=...)` can't leak an inconsistent shape | Consistency is part of the contract, not just the happy path |
| Rate limiting | Fixed AWS API Gateway throttle | Non-blocking per-IP token bucket for callers; separate token bucket pacing outbound LinkedIn calls | Two different things being paced for two different reasons shouldn't share one knob |
| Observability | — | Structured JSON logs, one request ID threaded from the edge middleware through every downstream log line | A production incident starts with "grep this request ID," not "guess which log line was this request" |

## Setup

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env   # fill in LINKEDIN_COOKIE -- see below
pytest                 # 39 tests, all fixture-driven, no network or credentials needed
uvicorn app.main:app --reload
```

`/docs` has interactive OpenAPI docs once it's running.

## Getting a LinkedIn session (do this on a throwaway account)

Every submission that got this far in the wild made the same call: use a secondary account, not your own. This isn't paranoia — it's the same reasoning that makes you not run untrusted code as root. If you don't have one set up yet:

1. **Create a new LinkedIn account** with a fresh email address you control. Don't reuse your real name or existing photos if you'd rather keep it clearly separate from your identity.
2. **Fill in a minimal profile** — a headline and one line of "about" is enough. A completely empty account is itself a signal LinkedIn's own systems weight; a few minutes of normal-looking setup goes a long way.
3. **Use it like a person would, briefly, before wiring it into anything** — view a few profiles, accept a connection or two, browse the feed. Then let it sit for a day or two before pointing an API at it. Immediately scripting a brand-new account is the pattern that gets flagged fastest, and there's no evasion trick that substitutes for just not doing that.
4. **Log in from the same browser/network you'll capture the cookie from.** Consistency between where the cookie was minted and where it's used matters more than anything about the request headers.
5. **Capture the full cookie, not just `li_at`:**
   - DevTools (F12) → Network tab → reload any profile page.
   - Click the request to `www.linkedin.com` → Headers → Request Headers.
   - Right-click the `cookie:` line → Copy value.
   - Paste the whole thing into `.env` as `LINKEDIN_COOKIE`, single-quoted (it contains `"` and `;`).
6. **Keep request volume low and expect to refresh this periodically.** `li_at` isn't permanent, and this service does not attempt to re-authenticate itself — when it dies, `/health` still reports `credentials_configured: true` (the cookie parsed fine at startup) but calls will start returning `502 AUTH_EXPIRED`, and that's the cue to repeat steps 5–6.

Never commit `.env`. `.gitignore` already excludes it, plus `capture*.txt` and `*.har` — a copied cURL command or a HAR export carries the same cookie.

## API

`GET /v1/profile?url=<url-or-bare-identifier>&refresh=<bool>` — `refresh=true` bypasses the cache read but still writes the fresh result back for the next caller.

```json
{
  "data": { "public_identifier": "jane-doe", "first_name": "Jane", "...": "..." },
  "warnings": [],
  "cached": false
}
```

Errors are always `{"error": {"code", "message", "request_id"}}`:

| Status | code | Cause |
|---|---|---|
| 400 | `INVALID_URL` | Not a parseable `linkedin.com/in/...` URL |
| 401 | `UNAUTHORIZED` | `API_KEY` is set and missing/wrong |
| 403 | `PROFILE_PRIVATE` | Profile not visible to this session |
| 404 | `PROFILE_NOT_FOUND` | No such profile |
| 429 | `UPSTREAM_RATE_LIMITED` / `RATE_LIMITED` | LinkedIn throttled us / you hit the per-IP limit |
| 502 | `AUTH_EXPIRED` | Session cookie stale, rejected, or checkpointed — refresh it, see above |
| 502 | `UPSTREAM_SCHEMA_CHANGED` | LinkedIn's shape drifted, or an identity/ownership check rejected the data — see `app/mapper/profile_mapper.py` |
| 503 | `NOT_CONFIGURED` | No `LINKEDIN_COOKIE` set |
| 504 | `UPSTREAM_TIMEOUT` | LinkedIn didn't respond within `REQUEST_TIMEOUT_SECONDS` |

## Known limitations

- **Single instance.** The cache, rate limiter, and circuit breaker are all process-local by design (`Dockerfile` runs `--workers 1` on purpose). Running more than one instance means each has its own view of the world — the fix, when you actually need horizontal scale, is swapping `app/cache/cache.py`'s store for Redis; the `get_or_fetch`/`put` interface was kept narrow specifically so that's a one-file change.
- **Identity endpoint verified live; two of five section endpoints confirmed dead.** `IDENTITY_PATH` and `IDENTITY_DECORATION_ID` were confirmed 2026-08-27 against a real authenticated session -- a direct call returned `200` with the expected `{data, included}` envelope and resolved the correct member URN, with no side effects on the session. `profilePositions` and `profileEducations` were each live-probed in isolation and both came back `302` redirecting to themselves -- a retired/moved-endpoint response, not a session-kill (the accompanying `Clear-Site-Data` header only affects a real browser processing the response, and the browser session was unaffected both times). `profileSkills`, `profileCertifications`, and `profileLanguages` weren't individually probed, but 2/2 identical results in the same resource family makes it likely they're the same. `FETCH_OPTIONAL_SECTIONS` now defaults to `false` as a direct consequence -- see `app/linkedin/endpoints.py` for the full finding and re-enable per-section once a verified-working path exists for whichever section you need.
- **No automatic re-authentication.** By design — scripted login is exactly the pattern that trips 2FA/checkpoints. When the session dies, an operator refreshes it manually.
- **Section coverage depends on what the identity call's own decoration already includes** versus what the 5 optional per-section calls add; `FETCH_OPTIONAL_SECTIONS=false` trades completeness for fewer LinkedIn calls and a faster p50.
- **This uses a private, undocumented API and LinkedIn's terms restrict automated access to it.** Scoped for evaluation on a throwaway account, kept low-volume, not intended as a long-running public product without an explicit decision to accept that risk.
