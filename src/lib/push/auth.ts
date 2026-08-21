import crypto from "node:crypto";

/**
 * The shared secret guarding every ingest endpoint.
 *
 * These are the only routes in the app that write, so they are the only ones
 * that need a secret. With `CALENDAR_INGEST_TOKEN` unset they refuse
 * everything rather than accepting anonymous writes — a disabled feature is a
 * better default than an open one, even on a tailnet.
 *
 * One token covers all three ingests: it is one Zapier account pushing to one
 * machine, and three secrets to rotate would just mean two that never get
 * rotated.
 */

const TOKEN_VAR = "CALENDAR_INGEST_TOKEN";

export function ingestIsEnabled(): boolean {
  return Boolean(process.env[TOKEN_VAR]);
}

export function authorised(request: Request): boolean {
  const expected = process.env[TOKEN_VAR];
  if (!expected) return false;

  const header = request.headers.get("authorization") ?? "";
  const supplied = header.replace(/^Bearer\s+/i, "") || request.headers.get("x-ingest-token") || "";

  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  // Compare lengths first: timingSafeEqual throws on a mismatch.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function refuse(): Response {
  if (!ingestIsEnabled()) {
    return Response.json(
      { error: `Ingest is disabled. Set ${TOKEN_VAR} to enable it.` },
      { status: 501 },
    );
  }
  return Response.json({ error: "Unauthorized." }, { status: 401 });
}

/** How stale a store may get before the UI says the Zap has probably stopped. */
export const SYNC_WARNING_MS = 24 * 60 * 60_000;
