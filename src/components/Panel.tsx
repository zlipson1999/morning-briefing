import type { ReactNode } from "react";

type PanelProps = {
  title: string;
  icon: ReactNode;
  accent: string;
  meta: string;
  children: ReactNode;
  delay?: number;
};

export default function Panel({
  title,
  icon,
  accent,
  meta,
  children,
  delay = 0,
}: PanelProps) {
  return (
    <section
      className="rise flex min-h-0 flex-col overflow-hidden rounded-2xl border border-ink-700/80 bg-ink-850/70 shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_18px_40px_-24px_rgba(0,0,0,0.9)] backdrop-blur-sm"
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
        <span className="ml-auto text-xs font-medium text-mist-400 tabular-nums">
          {meta}
        </span>
      </header>
      <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {children}
      </div>
    </section>
  );
}
