import type { ReactNode } from "react";

type PanelProps = {
  title: string;
  icon: ReactNode;
  accent: string;
  meta?: string;
  children: ReactNode;
  delay?: number;
  className?: string;
  /** Live-data states. Omitted entirely by panels running on static data. */
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  /** Serving a cached value because the last refresh failed. */
  stale?: boolean;
  /** Sources that failed while others succeeded. */
  degraded?: string[];
};

export default function Panel({
  title, icon, accent, meta, children, delay = 0, className = "",
  loading = false, error = null, onRetry, stale = false, degraded,
}: PanelProps) {
  return (
    <section
      className={`rise flex min-h-0 flex-col overflow-hidden rounded-2xl border border-ink-700/80 bg-ink-850/70 shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_18px_40px_-24px_rgba(0,0,0,0.9)] backdrop-blur-sm ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <header className="flex items-center gap-3 border-b border-ink-700/70 px-5 py-4">
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-lg"
          style={{ color: accent, background: `color-mix(in oklab, ${accent} 15%, transparent)` }}
        >
          <span className="block size-[18px]">{icon}</span>
        </span>
        <h2 className="text-[13px] font-semibold tracking-[0.13em] text-mist-200 uppercase">
          {title}
        </h2>
        <span className="ml-auto flex items-center gap-2 text-xs font-medium text-mist-400 tabular-nums">
          {stale && (
            <span
              title="Showing the last good data — the most recent refresh failed."
              className="rounded bg-mail/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-mail uppercase"
            >
              Cached
            </span>
          )}
          {meta}
        </span>
      </header>

      <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {loading ? (
          <PanelSkeleton />
        ) : error ? (
          <PanelError message={error} onRetry={onRetry} />
        ) : (
          <>
            {degraded && degraded.length > 0 && (
              <p className="mx-3 mb-2 rounded-lg border border-mail/25 bg-mail/8 px-3 py-2 text-[11px] leading-relaxed text-mail">
                Couldn&apos;t reach {degraded.join(", ")}. Showing everything else.
              </p>
            )}
            {children}
          </>
        )}
      </div>
    </section>
  );
}

function PanelSkeleton() {
  return (
    <ul className="flex animate-pulse flex-col gap-1" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="flex gap-3 px-3 py-3">
          <span className="size-9 shrink-0 rounded-full bg-ink-700/70" />
          <span className="flex-1 space-y-2 pt-1">
            <span className="block h-3 w-2/3 rounded bg-ink-700/70" />
            <span className="block h-2.5 w-full rounded bg-ink-700/50" />
          </span>
        </li>
      ))}
    </ul>
  );
}

function PanelError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 px-4 py-6">
      <p className="text-sm leading-relaxed text-mist-300">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg border border-ink-600 px-3 py-1.5 text-xs font-medium text-mist-200 transition-colors hover:border-mist-400 hover:text-mist-100 focus-visible:ring-2 focus-visible:ring-cal focus-visible:outline-none"
        >
          Try again
        </button>
      )}
    </div>
  );
}
