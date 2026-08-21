"use client";

import { useClock } from "@/lib/useClock";

/**
 * What a panel says about where its data came from.
 *
 * Two failure modes this exists to prevent, both of which look like a quiet
 * day rather than a bug:
 *
 *   - sample data presented as if it were yours;
 *   - a Zap that stopped firing, leaving yesterday's push on screen as
 *     though it were today's.
 *
 * A calendar that silently shows stale data is the worst version of this,
 * which is why the staleness threshold is a day rather than a week.
 */
export default function SourceNotice({
  source,
  syncedAt,
  accent,
  noun,
  endpoint,
  staleAfterMs = 24 * 60 * 60_000,
}: {
  source: "zapier" | "sample";
  syncedAt: number | null;
  accent: string;
  /** What this panel shows, e.g. "day", "task list", "inbox". */
  noun: string;
  endpoint: string;
  staleAfterMs?: number;
}) {
  // Read through the shared clock rather than Date.now(): this renders during
  // the render pass, and the clock is the one source of "now" that ticks
  // without making the component impure.
  const nowMs = useClock();

  if (source === "sample") {
    return (
      <Notice accent={accent}>
        Showing a sample {noun}. Point a Zap at{" "}
        <code className="rounded bg-ink-800 px-1 py-0.5 text-[11px]">{endpoint}</code> to see your
        real one.
      </Notice>
    );
  }

  if (syncedAt === null || nowMs === null) return null;

  const age = nowMs - syncedAt;
  if (age < staleAfterMs) return null;

  return (
    <Notice accent="#e0709a">
      Last synced {describeAge(age)}. The Zap pushing your {noun} may have stopped — what&apos;s
      below is not today&apos;s.
    </Notice>
  );
}

function Notice({ accent, children }: { accent: string; children: React.ReactNode }) {
  return (
    <p
      className="mx-3 mb-2 rounded-lg border px-3 py-2 text-[11px] leading-relaxed text-mist-300"
      style={{
        borderColor: `color-mix(in oklab, ${accent} 28%, transparent)`,
        background: `color-mix(in oklab, ${accent} 8%, transparent)`,
      }}
    >
      {children}
    </p>
  );
}

function describeAge(ms: number): string {
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 48) return `${hours} hours ago`;
  return `${Math.floor(hours / 24)} days ago`;
}
