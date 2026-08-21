import { NextResponse } from "next/server";
import { completeAuthorization } from "@/lib/providers/etrade/client";
import { putSession, takePending } from "@/lib/providers/etrade/session";
import { SESSION_COOKIE } from "@/lib/providers/etrade";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const verifier = url.searchParams.get("oauth_verifier");
  const id = request.headers.get("cookie")?.match(/mb_etrade_session=([^;]+)/)?.[1];
  const home = new URL("/", request.url);

  if (!verifier || !id) {
    home.searchParams.set("etrade", "failed");
    return NextResponse.redirect(home);
  }

  const requestToken = takePending(id);
  if (!requestToken) {
    home.searchParams.set("etrade", "expired");
    return NextResponse.redirect(home);
  }

  try {
    putSession(id, await completeAuthorization(requestToken, verifier));
    home.searchParams.set("etrade", "connected");
  } catch (error) {
    console.error("[etrade:callback]", error);
    home.searchParams.set("etrade", "failed");
  }

  const response = NextResponse.redirect(home);
  // Re-affirm the cookie so the session survives the redirect chain.
  response.cookies.set(SESSION_COOKIE, id, {
    httpOnly: true, sameSite: "lax", path: "/",
    secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24,
  });
  return response;
}
