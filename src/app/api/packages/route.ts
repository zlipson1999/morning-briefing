import { getPackages } from "@/lib/packages";
import { describeError, fail, ok } from "@/lib/panel";
import type { Package } from "@/lib/packages";

export const dynamic = "force-dynamic";

/** Everything currently in transit, from the same Gmail connection as the inbox. */
export async function GET() {
  try {
    return ok<{ packages: Package[] }>({ data: { packages: await getPackages() } });
  } catch (error) {
    console.error("[packages]", error);
    return fail(describeError(error, "The package tracker"));
  }
}
