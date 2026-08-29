// A copy of the backend's response schema -- see backend/src/types/profile.ts.
export interface ImageAsset {
  original: string;
  sizes: { url: string; width: number | null; height: number | null }[];
}
export interface DateRange {
  start: { month: number | null; year: number | null; text: string } | null;
  end: { month: number | null; year: number | null; text: string } | null;
  isCurrent: boolean;
  text: string;
  durationMonths: number | null;
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
export interface ProfileData {
  publicIdentifier: string;
  profileUrl: string;
  fullName: string | null;
  headline: string | null;
  summary: string | null;
  location: { full: string | null; country: string | null };
  followersCount: number | null;
  profilePicture: ImageAsset | null;
  experience: ExperienceEntry[];
  education: EducationEntry[];
  skills: { name: string; endorsementCount: number | null }[];
  certifications: { name: string | null; authority: string | null; url: string | null; dateRange: DateRange | null }[];
  languages: { name: string; proficiency: string | null }[];
}
export interface ProfileApiResponse {
  success: true;
  meta: { source: string; cached: boolean; fetchedAt: string; durationMs: number };
  data: ProfileData;
  warnings?: string[];
}
export interface ApiErrorResponse {
  success: false;
  error: { code: string; message: string; requestId?: string };
}
