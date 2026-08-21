"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ASSISTANT_NAME } from "@/lib/config";

/**
 * "Hey Miles" — hands-free activation while you're at the computer.
 *
 * Built on the browser's own speech recognition (Chrome and Edge ship it;
 * Firefox doesn't), so there's no key, no audio leaves the machine through
 * this app, and no always-on cloud microphone. The tradeoffs are honest:
 * recognition only runs while the tab is open, the browser shows the
 * recording indicator the whole time — which is a feature, not a bug — and
 * on unsupported browsers the toggle simply doesn't render.
 *
 * Deliberately opt-in and persisted: a dashboard must never turn on the
 * microphone by itself.
 */

const ENABLED_KEY = "mb:wake-word";

export type WakeWordState = "off" | "listening" | "blocked" | "unsupported";

/** Minimal typings — TS's lib.dom has no SpeechRecognition on window. */
type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
};

type RecognitionEvent = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};

function recognitionClass(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => Recognition) | null;
}

/* The enabled preference is external state, read the same way mute is. */
const listeners = new Set<() => void>();
let enabledSnapshot = false;

function readEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

function subscribeEnabled(onChange: () => void) {
  listeners.add(onChange);
  enabledSnapshot = readEnabled();

  const onStorage = (event: StorageEvent) => {
    if (event.key !== ENABLED_KEY) return;
    enabledSnapshot = readEnabled();
    for (const listener of listeners) listener();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function writeEnabled(next: boolean) {
  try {
    localStorage.setItem(ENABLED_KEY, next ? "1" : "0");
  } catch {
    /* private mode — the toggle works, it just won't persist */
  }
  enabledSnapshot = next;
  for (const listener of listeners) listener();
}

/**
 * "hey miles", "okay miles", or "miles" leading the utterance all count —
 * recognition mishears greetings constantly, so the net is deliberately wide.
 * Whatever follows the name is handed to the caller as the command.
 */
export function matchWakeWord(transcript: string, name: string = ASSISTANT_NAME): string | null {
  const text = transcript.toLowerCase().trim();
  const word = name.toLowerCase();

  const led = new RegExp(`^(?:hey|hi|ok|okay)?[,\\s]*${word}\\b[,.!?]*\\s*(.*)$`).exec(text);
  if (led) return led[1].trim();

  const inline = new RegExp(`\\b(?:hey|hi|ok|okay)[,\\s]+${word}\\b[,.!?]*\\s*(.*)$`).exec(text);
  if (inline) return inline[1].trim();

  return null;
}

export function useWakeWord({
  onWake,
  paused = false,
}: {
  /** Called with whatever was said after the name ("" for the name alone). */
  onWake: (command: string) => void;
  /** True while the app itself is talking, so it doesn't hear its own voice. */
  paused?: boolean;
}): { state: WakeWordState; enabled: boolean; toggle: () => void } {
  const enabled = useSyncExternalStore(subscribeEnabled, () => enabledSnapshot, () => false);
  const supported = useSyncExternalStore(
    () => () => {},
    () => recognitionClass() !== null,
    () => true,
  );

  const recognitionRef = useRef<Recognition | null>(null);
  const [blocked, setBlocked] = useState(false);
  const blockedRef = useRef(false);
  const onWakeRef = useRef(onWake);

  useEffect(() => {
    onWakeRef.current = onWake;
  }, [onWake]);

  const shouldRun = enabled && !paused && supported;

  useEffect(() => {
    if (!shouldRun) {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      return;
    }

    const Ctor = recognitionClass();
    if (!Ctor) return;

    let disposed = false;
    const recognition = new Ctor();
    recognitionRef.current = recognition;
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result.isFinal) continue;
        const command = matchWakeWord(result[0].transcript);
        if (command !== null) onWakeRef.current(command);
      }
    };

    recognition.onerror = (event) => {
      // Denied mic permission is terminal; everything else gets a restart.
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        blockedRef.current = true;
        setBlocked(true);
      }
    };

    // Chrome ends continuous recognition every minute or so; restart quietly.
    recognition.onend = () => {
      if (disposed || blockedRef.current) return;
      try {
        recognition.start();
      } catch {
        /* already restarting */
      }
    };

    try {
      recognition.start();
    } catch {
      // A synchronous start failure is the same news as an error event —
      // deliver it the same way, off the render path.
      blockedRef.current = true;
      queueMicrotask(() => setBlocked(true));
    }

    return () => {
      disposed = true;
      recognition.onend = null;
      recognition.abort();
      recognitionRef.current = null;
    };
  }, [shouldRun]);

  const toggle = useCallback(() => {
    blockedRef.current = false;
    setBlocked(false);
    writeEnabled(!enabledSnapshot);
  }, []);

  const state: WakeWordState = !supported
    ? "unsupported"
    : !enabled
      ? "off"
      : blocked
        ? "blocked"
        : paused
          ? "off"
          : "listening";

  return { state, enabled, toggle };
}
