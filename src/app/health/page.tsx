"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Check } from "@/lib/health";
import { ASSISTANT_NAME } from "@/lib/config";

type Report = {
  checkedAt: number;
  summary: { ok: number; failing: number; off: number };
  checks: Check[];
};

const TONE: Record<Check["status"], { color: string; label: string }> = {
  ok: { color: "#43cf9c", label: "OK" },
  failing: { color: "#e0709a", label: "Failing" },
  off: { color: "#7c8595", label: "Off" },
};

/**
 * One page that answers "is any of this actually working".
 *
 * Every upstream in this app fails safe, which means a half-broken install is
 * indistinguishable from a working one until you notice a panel is quieter
 * than it should be. This makes it a glance instead.
 */
export default function HealthPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/health");
      if (!res.ok) throw new Error(`The health check itself returned ${res.status}.`);
      setReport(await res.json());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't reach the briefing server.");
    } finally {
      setRunning(false);
    }
  }, []);

  useEffect(() => {
    // Fetching on mount is the documented legitimate use of an effect: every
    // setState inside `run` happens after an await, so nothing cascades.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    run();
  }, [run]);

  const groups = report
    ? [...new Map(report.checks.map((check) => [check.group, true])).keys()]
    : [];

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 px-5 py-10 sm:px-8">
      <header className="rise">
        <p className="font-mono text-[11px] tracking-[0.34em] text-[#5cc8de] uppercase">
          {ASSISTANT_NAME}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-mist-100">Health</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-mist-300">
          Every upstream this dashboard depends on. All of them fail safe, which is why a
          broken one is quiet rather than loud — this is where it stops being quiet.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="rounded-lg border border-ink-600 px-3 py-1.5 text-xs font-medium tracking-wide text-mist-200 uppercase transition-colors hover:border-mist-400 hover:text-mist-100 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-[#5cc8de] focus-visible:outline-none"
        >
          {running ? "Checking…" : "Re-check"}
        </button>

        {report && (
          <p className="text-[13px] text-mist-400 tabular-nums">
            <span style={{ color: TONE.ok.color }}>{report.summary.ok} ok</span>
            {" · "}
            <span style={{ color: report.summary.failing ? TONE.failing.color : undefined }}>
              {report.summary.failing} failing
            </span>
            {" · "}
            <span>{report.summary.off} off</span>
          </p>
        )}
      </div>

      {error && (
        <p className="rounded-xl border border-[#e0709a]/30 bg-[#e0709a]/8 px-4 py-3 text-sm text-mist-200">
          {error}
        </p>
      )}

      {!report && !error && (
        <p className="text-sm text-mist-400">Probing every upstream — this takes a few seconds.</p>
      )}

      {report &&
        groups.map((group) => (
          <section key={group} className="rise">
            <h2 className="mb-2 text-[11px] font-semibold tracking-[0.16em] text-mist-400 uppercase">
              {group}
            </h2>
            <ul className="flex flex-col gap-1">
              {report.checks
                .filter((check) => check.group === group)
                .map((check) => (
                  <li
                    key={`${check.group}:${check.name}`}
                    className="flex items-start gap-3 rounded-xl border border-ink-700/70 bg-ink-850/70 px-4 py-3"
                  >
                    <span
                      className="mt-1.5 size-2 shrink-0 rounded-full"
                      style={{ background: TONE[check.status].color }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-sm font-medium text-mist-100">{check.name}</span>
                        <span
                          className="text-[10px] font-bold tracking-wide uppercase"
                          style={{ color: TONE[check.status].color }}
                        >
                          {TONE[check.status].label}
                        </span>
                        {check.ms !== undefined && (
                          <span className="text-[11px] text-mist-400 tabular-nums">{check.ms}ms</span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-[13px] leading-relaxed text-mist-300">
                        {check.detail}
                      </span>
                    </span>
                  </li>
                ))}
            </ul>
          </section>
        ))}

      <footer className="mt-auto pt-4 text-[11px] text-mist-400">
        <Link href="/" className="hover:text-mist-200">
          ← Back to Miles
        </Link>
      </footer>
    </main>
  );
}
