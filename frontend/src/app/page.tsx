"use client";

import { useState } from "react";
import { ProfileView } from "@/components/ProfileView";
import type { ApiErrorResponse, ProfileApiResponse } from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ProfileApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/profile?url=${encodeURIComponent(url.trim())}`);
      const body = await res.json();
      if (!res.ok || body.success === false) {
        const err = body as ApiErrorResponse;
        setError(err.error?.message ?? `Request failed (${res.status})`);
      } else {
        setResult(body as ProfileApiResponse);
      }
    } catch {
      setError("Could not reach the API. If it's on a free instance it may be waking up (~50s) -- try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-12">
      <h1 className="text-2xl font-bold mb-1">LinkedIn Profile API</h1>
      <p className="text-gray-500 text-sm mb-6">Paste a profile URL, get structured JSON back.</p>

      <form onSubmit={handleSubmit} className="flex gap-2 w-full max-w-2xl mb-8">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.linkedin.com/in/williamhgates"
          className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-black text-white px-5 py-2 text-sm font-medium disabled:opacity-50"
        >
          {loading ? "Looking up…" : "Look up"}
        </button>
      </form>

      {error && (
        <div className="w-full max-w-2xl mb-6 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3">
          {error}
        </div>
      )}

      {result && (
        <div className="w-full max-w-2xl flex flex-col items-center gap-6">
          <ProfileView data={result.data} />
          <details className="w-full">
            <summary className="cursor-pointer text-sm text-gray-500">Raw JSON</summary>
            <pre className="mt-2 bg-gray-900 text-gray-100 text-xs rounded-lg p-4 overflow-x-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </main>
  );
}
