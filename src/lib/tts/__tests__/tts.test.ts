import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearSpokenCache, configuredBackend, speakBriefing } from "@/lib/tts";

beforeEach(() => {
  clearSpokenCache();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  clearSpokenCache();
});

describe("configuredBackend", () => {
  it("is none with nothing configured, so the browser engine still speaks", () => {
    vi.stubEnv("PIPER_BIN", "");
    vi.stubEnv("PIPER_VOICE", "");
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    expect(configuredBackend()).toBe("none");
  });

  it("prefers the local binary over the paid API when both are set", () => {
    vi.stubEnv("PIPER_BIN", "/usr/bin/piper");
    vi.stubEnv("PIPER_VOICE", "/voices/en_US-lessac-medium.onnx");
    vi.stubEnv("ELEVENLABS_API_KEY", "key");
    expect(configuredBackend()).toBe("piper");
  });

  it("needs both halves of the Piper config, not just the binary", () => {
    vi.stubEnv("PIPER_BIN", "/usr/bin/piper");
    vi.stubEnv("PIPER_VOICE", "");
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    expect(configuredBackend()).toBe("none");
  });
});

describe("speakBriefing", () => {
  it("returns null with no backend, rather than throwing", async () => {
    vi.stubEnv("PIPER_BIN", "");
    vi.stubEnv("PIPER_VOICE", "");
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    await expect(speakBriefing("Good morning.")).resolves.toBeNull();
  });

  it("synthesises through ElevenLabs and reports the backend", async () => {
    vi.stubEnv("PIPER_BIN", "");
    vi.stubEnv("PIPER_VOICE", "");
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 })));

    const spoken = await speakBriefing("Good morning.");
    expect(spoken?.backend).toBe("elevenlabs");
    expect(spoken?.contentType).toBe("audio/mpeg");
    expect(spoken?.audio.byteLength).toBe(4);
  });

  it("sends the key as a header and never in the URL", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await speakBriefing("Good morning.");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).not.toContain("test-key");
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe("test-key");
  });

  /** One briefing a morning, re-requested by every reload and every tab. */
  it("synthesises identical text only once", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await speakBriefing("Good morning.");
    await speakBriefing("Good morning.");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await speakBriefing("Good afternoon.");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns null when synthesis fails, so the browser engine takes over", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 401 })));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(speakBriefing("Good morning.")).resolves.toBeNull();
  });

  it("treats an empty response as a failure rather than silent audio", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([]), { status: 200 })));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(speakBriefing("Good morning.")).resolves.toBeNull();
  });

  it("reports a missing Piper binary as a failure, not a crash", async () => {
    vi.stubEnv("PIPER_BIN", "/definitely/not/a/real/binary");
    vi.stubEnv("PIPER_VOICE", "/definitely/not/a/voice.onnx");
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(speakBriefing("Good morning.")).resolves.toBeNull();
  });
});
