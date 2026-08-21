"use client";

import { useEffect } from "react";

/**
 * The whole dashboard failing is the one state the per-panel error handling
 * can't cover. Say so plainly and offer the only useful action.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[briefing]", error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <p className="font-mono text-[11px] tracking-[0.34em] text-[#5cc8de] uppercase">
        Morning Briefing
      </p>
      <h1 className="text-2xl font-semibold text-mist-100">The briefing didn&apos;t load.</h1>
      <p className="max-w-md text-sm leading-relaxed text-mist-300">
        Something failed before any panel could render. The panels handle their own
        upstream failures, so this is usually the app itself — the console has the detail.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-lg border border-ink-600 px-4 py-2 text-xs font-medium tracking-wide text-mist-200 uppercase transition-colors hover:border-mist-400 hover:text-mist-100 focus-visible:ring-2 focus-visible:ring-[#5cc8de] focus-visible:outline-none"
      >
        Try again
      </button>
      {error.digest && (
        <p className="font-mono text-[11px] text-mist-400">digest {error.digest}</p>
      )}
    </main>
  );
}
