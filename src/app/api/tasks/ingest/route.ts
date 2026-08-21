import { normalizeTaskPayload, removeTask, upsertTasks } from "@/lib/tasks";
import { authorised, refuse } from "@/lib/push/auth";

export const dynamic = "force-dynamic";

/**
 * Where Zapier pushes your task list.
 *
 * Todoist, Google Tasks and Things all name their fields differently; all
 * three shapes parse, along with `__`-flattened variants. A completion Zap
 * should push the same task with `completed: true` rather than deleting it —
 * that's what keeps the done count honest.
 */
export async function POST(request: Request) {
  if (!authorised(request)) return refuse();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const tasks = normalizeTaskPayload(body);
  if (tasks.length === 0) {
    return Response.json({ error: "No usable tasks. Each one needs at least a title." }, { status: 422 });
  }

  const stored = await upsertTasks(tasks);
  return Response.json({
    accepted: tasks.length,
    stored,
    tasks: tasks.map((task) => ({
      id: task.id,
      title: task.title,
      due: task.dueIso,
      priority: task.priority,
      project: task.project,
      done: task.done,
    })),
  });
}

export async function DELETE(request: Request) {
  if (!authorised(request)) return refuse();

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Pass ?id=<task id>." }, { status: 400 });

  return Response.json({ removed: await removeTask(id) });
}
