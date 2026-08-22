import { runHealthChecks } from "@/lib/health";

export const dynamic = "force-dynamic";

/**
 * Every upstream, probed. Nothing here runs on the dashboard path — this is
 * a page you load when something looks wrong, or once after setting up.
 */
export async function GET() {
  const checks = await runHealthChecks();

  return Response.json(
    {
      checkedAt: Date.now(),
      summary: {
        ok: checks.filter((check) => check.status === "ok").length,
        failing: checks.filter((check) => check.status === "failing").length,
        off: checks.filter((check) => check.status === "off").length,
      },
      checks,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
