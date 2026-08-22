import { NextResponse } from "next/server";
import { forgetGrant } from "@/lib/providers/google";

export const dynamic = "force-dynamic";

export async function POST() {
  // Local half only. To revoke Google's half too:
  // myaccount.google.com/permissions — the README says so.
  await forgetGrant();
  return NextResponse.json({ ok: true });
}
