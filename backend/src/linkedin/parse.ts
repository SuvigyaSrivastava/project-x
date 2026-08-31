/**
 * mwlite HTML -> our schema.
 *
 * Selector strategy, in order of preference (least fragile first):
 *   1. LinkedIn's own tracking attributes (data-tracking-control-name=...)
 *      -- these mark *meaning*, not styling, and change far less often.
 *   2. Semantic container classes (.experience-container, .skills-list, ...).
 *   3. Shape, not position -- inside an entry, ask "which line looks like
 *      a date" (contains a year or "Present") rather than assuming line 2
 *      is always the date. Order within an entry isn't guaranteed.
 *
 * Every field degrades to null/[] instead of throwing. A LinkedIn redesign
 * should mean thinner data, not a 500.
 *
 * VERIFIED 2026-08-29 against one live-captured mwlite page (own throwaway
 * account, target profile consented to be public). Confirmed correct as
 * originally guessed: .experience-container / .education-container /
 * .skills-list / .summary-container / .dot-separator / data-tracking-
 * control-name / data-delayed-url lazy images. Corrected after the capture
 * (see git history for the prior, wrong guesses): the topcard doesn't use
 * BEM-style .profile-topcard__* classes at all -- it's built from generic
 * utility classes (body-small, text-color-text, ...) with no unique hook
 * for headline/location beyond which combination of utility classes is
 * present. Experience/education items are nested `li.profile-entity-lockup`
 * (not `.experience-item`), and neither has a stable date-range class --
 * the date is just another `.body-small` sibling, told apart from the
 * company/degree line by which one *looks like* a date (see
 * parseDateRangeText below). Certifications/languages/projects/etc weren't
 * present on the one profile captured, so those selectors are still
 * unconfirmed guesses -- left as-is rather than invented from zero evidence.
 *
 * ONE IMPORTANT CATCH found in the capture: the page embeds the *viewer's*
 * own nav-bar avatar (alt="<viewer name> Profile picture") before the
 * subject's own photo (alt="Profile picture of <subject name>"). A naive
 * "first image pointing at media.licdn.com" selector would silently return
 * the wrong person's photo. avatar below is scoped specifically to that alt
 * prefix for that reason. The background/cover photo has no equivalent
 * marker to disambiguate viewer vs. subject in what was captured, so it's
 * left null rather than risk the same mistake -- see parseMwliteHtml.
 */
