import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { seal } from "@/lib/seal";
import { GOOGLE_SCOPES, GOOGLE_STATE_COOKIE, googleCredentials } from "@/lib/providers/google";

export const dynamic = "force-dynamic";

/**
 * Starts the one-time Google consent.
 *
 * `access_type=offline` + `prompt=consent` is what makes Google issue a
 * refresh token — without both, re-consenting returns only a one-hour access
 * token and the connection quietly dies at lunch.
 */
export async function GET(request: Request) {
  const creds = googleCredentials();
  if (!creds) {
    return NextResponse.json(
      { error: { message: "Google isn't configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local — the README walks through creating them.", retryable: false } },
      { status: 501 },
    );
  }

  const state = crypto.randomBytes(16).toString("hex");
  const redirectUri = new URL("/api/google/callback", request.url).toString();

  const url =
    "https://accounts.google.com/o/oauth2/v2/auth" +
    `?client_id=${encodeURIComponent(creds.clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    "&response_type=code" +
    `&scope=${encodeURIComponent(GOOGLE_SCOPES)}` +
    "&access_type=offline&prompt=consent" +
    `&state=${state}`;

  const response = NextResponse.redirect(url);
  response.cookies.set(GOOGLE_STATE_COOKIE, seal({ state, at: Date.now() }), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 10 * 60,
  });
  return response;
}
