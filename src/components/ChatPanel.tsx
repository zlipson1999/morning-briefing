"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useLocation } from "@/hooks/useLocation";
import type { ChatMessage } from "@/lib/ollama";

const STORAGE_KEY = "mb:chat";

export default function ChatPanel() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-20))); } catch { /* private mode */ }
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const question = input.trim();
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
        }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? `Chat returned ${response.status}.`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((current) => current.map((message, index) =>
          index === current.length - 1
            ? { ...message, content: message.content + chunk }
            : message,
        ));
      }
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

  function clear() {
    abortRef.current?.abort();
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
            <button type="button" onClick={() => setOpen(false)} aria-label="Close chat" className="text-lg text-mist-400 hover:text-mist-100">
              ×
            </button>
          </header>

          <div className="scroll-slim min-h-0 flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
            {messages.length === 0 && (
              <div className="rounded-xl border border-ink-700 bg-ink-850 px-4 py-3 text-sm leading-relaxed text-mist-300">
                Ask about your day, the news, your schedule, or anything else. The conversation stays on this PC.
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

