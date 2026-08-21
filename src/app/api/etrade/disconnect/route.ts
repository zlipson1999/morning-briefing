import { NextResponse } from "next/server";
import { clearSession, SESSION_COOKIE } from "@/lib/providers/etrade/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const id = request.headers.get("cookie")?.match(/mb_etrade_session=([^;]+)/)?.[1];
  clearSession(id);
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
