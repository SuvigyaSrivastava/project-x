// Minimal inline-SVG icon set -- kept local so the app has zero icon-package
// dependency. Each icon accepts standard SVG props via className/size.

type IconProps = { className?: string; strokeWidth?: number };

export function SearchIcon({ className, strokeWidth = 1.75 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth={strokeWidth} />
      <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}

export function ArrowRightIcon({ className, strokeWidth = 1.75 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MapPinIcon({ className, strokeWidth = 1.75 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 22s7-6.1 7-12a7 7 0 10-14 0c0 5.9 7 12 7 12z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth={strokeWidth} />
    </svg>
  );
}

export function UsersIcon({ className, strokeWidth = 1.75 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="9" cy="8" r="3.25" stroke="currentColor" strokeWidth={strokeWidth} />
      <path d="M3.5 20c.7-3.4 3-5.2 5.5-5.2s4.8 1.8 5.5 5.2" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
      <path d="M15.5 5.2c1.5.4 2.6 1.7 2.6 3.3 0 1.6-1.1 2.9-2.6 3.3M18 14.9c2 .5 3.5 2.1 4 4.9" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}

export function BriefcaseIcon({ className, strokeWidth = 1.75 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="3" y="7.5" width="18" height="12" rx="2" stroke="currentColor" strokeWidth={strokeWidth} />
      <path d="M8 7.5V6a2 2 0 012-2h4a2 2 0 012 2v1.5" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
      <path d="M3 12.5h18" stroke="currentColor" strokeWidth={strokeWidth} />
    </svg>
  );
}

export function GraduationCapIcon({ className, strokeWidth = 1.75 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M2 9l10-4.5L22 9l-10 4.5L2 9z" stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" />
      <path d="M6 11.3V16c0 1.4 2.7 2.6 6 2.6s6-1.2 6-2.6v-4.7" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 9v6" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}

export function SparkIcon({ className, strokeWidth = 1.75 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AlertIcon({ className, strokeWidth = 1.75 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M12 9v4.5" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
      <circle cx="12" cy="16.2" r="0.9" fill="currentColor" />
      <path
        d="M10.3 3.9L2.6 18a1.7 1.7 0 001.5 2.5h15.8a1.7 1.7 0 001.5-2.5L13.7 3.9a1.7 1.7 0 00-3.4 0z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ClockIcon({ className, strokeWidth = 1.75 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={strokeWidth} />
      <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CopyIcon({ className, strokeWidth = 1.75 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="9" y="9" width="12" height="12" rx="2" stroke="currentColor" strokeWidth={strokeWidth} />
      <path d="M15 9V5a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2h4" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CheckIcon({ className, strokeWidth = 2 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M5 13l4.5 4.5L19 7" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LinkIcon({ className, strokeWidth = 1.75 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M9.5 14.5l5-5M8.2 16.8l-1.8 1.8a3.5 3.5 0 01-5-5l3-3a3.5 3.5 0 015-.3M15.8 7.2L17.6 5.4a3.5 3.5 0 015 5l-3 3a3.5 3.5 0 01-5 .3"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CodeIcon({ className, strokeWidth = 1.75 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M8.5 8L4 12l4.5 4M15.5 8L20 12l-4.5 4M13.5 5l-3 14" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
