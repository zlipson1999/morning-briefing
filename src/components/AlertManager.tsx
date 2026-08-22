"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useLocation } from "@/hooks/useLocation";
import type { NewsBundle } from "@/lib/providers/news";
import type { ConnectionState, Portfolio } from "@/lib/providers/etrade";

const ENABLED_KEY = "mb:alerts";
const SEEN_KEY = "mb:alert-seen";
const listeners = new Set<() => void>();
let enabledSnapshot = false;

function readEnabled() {
  try { return localStorage.getItem(ENABLED_KEY) === "1"; } catch { return false; }
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  enabledSnapshot = readEnabled();
  return () => { listeners.delete(onChange); };
}

function setEnabled(value: boolean) {
  enabledSnapshot = value;
  try { localStorage.setItem(ENABLED_KEY, value ? "1" : "0"); } catch { /* private mode */ }
  for (const listener of listeners) listener();
}

function seen(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]")); } catch { return new Set(); }
}

function remember(ids: Set<string>) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...ids].slice(-100))); } catch { /* private mode */ }
}

const BREAKING = /\b(breaking|warning|emergency|evacuat|tornado|hurricane|flood|fire|shooting|closure|outage|boil water|shelter)\b/i;

export default function AlertManager() {
  const location = useLocation();
  const enabled = useSyncExternalStore(subscribe, () => enabledSnapshot, () => false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    queueMicrotask(() => setPermission("Notification" in window ? Notification.permission : "unsupported"));
  }, []);

  useEffect(() => {
    if (!enabled || permission !== "granted") return;
    let disposed = false;
    const poll = async () => {
      const known = seen();
      try {
        const response = await fetch(`/api/news?place=${encodeURIComponent(location.label)}`);
        const payload = await response.json() as { data?: NewsBundle };
        const recent = (payload.data?.local ?? []).filter((headline) =>
          headline.publishedAt !== null && Date.now() - headline.publishedAt < 45 * 60_000 && BREAKING.test(headline.title),
        );
        for (const headline of recent) {
          const id = `news:${headline.id}`;
          if (!known.has(id) && !disposed) {
            new Notification(`Breaking near ${location.label}`, { body: headline.title, icon: "/icon.svg", tag: id });
            known.add(id);
          }
        }
      } catch { /* the dashboard already reports provider failures */ }

      try {
        const response = await fetch("/api/etrade/portfolio");
        const payload = await response.json() as { data?: { portfolio: Portfolio; state: ConnectionState } };
        const data = payload.data;
        if (data?.state.connected && data.portfolio.mode === "live") {
          const movers = data.portfolio.positions.filter((position) => Math.abs(position.dayChangePct) >= 5);
          for (const mover of movers) {
            const direction = mover.dayChangePct >= 0 ? "up" : "down";
            const id = `portfolio:${mover.symbol}:${direction}:${Math.floor(Math.abs(mover.dayChangePct))}`;
            if (!known.has(id) && !disposed) {
              new Notification(`${mover.symbol} is moving`, {
                body: `${mover.symbol} is ${direction} ${Math.abs(mover.dayChangePct).toFixed(1)}% today.`,
                icon: "/icon.svg",
                tag: id,
              });
              known.add(id);
            }
          }
        }
      } catch { /* dormant until E*TRADE is connected */ }
      remember(known);
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 5 * 60_000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [enabled, permission, location.label]);

  async function toggle() {
    if (!("Notification" in window)) return;
    if (!enabled) {
      const next = await Notification.requestPermission();
      setPermission(next);
      if (next === "granted") setEnabled(true);
    } else {
      setEnabled(false);
    }
  }

  if (permission === "unsupported") return null;
  return (
    <button
      type="button"
      onClick={() => void toggle()}
      aria-pressed={enabled}
      title="Alerts run while Miles is open or installed."
      className="phone-safe-left fixed z-40 rounded-full border border-ink-600 bg-ink-850/95 px-4 py-3 text-xs font-semibold text-mist-300 shadow-xl backdrop-blur hover:border-mail/60 hover:text-mist-100"
    >
      {enabled ? "Alerts on" : "Enable alerts"}
    </button>
  );
}

