"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  automaticSpeakMode,
  hasBriefedToday,
  hasWoundDownToday,
  markBriefedToday,
  markWoundDownToday,
  readNowMemory,
  writeNowMemory,
} from "@/lib/briefedToday";

export type VoiceState = "idle" | "loading" | "speaking" | "blocked" | "unsupported";

/** Which engine is actually talking, once one is. */
export type VoiceSource = "server" | "browser" | null;

/**
 * "morning" is the full briefing, played once a day. "now" is the short
 * update every open after that. "evening" is the wind-down — also once a
 * day, triggered by "Hey Miles, goodnight" or the first open past 8pm.
 */
export type SpeakMode = "morning" | "now" | "evening";

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

function canSpeak(): boolean {
  if (typeof window === "undefined") return true;
  return "speechSynthesis" in window || "Audio" in window;
}

export function useBriefingVoice() {
  const [state, setState] = useState<VoiceState>("idle");
  const [voiceSource, setVoiceSource] = useState<VoiceSource>(null);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const startedRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  // What the replay button should repeat, and what to mark once it plays.
  const modeRef = useRef<SpeakMode>("morning");
  // Facts this update covered. Committed only once it actually speaks — an
  // update nobody heard must not count as having been said.
  const pendingKeysRef = useRef<string[]>([]);

  const muted = useSyncExternalStore(subscribeMuted, () => muteSnapshot, () => false);
  const supported = useSyncExternalStore(subscribeSupport, canSpeak, () => true);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

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
  }, []);

  const releaseAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  /** Called the moment the briefing (not a question, not the week ahead) actually starts. */
  const commitSpoken = useCallback(() => {
    if (modeRef.current === "morning") markBriefedToday();
    if (modeRef.current === "evening") markWoundDownToday();
    if (pendingKeysRef.current.length) {
      writeNowMemory(pendingKeysRef.current);
      pendingKeysRef.current = [];
    }
  }, []);

  /** No-op onStart for anything that isn't the daily briefing — a question,
   *  the week ahead — which must never mark today briefed or wound down. */
  const noCommit = useCallback(() => {}, []);

  const stop = useCallback(() => {
    releaseAudio();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setState("idle");
  }, [releaseAudio]);

  // Nothing should keep playing after the page goes away.
  useEffect(() => releaseAudio, [releaseAudio]);

  const toggleMute = useCallback(() => {
    const next = !muteSnapshot;
    writeMuted(next);
    if (next) stop();
  }, [stop]);

  /**
   * Plays the server-rendered briefing audio.
   *
   * Returns false when there is no server voice to use, so the caller can fall
   * through to the browser engine. A rejected play() is the autoplay policy,
   * which is a different thing entirely: the audio exists, the browser just
   * wants a gesture first, so that becomes `blocked` rather than a fallback.
   */
  const playServerAudio = useCallback(async (url: string, onStart: () => void): Promise<boolean> => {
    let blob: Blob;
    try {
      const res = await fetch(url);
      // 501 means no backend is configured — an expected state, not a failure.
      if (!res.ok) return false;
      blob = await res.blob();
      if (blob.size === 0) return false;
    } catch {
      return false;
    }

    releaseAudio();
    const objectUrl = URL.createObjectURL(blob);
    objectUrlRef.current = objectUrl;

    const audio = new Audio(objectUrl);
    audioRef.current = audio;
    audio.onplaying = () => {
      setVoiceSource("server");
      setState("speaking");
      onStart();
    };
    audio.onended = () => {
      setState("idle");
      releaseAudio();
    };

    try {
      await audio.play();
      return true;
    } catch {
      // NotAllowedError: the browser wants a user gesture first.
      setState("blocked");
      return true;
    }
  }, [releaseAudio]);

  /**
   * Reads the briefing with the browser's own engine.
   *
   * Split into sentences deliberately: Chrome stops synthesising a single
   * long utterance after roughly fifteen seconds, and a queue of short ones
   * is the standard way around it. It also lets `cancel()` stop promptly.
   */
  const speakLocally = useCallback((text: string, onStart: () => void) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setState("unsupported");
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
        setVoiceSource("browser");
        setState("speaking");
        onStart();
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
  }, []);

  /**
   * Fetches the briefing and reads it, preferring the server's voice.
   *
   * The text is fetched either way: it is what the browser engine would read,
   * and having it before the audio decision means a failed synthesis costs
   * nothing but the better voice.
   */
  const speak = useCallback(
    async (options: { force?: boolean; mode?: SpeakMode } = {}) => {
      if (!canSpeak()) {
        setState("unsupported");
        return;
      }
      if (!options.force && muteSnapshot) return;
      if (startedRef.current && !options.force) return;
      startedRef.current = true;

      // An explicit mode wins; otherwise the replay button repeats whatever
      // was last played, and the automatic open decides by the day's history —
      // see automaticSpeakMode for the actual rule (kept pure and tested
      // there rather than inlined here).
      const mode: SpeakMode =
        options.mode ??
        (options.force
          ? modeRef.current
          : automaticSpeakMode({
              hour: new Date().getHours(),
              morningPlayed: hasBriefedToday(),
              eveningPlayed: hasWoundDownToday(),
            }));
      modeRef.current = mode;

      setState("loading");

      const params = new URLSearchParams({ mode });
      if (mode === "now") {
        const memory = readNowMemory();
        if (memory?.at) params.set("since", String(memory.at));
        if (memory?.keys.length) params.set("said", memory.keys.join(","));
      }
      const query = params.toString();

      let text: string;
      try {
        const res = await fetch(`/api/briefing?${query}`);
        if (!res.ok) throw new Error(String(res.status));
        text = await res.text();
        pendingKeysRef.current = (res.headers.get("X-Briefing-Keys") ?? "")
          .split(",")
          .filter(Boolean);
      } catch {
        setState("idle");
        return;
      }

      if (await playServerAudio(`/api/briefing/audio?${query}`, commitSpoken)) return;
      speakLocally(text, commitSpoken);
    },
    [playServerAudio, speakLocally, commitSpoken],
  );

  /**
   * Asks Miles a freeform question, grounded in today's data. Never counts as
   * the daily briefing or the wind-down — questions can happen any time.
   */
  const ask = useCallback(
    async (question: string) => {
      if (!canSpeak()) {
        setState("unsupported");
        return;
      }
      setState("loading");
      pendingKeysRef.current = [];

      const q = new URLSearchParams({ q: question }).toString();

      let text: string;
      try {
        const res = await fetch(`/api/ask?${q}`);
        if (!res.ok) throw new Error(String(res.status));
        text = await res.text();
      } catch {
        setState("idle");
        return;
      }

      if (await playServerAudio(`/api/ask/audio?${q}`, noCommit)) return;
      speakLocally(text, noCommit);
    },
    [playServerAudio, speakLocally, noCommit],
  );

  /** "Hey Miles, week ahead" — a Sunday-night glance at the coming week. */
  const weekAhead = useCallback(async () => {
    if (!canSpeak()) {
      setState("unsupported");
      return;
    }
    setState("loading");
    pendingKeysRef.current = [];

    let text: string;
    try {
      const res = await fetch("/api/week");
      if (!res.ok) throw new Error(String(res.status));
      text = await res.text();
    } catch {
      setState("idle");
      return;
    }

    if (await playServerAudio("/api/week/audio", noCommit)) return;
    speakLocally(text, noCommit);
  }, [playServerAudio, speakLocally, noCommit]);

  return {
    state: supported ? state : ("unsupported" as VoiceState),
    voiceSource,
    muted,
    speak,
    ask,
    weekAhead,
    stop,
    toggleMute,
  };
}
