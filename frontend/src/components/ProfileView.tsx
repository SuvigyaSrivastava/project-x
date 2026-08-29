"use client";

import { useState } from "react";
import type { DateRange, ProfileData } from "@/lib/types";
import { AlertIcon, BriefcaseIcon, GraduationCapIcon, MapPinIcon, SparkIcon, UsersIcon } from "./icons";

function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

// Falls back to an initials tile if `src` is missing OR fails to load --
// mock-mode fixture image URLs (media.licdn.com/dms/...) are synthetic and
// 404 in a real browser, so a load-failure fallback is required, not just a
// null check.
function Avatar({ src, name, size = 80 }: { src: string | null; name: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name ?? "Profile photo"}
        width={size}
        height={size}
        onError={() => setFailed(true)}
        className="shrink-0 rounded-2xl border border-border-strong object-cover shadow-lg shadow-black/40"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-2xl border border-border-strong bg-gradient-to-br from-accent/25 via-accent-2/20 to-transparent font-display text-2xl font-medium text-ink shadow-lg shadow-black/40"
      style={{ width: size, height: size }}
    >
      {initials(name)}
    </div>
  );
}

function StatPill({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white/[0.02] px-3 py-1 text-xs text-ink-dim">
      <span className="text-ink-faint">{icon}</span>
      {children}
    </span>
  );
}

function SectionHeading({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white/[0.04] text-ink-dim">{icon}</span>
      <h3 className="text-[13px] font-medium uppercase tracking-[0.08em] text-ink-dim">{title}</h3>
    </div>
  );
}

function Logo({ src, alt }: { src: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        onError={() => setFailed(true)}
        className="h-10 w-10 shrink-0 rounded-lg border border-border object-cover"
      />
    );
  }
  return <div className="h-10 w-10 shrink-0 rounded-lg border border-border bg-white/[0.03]" />;
}

function formatRange(range: DateRange | null): string | null {
  if (!range) return null;
  return range.text || null;
}

export function ProfileView({ data, warnings = [] }: { data: ProfileData; warnings?: string[] }) {
  const hasWarnings = warnings.length > 0;
  return (
    <div className="w-full animate-fade-up overflow-hidden rounded-3xl border border-border bg-surface/60 shadow-card backdrop-blur">
      {/* Header */}
      <div className="relative border-b border-border p-6 sm:p-8">
        <div className="pointer-events-none absolute inset-0 bg-grid-fade opacity-60" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start">
          <Avatar src={data.profilePicture?.original ?? null} name={data.fullName} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h2 className="truncate font-display text-2xl font-medium text-ink sm:text-[1.75rem]">
                {data.fullName ?? "Unknown profile"}
              </h2>
              {hasWarnings && (
                <span
                  title={warnings.join(" ")}
                  className="inline-flex shrink-0 cursor-help items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/[0.08] px-2.5 py-1 text-[11px] font-medium text-amber-300"
                >
                  <AlertIcon className="h-3 w-3" />
                  Unverified
                </span>
              )}
            </div>
            {data.headline && <p className="mt-1 text-[15px] leading-snug text-ink-dim">{data.headline}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {data.location.full && (
                <StatPill icon={<MapPinIcon className="h-3.5 w-3.5" />}>{data.location.full}</StatPill>
              )}
              {data.followersCount !== null && (
                <StatPill icon={<UsersIcon className="h-3.5 w-3.5" />}>
                  {data.followersCount.toLocaleString()} followers
                </StatPill>
              )}
            </div>
          </div>
        </div>
      </div>

      {hasWarnings && (
        <div className="flex items-start gap-2.5 border-b border-amber-500/15 bg-amber-500/[0.04] px-6 py-3 sm:px-8">
          <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
          <p className="text-[12.5px] leading-relaxed text-amber-200/80">
            {warnings[0]}
            {warnings.length > 1 && ` (+${warnings.length - 1} more — see raw JSON)`}
          </p>
        </div>
      )}

      <div className="space-y-8 p-6 sm:p-8">
        {data.summary && (
          <section>
            <SectionHeading icon={<SparkIcon className="h-3.5 w-3.5" />} title="About" />
            <p className="whitespace-pre-line text-[14.5px] leading-relaxed text-ink-dim">{data.summary}</p>
          </section>
        )}

        {data.experience.length > 0 && (
          <section>
            <SectionHeading icon={<BriefcaseIcon className="h-3.5 w-3.5" />} title="Experience" />
            <ul className="space-y-4">
              {data.experience.map((exp, i) => (
                <li key={i} className="flex gap-3.5">
                  <Logo src={exp.companyLogo?.original ?? null} alt={exp.companyName ?? "Company logo"} />
                  <div className="min-w-0 flex-1 border-b border-border/70 pb-4 last:border-0 last:pb-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <p className="text-[14.5px] font-medium text-ink">{exp.title ?? "—"}</p>
                      {formatRange(exp.dateRange) && (
                        <p className="shrink-0 text-xs text-ink-faint">{formatRange(exp.dateRange)}</p>
                      )}
                    </div>
                    <p className="mt-0.5 text-[13.5px] text-ink-dim">
                      {exp.companyName}
                      {exp.employmentType ? ` · ${exp.employmentType}` : ""}
                    </p>
                    {exp.description && (
                      <p className="mt-2 whitespace-pre-line text-[13.5px] leading-relaxed text-ink-faint">
                        {exp.description}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {data.education.length > 0 && (
          <section>
            <SectionHeading icon={<GraduationCapIcon className="h-3.5 w-3.5" />} title="Education" />
            <ul className="space-y-4">
              {data.education.map((edu, i) => (
                <li key={i} className="flex gap-3.5">
                  <Logo src={edu.schoolLogo?.original ?? null} alt={edu.schoolName ?? "School logo"} />
                  <div className="min-w-0 flex-1 border-b border-border/70 pb-4 last:border-0 last:pb-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <p className="text-[14.5px] font-medium text-ink">{edu.schoolName ?? "—"}</p>
                      {formatRange(edu.dateRange) && (
                        <p className="shrink-0 text-xs text-ink-faint">{formatRange(edu.dateRange)}</p>
                      )}
                    </div>
                    {(edu.degreeName || edu.fieldOfStudy) && (
                      <p className="mt-0.5 text-[13.5px] text-ink-dim">
                        {edu.degreeName}
                        {edu.fieldOfStudy ? ` · ${edu.fieldOfStudy}` : ""}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {data.skills.length > 0 && (
          <section>
            <SectionHeading icon={<SparkIcon className="h-3.5 w-3.5" />} title="Skills" />
            <div className="flex flex-wrap gap-2">
              {data.skills.map((s, i) => (
                <span
                  key={i}
                  className="rounded-full border border-border bg-white/[0.03] px-3 py-1.5 text-[13px] text-ink-dim transition-colors hover:border-border-strong hover:text-ink"
                >
                  {s.name}
                  {s.endorsementCount !== null && (
                    <span className="ml-1.5 text-ink-faint">· {s.endorsementCount}</span>
                  )}
                </span>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