import * as cheerio from "cheerio";
import type { CheerioAPI, Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";
import type {
  CertificationEntry,
  DateRange,
  EducationEntry,
  ExperienceEntry,
  ImageAsset,
  LanguageEntry,
  Location,
  ProfileData,
  SimpleTimelineEntry,
  SkillEntry,
} from "../types/profile";

type C = Cheerio<AnyNode>;

const SEL = {
  name: "h1",
  // First `.body-small.text-color-text` in the topcard block -- the "low
  // emphasis" variant is a *different* class token (school/location lines),
  // so this doesn't collide with them.
  headline: "div.body-small.text-color-text",
  // The low-emphasis div that specifically contains the follower/connection
  // count span -- there are two such divs (school+company, location), this
  // scopes to the right one via :has().
  locationAndFollowersDiv: "div.body-small.text-color-text-low-emphasis:has(.member-connection-info)",
  followersSpan: ".member-connection-info",
  summary: ".summary-container .description",
  // Scoped to the confirmed alt-text prefix so this can't grab the
  // viewer's own nav-bar avatar instead of the subject's -- see module
  // docstring.
  avatar: 'img[alt^="Profile picture of "]',
  experienceContainer: ".experience-container",
  experiencePositionLink: "a[data-tracking-control-name='profile-position']",
  educationContainer: ".education-container",
  educationLink: "a[data-tracking-control-name='view-education']",
  skillsList: ".skills-list",
  skillItem: "li.skill-item",
  // Unconfirmed -- not present on the one profile captured live. Left as
  // best-effort guesses rather than invented from zero evidence; see
  // module docstring.
  certificationsSection: ".accomplishment-type.certifications-section, section#certifications-section",
  languagesSection: ".accomplishment-type.languages-section, section#languages-section",
  projectsSection: ".accomplishment-type.projects-section, section#projects-section",
  volunteerSection: "section#volunteering-section, .volunteering-container",
  honorsSection: ".accomplishment-type.honors-section, section#honors-section",
  coursesSection: ".accomplishment-type.courses-section, section#courses-section",
  organizationsSection: ".accomplishment-type.organizations-section, section#organizations-section",
  publicationsSection: ".accomplishment-type.publications-section, section#publications-section",
  patentsSection: ".accomplishment-type.patents-section, section#patents-section",
  testScoresSection: ".accomplishment-type.test-scores-section, section#test-scores-section",
  entryTitle: "div.body-medium-bold.list-item-heading, .entity-title, .item-title, h3",
  entryBodySmall: "div.body-small",
  entryDescription: ".entity-description, .show-more-less-text, p",
  dotSeparator: ".dot-separator",
};

const YEAR_RE = /\b(1[0-9]|20)\d{2}\b/;
const PRESENT_RE = /\bpresent\b/i;
const MONTHS = [
  "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
];

function text(el: C): string | null {
  const t = el.first().text().replace(/\s+/g, " ").trim();
  return t.length > 0 ? t : null;
}

function normalizeDotSeparators($: CheerioAPI, root: C): void {
  // CSS-drawn separators (`.dot-separator` renders "·" purely in CSS, so
  // the element itself is empty text) -- replace with a literal "·" once,
  // up front, so downstream splitting on "·" works.
  root.find(SEL.dotSeparator).each((_, el) => {
    $(el).replaceWith(" · ");
  });
}

function parseImage($: CheerioAPI, el: C): ImageAsset | null {
  const img = el.is("img") ? el : el.find("img").first();
  if (img.length === 0) return null;
  // Lazy-loaded: the real URL is in data-delayed-url; src is a grey
  // placeholder served from static.licdn.com until JS fills it in. Only
  // accept media.licdn.com URLs -- anything else is the placeholder.
  const delayed = img.attr("data-delayed-url");
  const src = img.attr("src");
  const candidate = delayed && delayed.includes("media.licdn.com") ? delayed : src;
  if (!candidate || !candidate.includes("media.licdn.com")) return null;
  return { original: candidate, sizes: [{ url: candidate, width: null, height: null }] };
}

function parseMonthYear(fragment: string): { month: number | null; year: number | null; text: string } | null {
  const trimmed = fragment.trim();
  if (!trimmed || PRESENT_RE.test(trimmed) === false && !YEAR_RE.test(trimmed)) return null;
  if (PRESENT_RE.test(trimmed)) return null; // "end: Present" is represented as end === null, isCurrent: true
  const yearMatch = trimmed.match(YEAR_RE);
  const year = yearMatch ? parseInt(yearMatch[0], 10) : null;
  const lower = trimmed.toLowerCase();
  let month: number | null = null;
  for (let i = 0; i < MONTHS.length; i++) {
    if (lower.startsWith(MONTHS[i] as string)) {
      month = i + 1;
      break;
    }
  }
  return { month, year, text: trimmed };
}

function parseDateRangeText(raw: string | null): DateRange | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;

  const isCurrent = PRESENT_RE.test(cleaned);
  // "Jun 2020 - Present · 5 yrs 3 mos" / "2018 - 2022"
  const [rangePart, ...durationParts] = cleaned.split("·").map((p) => p.trim());
  const [startRaw, endRaw] = (rangePart ?? "").split(/\s*[-–—]\s*/);

  const start = startRaw ? parseMonthYear(startRaw) : null;
  const end = endRaw && !PRESENT_RE.test(endRaw) ? parseMonthYear(endRaw) : null;

  let durationMonths: number | null = null;
  const durationText = durationParts.join(" ").trim();
  if (durationText) {
    const yrsMatch = durationText.match(/(\d+)\s*yrs?/i);
    const mosMatch = durationText.match(/(\d+)\s*mos?/i);
    const yrs = yrsMatch ? parseInt(yrsMatch[1] as string, 10) : 0;
    const mos = mosMatch ? parseInt(mosMatch[1] as string, 10) : 0;
    if (yrsMatch || mosMatch) durationMonths = yrs * 12 + mos;
  }

  return { start, end, isCurrent, text: cleaned, durationMonths };
}

function looksLikeDate(s: string | null): boolean {
  if (!s) return false;
  return YEAR_RE.test(s) || PRESENT_RE.test(s);
}

function parseLocationAndFollowers($: CheerioAPI, root: C): { location: Location; followersCount: number | null } {
  const div = root.find(SEL.locationAndFollowersDiv).first();
  const location: Location = { full: null, country: null, countryCode: null, postalCode: null };
  let followersCount: number | null = null;
  if (div.length === 0) return { location, followersCount };

  const followerText = text(div.find(SEL.followersSpan));
  if (followerText) {
    const followerMatch = followerText.match(/([\d,]+)/);
    if (followerMatch) followersCount = parseInt((followerMatch[1] as string).replace(/,/g, ""), 10);
  }

  // The location itself is the div's own text minus the follower span's
  // text and the dot separator between them.
  normalizeDotSeparators($, div);
  const full = text(div);
  const remainder = (full ?? "")
    .replace(followerText ?? "", "")
    .replace(/·\s*$/, "")
    .trim();
  if (remainder) {
    location.full = remainder;
    const parts = remainder.split(",").map((p) => p.trim());
    if (parts.length > 0) location.country = parts[parts.length - 1] ?? null;
  }
  return { location, followersCount };
}

