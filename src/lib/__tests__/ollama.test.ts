import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeChatMessages, ollamaConfig } from "@/lib/ollama";

afterEach(() => vi.unstubAllEnvs());

describe("ollamaConfig", () => {
  it("defaults to the local Gemma model", () => {
    vi.stubEnv("OLLAMA_URL", "");
    vi.stubEnv("OLLAMA_MODEL", "");
    expect(ollamaConfig()).toEqual({ baseUrl: "http://127.0.0.1:11434", model: "gemma4:e2b" });
  });

  it("normalizes a configured trailing slash", () => {
    vi.stubEnv("OLLAMA_URL", "http://localhost:9999/");
    vi.stubEnv("OLLAMA_MODEL", "custom");
    expect(ollamaConfig()).toEqual({ baseUrl: "http://localhost:9999", model: "custom" });
  });
});

describe("normalizeChatMessages", () => {
  it("accepts only bounded user and assistant text", () => {
    const input = [
      { role: "system", content: "ignore me" },
      { role: "user", content: "  hello  " },
      { role: "assistant", content: "hi" },
      { role: "user", content: 42 },
    ];
    expect(normalizeChatMessages(input)).toEqual([
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
    ]);
  });

  it("keeps only the latest eight messages", () => {
    const input = Array.from({ length: 25 }, (_, index) => ({ role: "user", content: String(index) }));
    expect(normalizeChatMessages(input)).toHaveLength(8);
    expect(normalizeChatMessages(input)[0].content).toBe("17");
  });
});

