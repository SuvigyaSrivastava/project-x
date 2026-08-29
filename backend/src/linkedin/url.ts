/**
 * Turn whatever URL-ish string a caller sends into a validated public
 * identifier ("slug"). Accepts full URLs (any subdomain, any locale query
 * param, trailing sub-paths like /details/experience/), percent-encoded
 * names, or a bare slug. Rejects company URLs, non-LinkedIn hosts, and
 * anything that decodes to path-traversal syntax.
 */
import { Errors } from "../utils/apiError";

const SLUG_RE = /^[a-zA-Z0-9À-ɏ%.\-]{3,100}$/;

export function extractPublicIdentifier(input: string): string {
  if (!input || typeof input !== "string") {
    throw Errors.badRequest("`url` is required.");
  }
  const trimmed = input.trim();
  if (trimmed.length > 500) {
    throw Errors.badRequest("`url` is too long (max 500 chars).");
  }

  let slug: string;

  if (/^https?:\/\//i.test(trimmed) || trimmed.includes("linkedin.com")) {
    let url: URL;
    try {
      url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    } catch {
      throw Errors.badRequest("`url` is not a parseable URL.");
    }

    const host = url.hostname.toLowerCase();
    if (!host.endsWith("linkedin.com")) {
      throw Errors.badRequest("Only linkedin.com URLs are accepted.");
    }

    const segments = url.pathname.split("/").filter(Boolean);
    // e.g. ["in", "williamhgates"] or ["in", "williamhgates", "details", "experience"]
    const inIdx = segments.indexOf("in");
    if (inIdx === -1 || !segments[inIdx + 1]) {
      throw Errors.badRequest(
        "Only /in/<slug> profile URLs are accepted (not company, job, or other LinkedIn URLs)."
      );
    }
    slug = segments[inIdx + 1] as string;
  } else {
    slug = trimmed;
  }

  // Reject before decoding if it already looks like traversal syntax.
  if (slug.includes("..") || slug.includes("/") || slug.includes("\\")) {
    throw Errors.badRequest("`url` does not resolve to a valid profile identifier.");
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    throw Errors.badRequest("`url` contains invalid percent-encoding.");
  }

  if (decoded.includes("..") || decoded.includes("/") || decoded.includes("\\") || decoded.includes("\0")) {
    throw Errors.badRequest("`url` does not resolve to a valid profile identifier.");
  }

  if (!SLUG_RE.test(slug)) {
    throw Errors.badRequest("`url` does not resolve to a valid profile identifier.");
  }

  // Re-encode so whatever we send onward to LinkedIn is well-formed,
  // regardless of what shape it arrived in.
  return encodeURIComponent(decoded);
}

export function buildProfileUrl(publicIdentifier: string): string {
  return `https://www.linkedin.com/in/${publicIdentifier}`;
}
