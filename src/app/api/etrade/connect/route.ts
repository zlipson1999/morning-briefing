import { NextResponse } from "next/server";
import { beginAuthorization, credentials } from "@/lib/providers/etrade/client";
import { putPending } from "@/lib/providers/etrade/session";
import { sessionId, SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from "@/lib/providers/etrade";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!credentials()) {
    return NextResponse.json(
      { error: { message: "E*TRADE isn't configured yet. Add your consumer key to .env.local.", retryable: false } },
      { status: 501 },
    );
  }

  try {
    const callbackUrl = new URL("/api/etrade/callback", request.url).toString();
    const { requestToken, authorizeUrl } = await beginAuthorization(callbackUrl);

    const id = await sessionId();
    putPending(id, requestToken);

    const response = NextResponse.redirect(authorizeUrl);
    response.cookies.set(SESSION_COOKIE, id, SESSION_COOKIE_OPTIONS);
    return response;
  } catch (error) {
    console.error("[etrade:connect]", error);
    return NextResponse.json(
      { error: { message: "Couldn't start the E*TRADE connection.", retryable: true } },
      { status: 502 },
    );
  }
}
