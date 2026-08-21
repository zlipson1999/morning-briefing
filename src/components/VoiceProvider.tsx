"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useBriefingVoice, type VoiceSource, type VoiceState } from "@/hooks/useBriefingVoice";
import BootSequence from "./BootSequence";

type VoiceContextValue = {
  state: VoiceState;
  /** Which engine is talking: the server's voice, or the browser's own. */
  voiceSource: VoiceSource;
  muted: boolean;
  speak: (options?: { force?: boolean }) => void;
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
 * Speech is attempted as the reactor spins up rather than after, so that a
 * browser refusing it without a gesture is discovered while the boot screen
 * is still up — that screen is where we can ask for the tap.
 */
export default function VoiceProvider({ children }: { children: ReactNode }) {
  const { state, voiceSource, muted, speak, stop, toggleMute } = useBriefingVoice();
  const [booting, setBooting] = useState(true);

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
          onDone={() => setBooting(false)}
          onRequestVoice={() => speak({ force: true })}
        />
      )}
      {children}
    </VoiceContext.Provider>
  );
}
