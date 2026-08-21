"use client";

import Panel from "./Panel";
import { ChartIcon } from "./icons";
import { usePanelData } from "@/hooks/usePanelData";
import { REFRESH_MS } from "@/lib/config";
import type { ConnectionState, Portfolio } from "@/lib/providers/etrade/types";

const money = (value: number) =>
  value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const signed = (value: number) =>
  `${value >= 0 ? "+" : "−"}${Math.abs(value).toLocaleString(undefined, {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  })}`;

const pct = (value: number) => `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(2)}%`;

const UP = "#43cf9c";
const DOWN = "#e0709a";

export default function PortfolioPanel({ className }: { className?: string }) {
  const state = usePanelData<{ portfolio: Portfolio; state: ConnectionState }>(
    "/api/etrade/portfolio",
    { refreshMs: REFRESH_MS.portfolio },
  );

  const payload = state.status === "ready" ? state.data : null;
  const portfolio = payload?.portfolio;
  const connection = payload?.state;
  const up = (portfolio?.dayChange ?? 0) >= 0;
  // A watchlist with no shares in it has no total to show — only movements.
  const holdsShares = (portfolio?.totalValue ?? 0) > 0;

  return (
    <Panel
      title="Portfolio"
      icon={<ChartIcon className="size-full" />}
      accent="#b28df0"
      meta={portfolio?.accountLabel}
      delay={300}
      className={className}
      loading={state.status === "loading"}
      error={state.status === "error" ? state.message : null}
      onRetry={state.refresh}
      stale={state.status === "ready" && state.stale}
      degraded={portfolio?.degraded}
    >
      {portfolio && (
        <>
          {connection && !connection.connected && <ConnectionNotice state={connection} />}

          {holdsShares && (
            <div className="px-3 pt-1 pb-4">
              <p className="font-mono text-3xl font-semibold tracking-tight text-mist-100 tabular-nums">
                {money(portfolio.totalValue)}
              </p>
              <p
                className="mt-1 flex items-center gap-2 text-sm font-medium tabular-nums"
                style={{ color: up ? UP : DOWN }}
              >
                <span>{signed(portfolio.dayChange)}</span>
                <span className="opacity-70">{pct(portfolio.dayChangePct)}</span>
                <span className="text-[11px] tracking-wide text-mist-400 uppercase">today</span>
              </p>
            </div>
          )}

          <ul className="flex flex-col gap-1">
            {portfolio.positions.map((position) => {
              const positive = position.dayChangePct >= 0;
              return (
                <li key={position.symbol}>
                  <article className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-ink-800/70">
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-sm font-semibold text-mist-100">
                        {position.symbol}
                      </span>
                      <span className="block truncate text-[11px] text-mist-400">
                        {position.quantity > 0
                          ? `${position.quantity} sh · ${money(position.lastPrice)}`
                          : `${money(position.lastPrice)} · watching`}
                      </span>
                    </span>

                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-medium text-mist-200 tabular-nums">
                        {position.quantity > 0 ? money(position.marketValue) : signed(position.dayChange)}
                      </span>
                      <span
                        className="block text-[11px] font-medium tabular-nums"
                        style={{ color: positive ? UP : DOWN }}
                      >
                        {pct(position.dayChangePct)}
                      </span>
                    </span>

                    {/* Day move as a bar, so the outliers read before the numbers do. */}
                    <span className="h-8 w-1 shrink-0 overflow-hidden rounded-full bg-ink-700">
                      <span
                        className="block w-full rounded-full transition-[height]"
                        style={{
                          height: `${Math.min(100, Math.abs(position.dayChangePct) * 20)}%`,
                          marginTop: positive ? `${100 - Math.min(100, Math.abs(position.dayChangePct) * 20)}%` : 0,
                          background: positive ? UP : DOWN,
                        }}
                      />
                    </span>
                  </article>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Panel>
  );
}

function ConnectionNotice({ state }: { state: Extract<ConnectionState, { connected: false }> }) {
  const copy = {
    "no-credentials": {
      text: state.live
        ? "Live prices on the watchlist in src/lib/config.ts. Add an E*TRADE key to see your real account instead."
        : "Showing sample positions — the quote service is unreachable.",
      action: null,
    },
    "not-connected": {
      text: "Live prices on your watchlist. Connect to load your real positions and cost basis.",
      action: "Connect E*TRADE",
    },
    expired: {
      text: "E*TRADE signs you out at midnight Eastern every night. Watchlist prices are live meanwhile.",
      action: "Reconnect",
    },
  }[state.reason];

  return (
    <div className="mx-3 mb-3 rounded-xl border border-[#b28df0]/25 bg-[#b28df0]/8 px-3 py-2.5">
      <p className="text-[12px] leading-relaxed text-mist-300">{copy.text}</p>
      {copy.action && (
        <a
          href="/api/etrade/connect"
          className="mt-2 inline-block rounded-lg bg-[#b28df0]/18 px-2.5 py-1 text-[11px] font-semibold text-[#b28df0] transition-colors hover:bg-[#b28df0]/28 focus-visible:ring-2 focus-visible:ring-[#b28df0] focus-visible:outline-none"
        >
          {copy.action}
        </a>
      )}
    </div>
  );
}
