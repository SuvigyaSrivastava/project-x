/**
 * Public response schema. Rules followed throughout:
 *   - a missing single value is `null`, never `undefined` or `""`
 *   - a missing list is `[]`, so `profile.skills.map(...)` is always safe
 *   - dates are structured AND pre-formatted (`{ month, year, text }`) so a
 *     caller can compute with them or just print `text` without writing a
 *     date formatter
 *   - images come as a set of sizes plus the original URL
 */

export interface ImageAsset {
  original: string;
  sizes: { url: string; width: number | null; height: number | null }[];
}

export interface DateRange {
  start: { month: number | null; year: number | null; text: string } | null;
  end: { month: number | null; year: number | null; text: string } | null;
  isCurrent: boolean;
  /** LinkedIn's own wording for the duration -- never recomputed, so this
   * API never disagrees with what the site itself says. */
  text: string;
  durationMonths: number | null;
}

export interface Location {
  full: string | null;
  country: string | null;
  countryCode: string | null;
  postalCode: string | null;
}

export interface ExperienceEntry {
  title: string | null;
  companyName: string | null;
  companyLinkedInUrl: string | null;
  companyLogo: ImageAsset | null;
  employmentType: string | null;
  location: string | null;
  description: string | null;
  dateRange: DateRange | null;
}

export interface EducationEntry {
  schoolName: string | null;
  degreeName: string | null;
  fieldOfStudy: string | null;
  grade: string | null;
  schoolLogo: ImageAsset | null;
  dateRange: DateRange | null;
}

export interface SkillEntry {
  name: string;
  endorsementCount: number | null;
}

export interface CertificationEntry {
  name: string | null;
  authority: string | null;
  url: string | null;
  dateRange: DateRange | null;
}

export interface LanguageEntry {
  name: string;
  proficiency: string | null;
}

export interface SimpleTimelineEntry {
  title: string | null;
  description: string | null;
  url: string | null;
  dateRange: DateRange | null;
}

export interface ProfileData {
  publicIdentifier: string;
  profileUrl: string;

  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  headline: string | null;
  summary: string | null;

  location: Location;

  followersCount: number | null;
  connectionsCount: number | null;

  profilePicture: ImageAsset | null;
  backgroundPicture: ImageAsset | null;

  experience: ExperienceEntry[];
  education: EducationEntry[];
  skills: SkillEntry[];
  certifications: CertificationEntry[];
  languages: LanguageEntry[];
  projects: SimpleTimelineEntry[];
  volunteerExperience: SimpleTimelineEntry[];
  honors: SimpleTimelineEntry[];
  courses: SimpleTimelineEntry[];
  organizations: SimpleTimelineEntry[];
  publications: SimpleTimelineEntry[];
  patents: SimpleTimelineEntry[];
  testScores: SimpleTimelineEntry[];

  connectionDegree: string | null;
  industry: null;
  isStudent: null;
  isPremium: null;
  /** Always null. mwlite embeds a member URN, but it's the *viewer's*,
   * byte-identical across different people's profiles -- a confident wrong
   * id is worse than an honest empty one. See parse.ts. */
  profileId: null;
  contactInfo: null;
}

export interface ProfileMeta {
  source: "linkedin" | "mock";
  cached: boolean;
  fetchedAt: string;
  durationMs: number;
}

export interface ProfileResponse {
  success: true;
  meta: ProfileMeta;
  data: ProfileData;
  warnings?: string[];
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    requestId?: string;
  };
}
