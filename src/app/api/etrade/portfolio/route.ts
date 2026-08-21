import { describeError, fail, ok } from "@/lib/panel";
import { readPortfolio, UnauthorizedError, type ConnectionState, type Portfolio } from "@/lib/providers/etrade";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { portfolio, state } = await readPortfolio();
    return ok<{ portfolio: Portfolio; state: ConnectionState }>({ data: { portfolio, state } });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return fail("Your E*TRADE session expired. Reconnect to see live positions.", {
        retryable: false,
        status: 401,
      });
    }
    console.error("[etrade]", error);
    return fail(describeError(error, "E*TRADE"));
  }
}
