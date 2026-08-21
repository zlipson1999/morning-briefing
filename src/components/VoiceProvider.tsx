"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useBriefingVoice, type SpeakMode, type VoiceSource, type VoiceState } from "@/hooks/useBriefingVoice";
import { useBriefedToday } from "@/lib/briefedToday";
import BootSequence from "./BootSequence";

type VoiceContextValue = {
  state: VoiceState;
  /** Which engine is talking: the server's voice, or the browser's own. */
  voiceSource: VoiceSource;
  muted: boolean;
  speak: (options?: { force?: boolean; mode?: SpeakMode }) => void;
  stop: () => void;
  toggleMute: () => void;
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
  const [skipped, setSkipped] = useState(false);
  const booting = !briefedToday && !skipped;

  useEffect(() => {
    speak();
  }, [speak]);

  const value = useMemo(
    () => ({ state, voiceSource, muted, speak, stop, toggleMute }),
    [state, voiceSource, muted, speak, stop, toggleMute],
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
