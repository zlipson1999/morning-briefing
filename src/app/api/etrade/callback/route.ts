import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { completeAuthorization } from "@/lib/providers/etrade/client";
import { readPending, sealSession } from "@/lib/providers/etrade/session";
import {
  PENDING_COOKIE,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
} from "@/lib/providers/etrade";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const verifier = new URL(request.url).searchParams.get("oauth_verifier");
  const home = new URL("/", request.url);

  const requestToken = readPending((await cookies()).get(PENDING_COOKIE)?.value);

  if (!verifier) {
    home.searchParams.set("etrade", "failed");
    return NextResponse.redirect(home);
  }
  if (!requestToken) {
    home.searchParams.set("etrade", "expired");
    return NextResponse.redirect(home);
  }

  let sealed: string | null = null;
  try {
    sealed = sealSession(await completeAuthorization(requestToken, verifier));
    home.searchParams.set("etrade", "connected");
  } catch (error) {
    console.error("[etrade:callback]", error);
    home.searchParams.set("etrade", "failed");
  }

  const response = NextResponse.redirect(home);
  if (sealed) response.cookies.set(SESSION_COOKIE, sealed, SESSION_COOKIE_OPTIONS);
  response.cookies.delete(PENDING_COOKIE);
  return response;
}
