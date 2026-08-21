"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PanelState } from "@/lib/panel";

/**
 * Fetches one panel's data and models every state it can actually be in:
 * loading, ready, ready-but-stale, ready-but-partially-degraded, and failed.
 *
 * Polling pauses while the tab is hidden — a backgrounded dashboard shouldn't
 * keep hitting upstream APIs all day.
 */
export function usePanelData<T>(
  url: string | null,
  { refreshMs }: { refreshMs: number },
): PanelState<T> & { refresh: () => void } {
  const [state, setState] = useState<PanelState<T>>({ status: "loading" });
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!url) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(url, { signal: controller.signal });
      const body = await res.json();

      if (!res.ok || body?.error) {
        setState({
          status: "error",
          message: body?.error?.message ?? "Something went wrong.",
          retryable: body?.error?.retryable ?? true,
        });
        return;
      }
      setState({ status: "ready", ...body });
    } catch {
      if (controller.signal.aborted) return;
      setState({
        status: "error",
        message: "Couldn't reach the briefing server.",
        retryable: true,
      });
    }
  }, [url]);

  useEffect(() => {
    if (!url) return;

    // Fetching on mount is the documented legitimate use of an effect: the
    // setState calls inside `load` all happen after an await, so they can't
    // cascade the way this rule guards against.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();

    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      stop();
      timer = setInterval(load, refreshMs);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
    };
    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        load();
        start();
      }
    };

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      abortRef.current?.abort();
    };
  }, [url, refreshMs, load]);

  return { ...state, refresh: load };
}
