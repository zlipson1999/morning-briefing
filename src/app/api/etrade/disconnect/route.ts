import { NextResponse } from "next/server";
import { PENDING_COOKIE, SESSION_COOKIE } from "@/lib/providers/etrade";

export const dynamic = "force-dynamic";

export async function POST() {
  // Nothing to clear server-side by design — the session lives entirely in the
  // sealed cookie, so dropping it is the whole disconnect.
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  response.cookies.delete(PENDING_COOKIE);
  return response;
}
