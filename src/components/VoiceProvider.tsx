"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useBriefingVoice, type SpeakMode, type VoiceSource, type VoiceState } from "@/hooks/useBriefingVoice";
import { useWakeWord, type WakeWordState } from "@/hooks/useWakeWord";
import { useBriefedToday, useIsEvening } from "@/lib/briefedToday";
import { interpretWakeCommand } from "@/lib/wakeCommands";
import BootSequence from "./BootSequence";

type VoiceContextValue = {
  state: VoiceState;
  /** Which engine is talking: the server's voice, or the browser's own. */
  voiceSource: VoiceSource;
  muted: boolean;
  speak: (options?: { force?: boolean; mode?: SpeakMode }) => void;
  stop: () => void;
  toggleMute: () => void;
  /** "Hey Miles" — hands-free activation while the tab is open. */
  wakeState: WakeWordState;
  toggleWake: () => void;
};

const VoiceContext = createContext<VoiceContextValue | null>(null);

export function useVoice(): VoiceContextValue {
  const value = useContext(VoiceContext);
  if (!value) throw new Error("useVoice must be used inside <VoiceProvider>");
  return value;
}

/**
 * Owns the boot overlay and the speech session, and shares the latter so the
 * header can mute or replay it.
 *
 * The reactor and the full briefing are a once-a-day event. Every open after
 * the first gets the short update and goes straight to the dashboard: by the
 * afternoon you know what today looks like, and a start-up sequence you have
 * already watched is a gate, not a flourish.
 *
 * Speech is attempted as the reactor spins up rather than after, so that a
 * browser refusing it without a gesture is discovered while the boot screen
 * is still up — that screen is where we can ask for the tap.
 */
export default function VoiceProvider({ children }: { children: ReactNode }) {
  const { state, voiceSource, muted, speak, stop, toggleMute } = useBriefingVoice();

  const briefedToday = useBriefedToday();
  const isEvening = useIsEvening();
  const [skipped, setSkipped] = useState(false);
  // The reactor is the start of the morning ritual. A first visit after 8pm
  // goes straight to the dashboard while the wind-down begins.
  const booting = !briefedToday && !isEvening && !skipped;

  useEffect(() => {
    speak();
  }, [speak]);

  const onWake = useCallback(
    (command: string) => {
      const intent = interpretWakeCommand(command);
      switch (intent.kind) {
        case "stop":
          stop();
          break;
        case "mute":
          if (!muted) toggleMute();
          break;
        case "unmute":
          if (muted) toggleMute();
          break;
        case "speak":
          // Force past mute and past the once-per-load guard: being asked out
          // loud is the clearest possible user gesture. Asking for "what now"
          // before the morning has ever played gets the morning instead.
          speak({
            force: true,
            mode: intent.mode === "now" && !briefedToday ? "morning" : intent.mode,
          });
          break;
      }
    },
    [speak, stop, muted, toggleMute, briefedToday],
  );

  // Paused while the app itself talks, so it can't hear its own voice say
  // its own name and loop.
  const { state: wakeState, toggle: toggleWake } = useWakeWord({
    onWake,
    paused: state === "speaking" || state === "loading",
  });

  const value = useMemo(
    () => ({ state, voiceSource, muted, speak, stop, toggleMute, wakeState, toggleWake }),
    [state, voiceSource, muted, speak, stop, toggleMute, wakeState, toggleWake],
  );

  return (
    <VoiceContext.Provider value={value}>
      {booting && (
        <BootSequence
          voiceState={state}
          onDone={() => setSkipped(true)}
          onRequestVoice={() => speak({ force: true })}
        />
      )}
      {children}
    </VoiceContext.Provider>
  );
}
