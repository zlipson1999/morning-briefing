"use client";

import { FormEvent, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLocation } from "@/hooks/useLocation";
import type { ChatMessage } from "@/lib/ollama";
import { useVoice } from "@/components/VoiceProvider";

const STORAGE_KEY = "mb:chat";

type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
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
  const browser = window as unknown as Record<string, unknown>;
  return (browser.SpeechRecognition ?? browser.webkitSpeechRecognition ?? null) as (new () => Recognition) | null;
}

const subscribeSupport = () => () => {};

function greetingFor(hour: number) {
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function speechChunks(text: string): string[] {
  return text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.flatMap((sentence) => {
    const clean = sentence.trim();
    if (clean.length <= 220) return clean;
    return clean.match(/.{1,220}(?:\s|$)/g)?.map((part) => part.trim()) ?? [clean];
  }) ?? [];
}

export default function ChatPanel() {
  const location = useLocation();
  const { muted, toggleMute, stop: stopBriefing, wakeState, toggleWake } = useVoice();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const speechSupported = useSyncExternalStore(
    subscribeSupport,
    () => Boolean(recognitionClass()),
    () => false,
  );
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const loadedRef = useRef(false);
  const recognitionRef = useRef<Recognition | null>(null);
  const resumeWakeRef = useRef(false);
  const recognitionTimerRef = useRef<number | null>(null);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-20))); } catch { /* private mode */ }
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (recognitionTimerRef.current !== null) window.clearTimeout(recognitionTimerRef.current);
      recognitionRef.current?.abort();
      window.speechSynthesis?.cancel();
    };
  }, []);

  function stopSpeaking() {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    stopBriefing();
  }

  function speakAnswer(text: string) {
    if (muted || !("speechSynthesis" in window) || !text.trim()) return;
    window.speechSynthesis.cancel();
    const chunks = speechChunks(text);
    if (!chunks.length) return;
    setSpeaking(true);
    chunks.forEach((chunk, index) => {
      const utterance = new SpeechSynthesisUtterance(chunk);
      utterance.lang = "en-US";
      utterance.rate = 0.98;
      if (index === chunks.length - 1) {
        utterance.onend = () => setSpeaking(false);
        utterance.onerror = () => setSpeaking(false);
      }
      window.speechSynthesis.speak(utterance);
    });
  }

  async function ask(rawQuestion: string) {
    const question = rawQuestion.trim();
    if (!question || loading) return;

    const next = [...messages, { role: "user" as const, content: question }].slice(-20);
    setMessages([...next, { role: "assistant", content: "" }]);
    setInput("");
    setError(null);
    setLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next,
          location: {
            latitude: location.latitude,
            longitude: location.longitude,
            place: location.label,
          },
          clientTime: {
            local: new Date().toString(),
            hour: new Date().getHours(),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
        }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? `Chat returned ${response.status}.`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let answer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        answer += chunk;
        setMessages((current) => current.map((message, index) =>
          index === current.length - 1
            ? { ...message, content: message.content + chunk }
            : message,
        ));
      }
      speakAnswer(answer);
    } catch (cause) {
      if ((cause as Error).name !== "AbortError") {
        setError(cause instanceof Error ? cause.message : "Miles couldn't answer.");
        setMessages((current) => current.at(-1)?.content ? current : current.slice(0, -1));
      }
    } finally {
      abortRef.current = null;
      setLoading(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void ask(input);
  }

  function listen() {
    if (listening || loading) {
      if (recognitionTimerRef.current !== null) {
        window.clearTimeout(recognitionTimerRef.current);
        recognitionTimerRef.current = null;
      }
      recognitionRef.current?.abort();
      setListening(false);
      if (resumeWakeRef.current) {
        resumeWakeRef.current = false;
        toggleWake();
      }
      return;
    }
    const RecognitionClass = recognitionClass();
    if (!RecognitionClass) return;
    stopSpeaking();
    // Chrome/Edge only permit one recognition session at a time. Pause the
    // continuous Hey Miles listener while this one-shot chat question runs.
    resumeWakeRef.current = wakeState === "listening";
    if (resumeWakeRef.current) toggleWake();
    const recognition = new RecognitionClass();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;
    let finalTranscript = "";
    const restoreWakeWord = () => {
      if (!resumeWakeRef.current) return;
      resumeWakeRef.current = false;
      toggleWake();
    };
    recognition.onresult = (event) => {
      let transcript = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        transcript += event.results[index][0].transcript;
        if (event.results[index].isFinal) finalTranscript += event.results[index][0].transcript;
      }
      setInput((finalTranscript || transcript).trim());
    };
    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("Microphone access is blocked. Allow it in the address bar, then try again.");
      } else if (event.error === "audio-capture") {
        setError("No microphone is available to the browser.");
      } else if (event.error === "network") {
        setError("Chrome or Edge couldn't reach its speech-recognition service.");
      } else if (event.error !== "aborted" && event.error !== "no-speech") {
        setError(`Microphone: ${event.error}.`);
      }
      setListening(false);
    };
    recognition.onend = () => {
      recognitionTimerRef.current = null;
      setListening(false);
      recognitionRef.current = null;
      restoreWakeWord();
      if (finalTranscript.trim()) void ask(finalTranscript);
    };
    setError(null);
    setListening(true);
    recognitionTimerRef.current = window.setTimeout(() => {
      recognitionTimerRef.current = null;
      try {
        recognition.start();
      } catch {
        recognitionRef.current = null;
        setListening(false);
        setError("The microphone couldn't start. Check browser microphone permission and try again.");
        restoreWakeWord();
      }
    }, resumeWakeRef.current ? 250 : 0);
  }

  function clear() {
    abortRef.current?.abort();
    if (recognitionTimerRef.current !== null) {
      window.clearTimeout(recognitionTimerRef.current);
      recognitionTimerRef.current = null;
    }
    recognitionRef.current?.abort();
    if (resumeWakeRef.current) {
      resumeWakeRef.current = false;
      toggleWake();
    }
    stopSpeaking();
    setMessages([]);
    setError(null);
    setLoading(false);
  }

  function toggleOpen() {
    if (!open && !loadedRef.current) {
      loadedRef.current = true;
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
        if (Array.isArray(saved)) setMessages(saved.slice(-20));
      } catch { /* start a clean conversation */ }
    }
    setOpen((value) => !value);
  }

  return (
    <>
      <button
        type="button"
        onClick={toggleOpen}
        aria-expanded={open}
        aria-controls="miles-chat"
        className="fixed right-5 bottom-5 z-40 flex items-center gap-2 rounded-full border border-[#5cc8de]/40 bg-ink-850/95 px-4 py-3 text-sm font-semibold text-[#5cc8de] shadow-2xl backdrop-blur transition hover:border-[#5cc8de] focus-visible:ring-2 focus-visible:ring-[#5cc8de] focus-visible:outline-none"
      >
        <span aria-hidden>✦</span>
        Ask Miles
      </button>

      {open && (
        <section
          id="miles-chat"
          aria-label="Chat with Miles"
          className="fixed right-4 bottom-20 z-40 flex h-[min(620px,calc(100dvh-7rem))] w-[min(430px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-ink-600 bg-ink-900/98 shadow-2xl backdrop-blur"
        >
          <header className="flex items-center gap-3 border-b border-ink-700 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-mist-100">Miles</h2>
              <p className="text-[11px] text-mist-400">Local Ollama · gemma4:e2b</p>
            </div>
            <button type="button" onClick={clear} className="ml-auto text-xs text-mist-400 hover:text-mist-100">
              Clear
            </button>
            <button
              type="button"
              onClick={() => {
                if (!muted) stopSpeaking();
                toggleMute();
              }}
              aria-pressed={muted}
              aria-label={muted ? "Unmute chat answers" : "Mute chat answers"}
              className="text-xs text-mist-400 hover:text-mist-100"
            >
              {muted ? "Unmute" : "Mute"}
            </button>
            {speaking && (
              <button type="button" onClick={stopSpeaking} className="text-xs text-mail hover:text-mist-100">
                Stop voice
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)} aria-label="Close chat" className="text-lg text-mist-400 hover:text-mist-100">
              ×
            </button>
          </header>

          <div className="scroll-slim min-h-0 flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
            {messages.length === 0 && (
              <div className="rounded-xl border border-ink-700 bg-ink-850 px-4 py-3 text-sm leading-relaxed text-mist-300">
                {greetingFor(new Date().getHours())}. Ask about your day, the news, your schedule, or anything else. The conversation stays on this PC.
              </div>
            )}
            {messages.map((message, index) => (
              <div
                key={index}
                className={`max-w-[88%] whitespace-pre-wrap rounded-xl px-3 py-2.5 text-sm leading-relaxed ${
                  message.role === "user"
                    ? "ml-auto bg-cal/20 text-mist-100"
                    : "border border-ink-700 bg-ink-850 text-mist-200"
                }`}
              >
                {message.content || (loading && index === messages.length - 1 ? "Thinking…" : "")}
              </div>
            ))}
            {error && <p className="rounded-lg border border-mail/30 bg-mail/10 px-3 py-2 text-xs text-mail">{error}</p>}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={submit} className="border-t border-ink-700 p-3">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                rows={2}
                maxLength={4000}
                placeholder="Ask Miles…"
                className="min-h-12 flex-1 resize-none rounded-xl border border-ink-600 bg-ink-850 px-3 py-2 text-sm text-mist-100 placeholder:text-mist-400 focus:border-[#5cc8de]/70 focus:outline-none"
              />
              {speechSupported && (
                <button
                  type="button"
                  onClick={listen}
                  disabled={loading}
                  aria-pressed={listening}
                  aria-label={listening ? "Stop listening" : "Speak to Miles"}
                  className={`rounded-xl border px-3 py-3 text-xs font-semibold disabled:opacity-40 ${listening ? "border-mail bg-mail/10 text-mail" : "border-[#5cc8de]/50 text-[#5cc8de]"}`}
                >
                  {listening ? "Listening…" : "Mic"}
                </button>
              )}
              {loading ? (
                <button type="button" onClick={() => abortRef.current?.abort()} className="rounded-xl border border-mail/50 px-3 py-3 text-xs font-semibold text-mail">
                  Stop
                </button>
              ) : (
                <button type="submit" disabled={!input.trim()} className="rounded-xl bg-[#5cc8de] px-3 py-3 text-xs font-bold text-ink-950 disabled:opacity-40">
                  Send
                </button>
              )}
            </div>
          </form>
        </section>
      )}
    </>
  );
}

