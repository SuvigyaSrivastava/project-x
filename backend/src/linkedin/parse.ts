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
 * HONESTY NOTE: the selectors below are modeled on the documented shape of
 * mwlite (semantic container classes + tracking attributes), not yet
 * confirmed against a live-captured page from this project's own account.
 * They're deliberately kept as named constants at the top of this file so
 * a correction, once verified, is a small diff here -- not a rewrite. See
 * README "Known limitations".
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

// --- selectors (TODO: verify against a live capture) -----------------------
const SEL = {
  name: ".profile-topcard__name, h1[data-generated-suggestion-target], h1.pv-text-details__title, h1",
  headline: ".profile-topcard__headline, .pv-text-details__headline",
  locationAndFollowers: ".profile-topcard__location, .pv-text-details__location",
  summary: ".summary-container .summary-text, #about + * .inline-show-more-text, .core-section-container__content p",
  avatar: ".profile-photo, .presence-entity__image, img.profile-photo-edit__preview",
  background: ".profile-background-image img, .cover-img img",
  experienceContainer: ".experience-container, section#experience-section, section[data-section='experience']",
  experienceItem: "li.experience-item, .profile-section-card, .artdeco-list__item",
  educationContainer: ".education-container, section#education-section, section[data-section='education']",
  educationItem: "li.education-item, .profile-section-card, .artdeco-list__item",
  skillsList: ".skills-list, section#skills-section",
  skillItem: "li, .pv-skill-entity",
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
  entryTitle: ".entity-title, .item-title, h3",
  entrySubtitle: ".entity-subtitle, .item-subtitle, h4",
  entryDateRange: ".date-range, .entity-date-range, time",
  entryDescription: ".entity-description, .show-more-less-text, p",
  entryLogo: "img",
  positionLink: "a[data-tracking-control-name='profile-position']",
  educationLink: "a[data-tracking-control-name='profile-education']",
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

function parseLocationAndFollowers($: CheerioAPI, root: C): { location: Location; followersCount: number | null } {
  // Location shares its element with follower/connection counts, e.g.
  // "Seattle, Washington, United States 40,604,066 followers" -- pull the
  // counts out by pattern, keep the remainder as location.
  const raw = text(root.find(SEL.locationAndFollowers));
  const location: Location = { full: null, country: null, countryCode: null, postalCode: null };
  let followersCount: number | null = null;
  if (!raw) return { location, followersCount };

  const followerMatch = raw.match(/([\d,]+)\s*followers?/i);
  if (followerMatch) {
    followersCount = parseInt((followerMatch[1] as string).replace(/,/g, ""), 10);
  }
  const remainder = raw.replace(/[\d,]+\s*followers?/i, "").replace(/[\d,]+\s*connections?/i, "").trim();
  if (remainder) {
    location.full = remainder;
    const parts = remainder.split(",").map((p) => p.trim());
    if (parts.length > 0) location.country = parts[parts.length - 1] ?? null;
  }
  return { location, followersCount };
}

function parseTimelineEntry($: CheerioAPI, el: C): SimpleTimelineEntry {
  normalizeDotSeparators($, el);
  return {
    title: text(el.find(SEL.entryTitle)),
    description: text(el.find(SEL.entryDescription)),
    url: el.find("a").first().attr("href") ?? null,
    dateRange: parseDateRangeText(text(el.find(SEL.entryDateRange))),
  };
}

function parseExperience($: CheerioAPI, root: C): ExperienceEntry[] {
  const out: ExperienceEntry[] = [];
  root.find(SEL.experienceContainer).find(SEL.experienceItem).each((_, node) => {
    const el = $(node);
    normalizeDotSeparators($, el);
    const link = el.find(SEL.positionLink).first();
    const subtitle = text(el.find(SEL.entrySubtitle));
    const [companyName, employmentType] = (subtitle ?? "").split("·").map((s) => s.trim());
    out.push({
      title: text(el.find(SEL.entryTitle)),
      companyName: companyName || null,
      companyLinkedInUrl: link.attr("href") ? new URL(link.attr("href") as string, "https://www.linkedin.com").toString() : null,
      companyLogo: parseImage($, el.find(SEL.entryLogo)),
      employmentType: employmentType || null,
      location: text(el.find(".entity-location, .item-location")),
      description: text(el.find(SEL.entryDescription)),
      dateRange: parseDateRangeText(text(el.find(SEL.entryDateRange))),
    });
  });
  return out;
}

function parseEducation($: CheerioAPI, root: C): EducationEntry[] {
  const out: EducationEntry[] = [];
  root.find(SEL.educationContainer).find(SEL.educationItem).each((_, node) => {
    const el = $(node);
    normalizeDotSeparators($, el);
    const subtitle = text(el.find(SEL.entrySubtitle));
    const [degreeName, fieldOfStudy] = (subtitle ?? "").split("·").map((s) => s.trim());
    out.push({
      schoolName: text(el.find(SEL.entryTitle)),
      degreeName: degreeName || null,
      fieldOfStudy: fieldOfStudy || null,
      grade: text(el.find(".entity-grade, .item-grade")),
      schoolLogo: parseImage($, el.find(SEL.entryLogo)),
      dateRange: parseDateRangeText(text(el.find(SEL.entryDateRange))),
    });
  });
  return out;
}

function parseSkills($: CheerioAPI, root: C): SkillEntry[] {
  const out: SkillEntry[] = [];
  const seen = new Set<string>();
  root.find(SEL.skillsList).find(SEL.skillItem).each((_, node) => {
    const el = $(node);
    const name = text(el.find(".skill-name, .pv-skill-entity__skill-name")) ?? text(el);
    if (!name || seen.has(name)) return;
    seen.add(name);
    const endorsementText = text(el.find(".skill-endorsement-count"));
    const endorsementCount = endorsementText ? parseInt(endorsementText.replace(/[^\d]/g, ""), 10) || null : null;
    out.push({ name, endorsementCount });
  });
  return out;
}

function parseCertifications($: CheerioAPI, root: C): CertificationEntry[] {
  const out: CertificationEntry[] = [];
  root.find(SEL.certificationsSection).find("li, .accomplishment-entry").each((_, node) => {
    const el = $(node);
    normalizeDotSeparators($, el);
    out.push({
      name: text(el.find(SEL.entryTitle)) ?? text(el),
      authority: text(el.find(SEL.entrySubtitle)),
      url: el.find("a").first().attr("href") ?? null,
      dateRange: parseDateRangeText(text(el.find(SEL.entryDateRange))),
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
    out.push({ name, proficiency: text(el.find(SEL.entrySubtitle)) });
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
}

export function parseMwliteHtml(html: string, publicIdentifier: string, profileUrl: string): ParsedProfile {
  const $ = cheerio.load(html);
  const warnings: string[] = [];
  const root = $("body");

  if ($(SEL.name).length === 0) {
    warnings.push("Could not find a name element -- LinkedIn may have changed mwlite's markup, or this page is a login/error page.");
  }

  const fullName = text($(SEL.name));
  const [firstName, ...rest] = (fullName ?? "").split(" ");
  const lastName = rest.length > 0 ? rest.join(" ") : null;

  const { location, followersCount } = parseLocationAndFollowers($, root);

  return {
    warnings,
    data: {
      publicIdentifier,
      profileUrl,
      firstName: fullName ? firstName ?? null : null,
      lastName,
      fullName,
      headline: text($(SEL.headline)),
      summary: text($(SEL.summary)),
      location,
      followersCount,
      connectionsCount: null,
      profilePicture: parseImage($, $(SEL.avatar)),
      backgroundPicture: parseImage($, $(SEL.background)),
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
