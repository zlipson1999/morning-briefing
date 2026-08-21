"use client";

import { useVoice } from "./VoiceProvider";
import { ASSISTANT_NAME } from "@/lib/config";

/**
 * Replays or silences the spoken briefing. Shows what the voice is actually
 * doing rather than a static icon, so a blocked or still-loading briefing
 * doesn't look like a broken button.
 */
export default function VoiceButton() {
  const { state, voiceSource, muted, speak, stop, toggleMute, wakeState, toggleWake } = useVoice();

  if (state === "unsupported") return null;

  const speaking = state === "speaking";
  const label = muted
    ? "Voice off"
    : speaking
      ? "Stop"
      : state === "loading"
        ? "Loading"
        : state === "blocked"
          ? "Play briefing"
          : "Replay";

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => (speaking ? stop() : speak({ force: true }))}
        disabled={muted || state === "loading"}
        title={
          voiceSource === "server"
            ? "Reading with the server voice."
            : voiceSource === "browser"
              ? "Reading with this browser's built-in voice."
              : undefined
        }
        className="flex items-center gap-1.5 rounded-lg border border-ink-600 px-2.5 py-1 text-[11px] font-medium tracking-wide text-mist-300 uppercase transition-colors hover:border-[#5cc8de]/60 hover:text-[#5cc8de] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-[#5cc8de] focus-visible:outline-none"
      >
        <span
          className={`block size-1.5 rounded-full ${speaking ? "animate-pulse bg-[#5cc8de]" : "bg-mist-400"}`}
          aria-hidden
        />
        {label}
      </button>

      <button
        type="button"
        onClick={toggleMute}
        aria-pressed={muted}
        aria-label={muted ? "Unmute the spoken briefing" : "Mute the spoken briefing"}
        className="rounded-lg border border-ink-600 p-1.5 text-mist-400 transition-colors hover:border-mist-400 hover:text-mist-200 focus-visible:ring-2 focus-visible:ring-[#5cc8de] focus-visible:outline-none"
      >
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M11 5 6.5 9H3v6h3.5L11 19V5Z" />
          {muted ? <path d="m16 9 5 6M21 9l-5 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" />}
        </svg>
      </button>

      {/* "Hey Miles" — hidden entirely where the browser can't do it. */}
      {wakeState !== "unsupported" && (
        <button
          type="button"
          onClick={toggleWake}
          aria-pressed={wakeState === "listening"}
          title={
            wakeState === "listening"
              ? `Listening for \u201cHey ${ASSISTANT_NAME}\u201d. Click to stop.`
              : wakeState === "blocked"
                ? "Microphone access was denied \u2014 allow it in the browser and click again."
                : `Listen for \u201cHey ${ASSISTANT_NAME}\u201d. Uses the browser's own speech recognition.`
          }
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium tracking-wide uppercase transition-colors focus-visible:ring-2 focus-visible:ring-[#5cc8de] focus-visible:outline-none ${
            wakeState === "listening"
              ? "border-[#5cc8de]/50 text-[#5cc8de]"
              : wakeState === "blocked"
                ? "border-[#e0709a]/50 text-[#e0709a]"
                : "border-ink-600 text-mist-400 hover:border-mist-400 hover:text-mist-200"
          }`}
        >
          <span
            className={`block size-1.5 rounded-full ${
              wakeState === "listening" ? "animate-pulse bg-[#5cc8de]" : "bg-mist-400"
            }`}
            aria-hidden
          />
          Hey {ASSISTANT_NAME}
        </button>
      )}
    </div>
  );
}