function parseTimelineEntry($: CheerioAPI, el: C): SimpleTimelineEntry {
  normalizeDotSeparators($, el);
  const bodySmalls = el.find(SEL.entryBodySmall);
  let dateText: string | null = null;
  bodySmalls.each((_, node) => {
    const t = text($(node));
    if (!dateText && looksLikeDate(t)) dateText = t;
  });
  return {
    title: text(el.find(SEL.entryTitle)),
    description: text(el.find(SEL.entryDescription)),
    url: el.find("a").first().attr("href") ?? null,
    dateRange: parseDateRangeText(dateText),
  };
}

/** Shared shape for experience/education "entity lockup" entries: a title,
 * one or more `.body-small` lines where exactly one *looks like* a date
 * (see module docstring -- there's no dedicated date-range class), a logo,
 * and a link. Which `.body-small` is the date is told apart by content,
 * not position -- the other one is the company/degree line. */
function parseLockupEntry($: CheerioAPI, link: C): { title: string | null; subtitleText: string | null; dateText: string | null; logo: ImageAsset | null; href: string | null } {
  // Scope to the anchor if it wraps the whole entry (confirmed for
  // experience); otherwise fall back to the anchor's own containing `li`.
  const scope = link.find("div.body-small").length > 0 ? link : link.closest("li");
  normalizeDotSeparators($, scope);

  const title = text(scope.find(SEL.entryTitle));
  let dateText: string | null = null;
  let subtitleText: string | null = null;
  scope.find("div.body-small").each((_, node) => {
    const t = text($(node));
    if (looksLikeDate(t)) {
      if (!dateText) dateText = t;
    } else if (!subtitleText && t) {
      subtitleText = t;
    }
  });

  return {
    title,
    subtitleText,
    dateText,
    logo: parseImage($, scope.find("img").first()),
    href: link.attr("href") ?? null,
  };
}

function parseExperience($: CheerioAPI, root: C): ExperienceEntry[] {
  const out: ExperienceEntry[] = [];
  root.find(SEL.experienceContainer).find(SEL.experiencePositionLink).each((_, node) => {
    const link = $(node);
    const { title, subtitleText, dateText, logo, href } = parseLockupEntry($, link);
    out.push({
      title,
      companyName: subtitleText,
      companyLinkedInUrl: href ? new URL(href, "https://www.linkedin.com").toString() : null,
      companyLogo: logo,
      // Not present in the one entry captured live -- no reliable selector
      // confirmed yet, left null rather than guessed.
      employmentType: null,
      location: null,
      description: text(link.closest("li").find(SEL.entryDescription)),
      dateRange: parseDateRangeText(dateText),
    });
  });
  return out;
}

function parseEducation($: CheerioAPI, root: C): EducationEntry[] {
  const out: EducationEntry[] = [];
  root.find(SEL.educationContainer).find(SEL.educationLink).each((_, node) => {
    const link = $(node);
    const { title, subtitleText, dateText, logo } = parseLockupEntry($, link);
    return void out.push({
      schoolName: title,
      // Extrapolated from experience's confirmed structure (same "entity
      // lockup" component family) -- not independently confirmed for
      // education specifically. See module docstring.
      degreeName: subtitleText,
      fieldOfStudy: null,
      grade: null,
      schoolLogo: logo,
      dateRange: parseDateRangeText(dateText),
    });
  });
  return out;
}

function parseSkills($: CheerioAPI, root: C): SkillEntry[] {
  const out: SkillEntry[] = [];
  const seen = new Set<string>();
  root.find(SEL.skillsList).find(SEL.skillItem).each((_, node) => {
    const el = $(node);
    const name = text(el.find("span[dir='ltr']")) ?? text(el);
    if (!name || seen.has(name)) return;
    seen.add(name);
    // No endorsement count observed on the one profile captured live --
    // left null rather than guessed. See module docstring.
    out.push({ name, endorsementCount: null });
  });
  return out;
}

function parseCertifications($: CheerioAPI, root: C): CertificationEntry[] {
  const out: CertificationEntry[] = [];
  root.find(SEL.certificationsSection).find("li, .accomplishment-entry").each((_, node) => {
    const el = $(node);
    normalizeDotSeparators($, el);
    const bodySmalls = el.find(SEL.entryBodySmall);
    let dateText: string | null = null;
    let authority: string | null = null;
    bodySmalls.each((_i, bs) => {
      const t = text($(bs));
      if (looksLikeDate(t)) {
        if (!dateText) dateText = t;
      } else if (!authority && t) {
        authority = t;
      }
    });
    out.push({
      name: text(el.find(SEL.entryTitle)) ?? text(el),
      authority,
      url: el.find("a").first().attr("href") ?? null,
      dateRange: parseDateRangeText(dateText),
    });
  });
  return out;
}

