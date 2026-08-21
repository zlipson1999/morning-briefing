"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

export type VoiceState = "idle" | "loading" | "speaking" | "blocked" | "unsupported";

const MUTE_KEY = "mb:voice-muted";

/** Voices that read closest to a calm synthetic assistant, best first. */
const PREFERRED = [
  "Google UK English Male",
  "Microsoft Guy Online",
  "Microsoft Ryan Online",
  "Daniel",
  "Arthur",
  "Google US English",
];

function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const english = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  if (english.length === 0) return null;
  for (const name of PREFERRED) {
    const match = english.find((v) => v.name === name);
    if (match) return match;
  }
  return english.find((v) => /male|daniel|alex|fred/i.test(v.name)) ?? english[0];
}

/**
 * The mute preference is external state (localStorage), so it is read through
 * useSyncExternalStore rather than copied into React state in an effect. That
 * keeps server and first client render identical, and syncs across tabs.
 */
const muteListeners = new Set<() => void>();
let muteSnapshot = false;

function readMutedRaw(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

function subscribeMuted(onChange: () => void) {
  muteListeners.add(onChange);
  muteSnapshot = readMutedRaw();

  const onStorage = (event: StorageEvent) => {
    if (event.key !== MUTE_KEY) return;
    muteSnapshot = readMutedRaw();
    for (const listener of muteListeners) listener();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    muteListeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function writeMuted(next: boolean) {
  try {
    localStorage.setItem(MUTE_KEY, next ? "1" : "0");
  } catch {
    /* private mode — the preference just won't persist */
  }
  muteSnapshot = next;
  for (const listener of muteListeners) listener();
}

const subscribeSupport = () => () => {};

export function useBriefingVoice() {
  const [state, setState] = useState<VoiceState>("idle");
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const startedRef = useRef(false);

  const muted = useSyncExternalStore(subscribeMuted, () => muteSnapshot, () => false);
  const supported = useSyncExternalStore(
    subscribeSupport,
    () => typeof window !== "undefined" && "speechSynthesis" in window,
    () => true,
  );

  useEffect(() => {
    if (!supported) return;

    // getVoices() is empty until the engine loads them, on most browsers.
    const load = () => {
      voicesRef.current = window.speechSynthesis.getVoices();
    };
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);

    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", load);
      window.speechSynthesis.cancel();
    };
  }, [supported]);

  const stop = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setState("idle");
  }, []);

  const toggleMute = useCallback(() => {
    const next = !muteSnapshot;
    writeMuted(next);
    if (next) stop();
  }, [stop]);

  /**
   * Fetches the briefing and reads it.
   *
   * Split into sentences deliberately: Chrome stops synthesising a single
   * long utterance after roughly fifteen seconds, and a queue of short ones
   * is the standard way around it. It also lets `cancel()` stop promptly.
   */
  const speak = useCallback(
    async (options: { force?: boolean } = {}) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        setState("unsupported");
        return;
      }
      if (!options.force && muteSnapshot) return;
      if (startedRef.current && !options.force) return;
      startedRef.current = true;

      setState("loading");
      let text: string;
      try {
        const res = await fetch("/api/briefing");
        if (!res.ok) throw new Error(String(res.status));
        text = await res.text();
      } catch {
        setState("idle");
        return;
      }

      const synth = window.speechSynthesis;
      synth.cancel();

      const voice = pickVoice(voicesRef.current.length ? voicesRef.current : synth.getVoices());
      const chunks = text
        .split(/(?<=[.!?])\s+|\n+/)
        .map((s) => s.trim())
        .filter(Boolean);

      if (chunks.length === 0) {
        setState("idle");
        return;
      }

      let spokeAnything = false;

      chunks.forEach((chunk, index) => {
        const utterance = new SpeechSynthesisUtterance(chunk);
        if (voice) utterance.voice = voice;
        utterance.rate = 0.97;
        utterance.pitch = 0.85;
        utterance.volume = 1;

        utterance.onstart = () => {
          spokeAnything = true;
          setState("speaking");
        };
        if (index === chunks.length - 1) {
          utterance.onend = () => setState("idle");
        }
        utterance.onerror = (event) => {
          // "not-allowed" means the browser wants a user gesture first.
          if (event.error === "not-allowed") setState("blocked");
          else if (!spokeAnything && index === 0) setState("idle");
        };

        synth.speak(utterance);
      });

      // Some browsers accept the queue then silently never start it.
      window.setTimeout(() => {
        if (!spokeAnything) setState((current) => (current === "loading" ? "blocked" : current));
      }, 1800);
    },
    [],
  );

  return { state: supported ? state : ("unsupported" as VoiceState), muted, speak, stop, toggleMute };
}
