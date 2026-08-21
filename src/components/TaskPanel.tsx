"use client";

import { useState } from "react";
import Panel from "./Panel";
import { CheckSquareIcon } from "./icons";
import { initialTasks, type Task } from "@/lib/data";

const PRIORITY: Record<Task["priority"], { label: string; color: string }> = {
  high: { label: "High", color: "#e0709a" },
  medium: { label: "Medium", color: "#f0a63c" },
  low: { label: "Low", color: "#6f7887" },
};

export default function TaskPanel() {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);

  const toggle = (id: string) =>
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    );

  const open = tasks.filter((t) => !t.done).length;
  const done = tasks.length - open;
  const pct = Math.round((done / tasks.length) * 100);

  return (
    <Panel
      title="Task list"
      icon={<CheckSquareIcon className="size-full" />}
      accent="#43cf9c"
      meta={`${open} open · ${done} done`}
      delay={180}
    >
      <div className="px-3 pt-1 pb-3">
        <div className="h-1.5 overflow-hidden rounded-full bg-ink-700">
          <div
            className="h-full rounded-full bg-task transition-[width] duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-2 text-[11px] tracking-wide text-mist-400 uppercase">
          {pct}% of today cleared
        </p>
      </div>

      <ul className="flex flex-col gap-1">
        {tasks.map((t) => {
          const priority = PRIORITY[t.priority];
          const overdue = !t.done && t.due.toLowerCase() === "yesterday";

          return (
            <li key={t.id}>
              <label
                className={`flex cursor-pointer gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-ink-800/70 ${
                  t.done ? "opacity-45" : ""
                }`}
              >
                <input
                  type="checkbox"
                  checked={t.done}
                  onChange={() => toggle(t.id)}
                  className="peer sr-only"
                />
                <span
                  aria-hidden
                  className="mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-[6px] border border-ink-600 transition-colors peer-checked:border-task peer-checked:bg-task peer-focus-visible:ring-2 peer-focus-visible:ring-task/60 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-ink-850"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className={`size-3 ${t.done ? "opacity-100" : "opacity-0"}`}
                    fill="none"
                    stroke="#0b0d11"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m5 12.5 4.5 4.5L19 7" />
                  </svg>
                </span>

                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-sm ${
                      t.done
                        ? "text-mist-300 line-through decoration-mist-400/60"
                        : "font-medium text-mist-100"
                    }`}
                  >
                    {t.title}
                  </span>

                  {t.note && (
                    <span className="mt-0.5 block text-[12px] leading-relaxed text-mist-400">
                      {t.note}
                    </span>
                  )}

                  <span className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px]">
                    <span
                      className="rounded px-1.5 py-0.5 font-semibold tracking-wide uppercase"
                      style={{
                        color: priority.color,
                        background: `color-mix(in oklab, ${priority.color} 14%, transparent)`,
                      }}
                    >
                      {priority.label}
                    </span>
                    <span className="text-mist-400">{t.project}</span>
                    <span className="text-ink-600">·</span>
                    <span className={overdue ? "font-semibold text-[#e0709a]" : "text-mist-400"}>
                      {overdue ? "Overdue — yesterday" : t.due}
                    </span>
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
