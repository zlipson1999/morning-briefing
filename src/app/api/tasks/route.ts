import { getTasks, type TaskList } from "@/lib/tasks";
import { describeError, fail, ok } from "@/lib/panel";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok<TaskList>({ data: await getTasks() });
  } catch (error) {
    console.error("[tasks]", error);
    return fail(describeError(error, "The task store"));
  }
}
