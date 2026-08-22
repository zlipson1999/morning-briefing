import { getInbox, type Inbox } from "@/lib/mail";
import { describeError, fail, ok } from "@/lib/panel";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok<Inbox>({ data: await getInbox() });
  } catch (error) {
    console.error("[email]", error);
    return fail(describeError(error, "The mail store"));
  }
}
