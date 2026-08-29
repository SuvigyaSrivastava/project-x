"use client";

import { useEffect, useState } from "react";
import { ProfileView } from "@/components/ProfileView";
import { ProfileSkeleton } from "@/components/Skeleton";
import {
  AlertIcon,
  ArrowRightIcon,
  CheckIcon,
  ClockIcon,
  CodeIcon,
  CopyIcon,
  LinkIcon,
  SearchIcon,
} from "@/components/icons";
import type { ApiErrorResponse, ProfileApiResponse } from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const EXAMPLE_URL = "https://www.linkedin.com/in/williamhgates";

type ErrorState = { message: string; code?: string } | null;

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ProfileApiResponse | null>(null);
  const [error, setError] = useState<ErrorState>(null);
  const [showJson, setShowJson] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  async function runLookup(targetUrl: string) {
    if (!targetUrl.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setShowJson(false);
    try {
      const res = await fetch(`${API_BASE}/api/profile?url=${encodeURIComponent(targetUrl.trim())}`);
      const body = await res.json();
      if (!res.ok || body.success === false) {
        const err = body as ApiErrorResponse;
        setError({ message: err.error?.message ?? `Request failed (${res.status})`, code: err.error?.code });
      } else {
        setResult(body as ProfileApiResponse);
      }
    } catch {
      setError({ message: "Could not reach the API. If it's on a free instance it may be waking up (~50s) — try again shortly." });
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void runLookup(url);
  }

  function handleCopy() {
    if (!result) return;
    navigator.clipboard.writeText(JSON.stringify(result, null, 2)).then(() => setCopied(true));
  }

  const hasContent = loading || result || error;

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-canvas">
      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0 bg-grid-fade" />
      <div className="pointer-events-none fixed left-1/2 top-[-10%] h-[480px] w-[720px] -translate-x-1/2 rounded-full bg-accent/10 blur-[120px]" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center px-5 py-16 sm:py-24">
        {/* Header */}
        <div className={`flex flex-col items-center text-center transition-all duration-500 ${hasContent ? "mb-8" : "mb-12"}`}>
          <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-white/[0.03] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-dim">
            <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-glow" />
            Profile Lookup API
          </span>
          <h1 className="font-display text-[2.15rem] font-medium leading-[1.1] tracking-tight text-ink sm:text-[2.75rem]">
            Any public profile,
            <br />
            <span className="italic text-ink-dim">structured in a second.</span>
          </h1>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-ink-faint">
            Paste a LinkedIn profile URL below and get a clean, typed read-out — experience, education, and
            skills, ready to use.
          </p>
        </div>

        {/* Search */}
        <form onSubmit={handleSubmit} className="w-full">
          <div
            className={`group flex items-center gap-2 rounded-2xl border bg-surface/70 p-1.5 pl-4 shadow-card backdrop-blur transition-colors ${
              loading ? "border-border-strong" : "border-border focus-within:border-accent/60"
            }`}
          >
            <SearchIcon className="h-4 w-4 shrink-0 text-ink-faint" />
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="linkedin.com/in/williamhgates"
              disabled={loading}
              className="min-w-0 flex-1 bg-transparent py-2.5 text-[14.5px] text-ink placeholder:text-ink-faint focus:outline-none disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={loading || !url.trim()}
              className="flex shrink-0 items-center gap-1.5 rounded-xl bg-ink px-4 py-2.5 text-[13.5px] font-medium text-canvas transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-canvas/30 border-t-canvas" />
                  Looking up
                </>
              ) : (
                <>
                  Look up
                  <ArrowRightIcon className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </div>

          {!hasContent && (
            <button
              type="button"
              onClick={() => {
                setUrl(EXAMPLE_URL);
                void runLookup(EXAMPLE_URL);
              }}
              className="mx-auto mt-4 flex items-center gap-1.5 text-[13px] text-ink-faint transition-colors hover:text-ink-dim"
            >
              <LinkIcon className="h-3 w-3" />
              Try an example profile
            </button>
          )}
        </form>

        {/* Result area */}
        <div className="mt-8 w-full">
          {loading && <ProfileSkeleton />}

          {error && (
            <div className="flex animate-fade-up items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/[0.06] p-4">
              <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <div className="min-w-0">
                <p className="text-[13.5px] leading-relaxed text-red-200/90">{error.message}</p>
                {error.code && (
                  <p className="mt-1 font-mono text-[11px] uppercase tracking-wide text-red-400/60">{error.code}</p>
                )}
              </div>
            </div>
          )}

          {result && (
            <div className="flex flex-col items-center gap-4">
              <ProfileView data={result.data} />

              {/* Meta bar */}
              <div className="flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface/40 px-4 py-3">
                <div className="flex flex-wrap items-center gap-3 text-[12px] text-ink-faint">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        result.meta.source === "mock" ? "bg-accent-2" : "bg-emerald-400"
                      }`}
                    />
                    {result.meta.source === "mock" ? "Mock data" : "Live source"}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <ClockIcon className="h-3 w-3" />
                    {result.meta.cached ? "Served from cache" : `${result.meta.durationMs}ms`}
                  </span>
                </div>
                <button
                  onClick={() => setShowJson((v) => !v)}
                  className="inline-flex items-center gap-1.5 text-[12px] text-ink-faint transition-colors hover:text-ink-dim"
                >
                  <CodeIcon className="h-3 w-3" />
                  {showJson ? "Hide" : "View"} raw JSON
                </button>
              </div>

              {showJson && (
                <div className="w-full animate-fade-up overflow-hidden rounded-2xl border border-border bg-[#0a0b0d]">
                  <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                    <span className="font-mono text-[11px] text-ink-faint">response.json</span>
                    <button
                      onClick={handleCopy}
                      className="inline-flex items-center gap-1.5 text-[11px] text-ink-faint transition-colors hover:text-ink-dim"
                    >
                      {copied ? (
                        <>
                          <CheckIcon className="h-3 w-3 text-emerald-400" />
                          Copied
                        </>
                      ) : (
                        <>
                          <CopyIcon className="h-3 w-3" />
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="max-h-96 overflow-auto p-4 font-mono text-[12px] leading-relaxed text-ink-dim">
                    {JSON.stringify(result, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="mt-auto flex w-full flex-col items-center gap-1 pt-16 text-center text-[12px] text-ink-faint">
          <p>Reads only public profile data. No login automation, no CAPTCHA bypass.</p>
        </footer>
      </div>
    </main>
  );
}
