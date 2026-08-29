export function ProfileSkeleton() {
  return (
    <div className="w-full animate-fade-up rounded-3xl border border-border bg-surface/60 p-6 shadow-card backdrop-blur sm:p-8">
      <div className="flex items-start gap-5">
        <div className="shimmer h-20 w-20 shrink-0 rounded-2xl" />
        <div className="flex-1 space-y-3 pt-1">
          <div className="shimmer h-5 w-48 rounded-md" />
          <div className="shimmer h-3.5 w-64 rounded-md" />
          <div className="shimmer h-3 w-32 rounded-md" />
        </div>
      </div>
      <div className="mt-8 space-y-2.5">
        <div className="shimmer h-3 w-full rounded-md" />
        <div className="shimmer h-3 w-5/6 rounded-md" />
        <div className="shimmer h-3 w-2/3 rounded-md" />
      </div>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <div className="shimmer h-16 rounded-xl" />
        <div className="shimmer h-16 rounded-xl" />
      </div>
    </div>
  );
}
