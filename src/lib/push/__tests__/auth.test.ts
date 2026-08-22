import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authorised, ingestIsEnabled, refuse } from "@/lib/push/auth";

const request = (headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/calendar/ingest", { method: "POST", headers });

beforeEach(() => vi.stubEnv("CALENDAR_INGEST_TOKEN", "s3cr3t-token"));
afterEach(() => vi.unstubAllEnvs());

describe("ingest auth", () => {
  it("accepts the token as a bearer or as its own header", () => {
    expect(authorised(request({ authorization: "Bearer s3cr3t-token" }))).toBe(true);
    expect(authorised(request({ "x-ingest-token": "s3cr3t-token" }))).toBe(true);
  });

  it("rejects a wrong token, a missing one, and a near miss", () => {
    expect(authorised(request({ authorization: "Bearer wrong" }))).toBe(false);
    expect(authorised(request())).toBe(false);
    // A prefix must not pass: length is checked before the comparison.
    expect(authorised(request({ authorization: "Bearer s3cr3t-toke" }))).toBe(false);
    expect(authorised(request({ authorization: "Bearer s3cr3t-tokenn" }))).toBe(false);
  });

  /**
   * A disabled feature is a better default than an open one, even on a
   * tailnet — with no token set, nothing may write.
   */
  it("refuses everything when no token is configured", () => {
    vi.stubEnv("CALENDAR_INGEST_TOKEN", "");

    expect(ingestIsEnabled()).toBe(false);
    expect(authorised(request({ authorization: "Bearer anything" }))).toBe(false);
    expect(authorised(request())).toBe(false);
    expect(refuse().status).toBe(501);
  });

  it("answers 401 rather than 501 once a token exists", () => {
    expect(refuse().status).toBe(401);
  });
});
