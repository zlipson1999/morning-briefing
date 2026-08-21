import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { unseal } from "@/lib/seal";
import { fetchWithTimeout } from "@/lib/cache";
import { GOOGLE_STATE_COOKIE, googleCredentials, saveRefreshToken } from "@/lib/providers/google";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const home = new URL("/", request.url);

  const creds = googleCredentials();
  const expected = unseal<{ state: string; at: number }>(
    (await cookies()).get(GOOGLE_STATE_COOKIE)?.value,
  );

  const stateOk =
    expected !== null && state === expected.state && Date.now() - expected.at < 10 * 60_000;

  if (!creds || !code || !stateOk) {
    home.searchParams.set("google", "failed");
    return NextResponse.redirect(home);
  }

  try {
    const redirectUri = new URL("/api/google/callback", request.url).toString();
    const res = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
      method: "POST",
      timeoutMs: 10_000,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }).toString(),
    });

    if (!res.ok) throw new Error(`Google token exchange responded ${res.status}`);
    const parsed = await res.json();
    if (typeof parsed?.refresh_token !== "string") {
      throw new Error("Google returned no refresh token — revoke the app at myaccount.google.com/permissions and connect again");
    }

    await saveRefreshToken(parsed.refresh_token);
    home.searchParams.set("google", "connected");
  } catch (error) {
    console.error("[google:callback]", error);
    home.searchParams.set("google", "failed");
  }

  const response = NextResponse.redirect(home);
  response.cookies.delete(GOOGLE_STATE_COOKIE);
  return response;
}
