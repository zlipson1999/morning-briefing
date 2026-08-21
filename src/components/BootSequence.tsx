"use client";

import { useEffect, useRef, useState } from "react";
import ArcReactor from "./ArcReactor";
import { USER_NAME } from "@/lib/config";
import type { VoiceState } from "@/hooks/useBriefingVoice";

const STEPS = [
  "Powering arc reactor",
  "Syncing calendar and inbox",
  "Pulling market positions",
  "Scanning wire services",
];

const STEP_MS = 520;
const HOLD_MS = 700;

/**
 * The boot overlay. Plays once on load, then hands over to the dashboard.
 *
 * It also solves a real constraint: browsers refuse speech synthesis without
 * a user gesture, so if speech was blocked this screen is where we ask for
 * one — rather than the dashboard silently never talking.
 */
export default function BootSequence({
  voiceState,
  onDone,
  onRequestVoice,
}: {
  voiceState: VoiceState;
  onDone: () => void;
  onRequestVoice: () => void;
}) {
  const [step, setStep] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const finished = useRef(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const finish = () => {
      if (finished.current) return;
      finished.current = true;
      setLeaving(true);
      window.setTimeout(onDone, reduced ? 0 : 700);
    };

    if (reduced) {
      finish();
      return;
    }

    const timers: number[] = [];
    STEPS.forEach((_, index) => {
      timers.push(window.setTimeout(() => setStep(index + 1), STEP_MS * (index + 1)));
    });
    timers.push(window.setTimeout(finish, STEP_MS * STEPS.length + HOLD_MS));

    // Any key or click skips straight through.
    const skip = () => finish();
    window.addEventListener("keydown", skip);
    window.addEventListener("pointerdown", skip);

    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener("keydown", skip);
      window.removeEventListener("pointerdown", skip);
    };
  }, [onDone]);

  return (
    <div
      className="boot-overlay fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-ink-950"
      data-leaving={leaving}
      role="status"
      aria-live="polite"
    >
      <ArcReactor className="boot-reactor size-56 sm:size-72" />

      <div className="flex min-h-[5.5rem] flex-col items-center gap-2 px-6 text-center">
        <p className="font-mono text-[11px] tracking-[0.34em] text-[#5cc8de] uppercase">
          Morning Briefing
        </p>

        <ul className="flex flex-col items-center gap-1">
          {STEPS.slice(0, step).map((label, index) => (
            <li
              key={label}
              className="boot-line font-mono text-[11px] tracking-[0.16em] text-mist-400 uppercase"
              style={{ animationDelay: `${index * 40}ms` }}
            >
              {label}
              <span className="ml-2 text-[#43cf9c]">OK</span>
            </li>
          ))}
        </ul>

        {step >= STEPS.length && (
          <p className="boot-line mt-1 text-lg font-medium text-mist-100">
            Good to see you, {USER_NAME}.
          </p>
        )}

        {voiceState === "blocked" && (
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onRequestVoice}
            className="boot-line mt-1 rounded-lg border border-[#5cc8de]/40 px-3 py-1.5 font-mono text-[11px] tracking-[0.16em] text-[#5cc8de] uppercase transition-colors hover:bg-[#5cc8de]/10 focus-visible:ring-2 focus-visible:ring-[#5cc8de] focus-visible:outline-none"
          >
            Tap to enable voice
          </button>
        )}
      </div>
    </div>
  );
}