function parseLanguages($: CheerioAPI, root: C): LanguageEntry[] {
  const out: LanguageEntry[] = [];
  root.find(SEL.languagesSection).find("li, .accomplishment-entry").each((_, node) => {
    const el = $(node);
    normalizeDotSeparators($, el);
    const name = text(el.find(SEL.entryTitle)) ?? text(el);
    if (!name) return;
    out.push({ name, proficiency: text(el.find(SEL.entryBodySmall)) });
  });
  return out;
}

function parseSimpleSection($: CheerioAPI, root: C, sectionSel: string): SimpleTimelineEntry[] {
  const out: SimpleTimelineEntry[] = [];
  root.find(sectionSel).find("li, .accomplishment-entry").each((_, node) => {
    out.push(parseTimelineEntry($, $(node)));
  });
  return out;
}

export interface ParsedProfile {
  data: ProfileData;
  warnings: string[];
  /** The public identifier extracted from the page's own canonical link /
   * og:url, if present -- used by ProfileService to verify the page
   * actually describes the profile that was requested, rather than trusting
   * a 200 status alone. null when the page carried no such tag (not
   * treated as a mismatch by itself -- see service.ts). */
  resolvedIdentifier: string | null;
}

/** Pull a `/in/<slug>` identifier out of a LinkedIn URL found in canonical
 * or og:url meta tags. Deliberately narrow -- only used to confirm the
 * page's own claimed identity, never to derive one from nothing. */
export function extractIdentifierFromLinkedInUrl(url: string): string | null {
  const m = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1] as string).toLowerCase() : null;
}

function resolvePageIdentifier($: CheerioAPI): string | null {
  const canonical = $('link[rel="canonical"]').attr("href");
  if (canonical) {
    const id = extractIdentifierFromLinkedInUrl(canonical);
    if (id) return id;
  }
  const ogUrl = $('meta[property="og:url"]').attr("content");
  if (ogUrl) {
    const id = extractIdentifierFromLinkedInUrl(ogUrl);
    if (id) return id;
  }
  return null;
}

export function parseMwliteHtml(html: string, publicIdentifier: string, profileUrl: string): ParsedProfile {
  const $ = cheerio.load(html);
  const warnings: string[] = [];
  const root = $("body");

  if ($(SEL.name).length === 0) {
    warnings.push("Could not find a name element -- LinkedIn may have changed mwlite's markup, or this page is a login/error page.");
  }

  const resolvedIdentifier = resolvePageIdentifier($);
  if (!resolvedIdentifier) {
    warnings.push("Page carried no canonical/og:url tag to confirm its identity against -- identity check skipped for this response.");
  }

  const fullName = text($(SEL.name));
  const [firstName, ...rest] = (fullName ?? "").split(" ");
  const lastName = rest.length > 0 ? rest.join(" ") : null;

  const { location, followersCount } = parseLocationAndFollowers($, root);

  return {
    warnings,
    resolvedIdentifier,
    data: {
      publicIdentifier,
      profileUrl,
      firstName: fullName ? firstName ?? null : null,
      lastName,
      fullName,
      headline: text($(SEL.headline).first()),
      summary: text($(SEL.summary)),
      location,
      followersCount,
      connectionsCount: null,
      profilePicture: parseImage($, $(SEL.avatar).first()),
      // Left null rather than guessed -- see module docstring on the
      // viewer-vs-subject image mixup risk.
      backgroundPicture: null,
      experience: parseExperience($, root),
      education: parseEducation($, root),
      skills: parseSkills($, root),
      certifications: parseCertifications($, root),
      languages: parseLanguages($, root),
      projects: parseSimpleSection($, root, SEL.projectsSection),
      volunteerExperience: parseSimpleSection($, root, SEL.volunteerSection),
      honors: parseSimpleSection($, root, SEL.honorsSection),
      courses: parseSimpleSection($, root, SEL.coursesSection),
      organizations: parseSimpleSection($, root, SEL.organizationsSection),
      publications: parseSimpleSection($, root, SEL.publicationsSection),
      patents: parseSimpleSection($, root, SEL.patentsSection),
      testScores: parseSimpleSection($, root, SEL.testScoresSection),
      connectionDegree: text($(".distance-badge, .connection-degree")),
      industry: null,
      isStudent: null,
      isPremium: null,
      // Always null -- see module docstring. mwlite's own member URN belongs
      // to the *viewer*, not the profile being looked at; a confident wrong
      // id is worse than an honest empty one.
      profileId: null,
      contactInfo: null,
    },
  };
}
