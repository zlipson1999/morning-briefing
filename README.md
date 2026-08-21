# Morning Briefing

A dark, single-screen dashboard for the start of the day: today's calendar,
unread email, and the task list, side by side.

Built with Next.js 16 (App Router) + Tailwind CSS v4. All three panels run on
mock data right now — no accounts are connected.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## What's in it

| Panel | Behaviour |
| --- | --- |
| **Today's schedule** | Events are time-aware — anything already finished dims and strikes through, the one you're in is tagged `NOW`, and the next one up is tagged `NEXT`. The header counts how many are left. |
| **Unread email** | Click a message to mark it read (click again to undo); the unread count in the header follows. Senders get an initials avatar, important mail is starred, attachments are flagged. |
| **Task list** | Tick a task to complete it. The progress bar and the open/done counts update live, and anything past due is called out in red. |

The header greets you by name and shows today's date and local time. Both are
read from the *viewer's* clock via `src/lib/useClock.ts`, which uses
`useSyncExternalStore` so the server and client render identical markup — no
hydration mismatch, no timezone drift.

## Layout

```
src/
  app/
    layout.tsx        root layout, Inter font, metadata
    page.tsx          three-column grid, stacks on mobile
    globals.css       dark theme tokens + aurora background
    icon.svg          favicon
  components/
    Header.tsx        greeting, date, live clock
    Panel.tsx         shared panel shell (title, accent, count, scroll body)
    CalendarPanel.tsx
    EmailPanel.tsx
    TaskPanel.tsx
    icons.tsx         inline SVG icon set (no icon dependency)
  lib/
    data.ts           mock events, emails and tasks — and USER_NAME
    useClock.ts       hydration-safe clock
```

## Changing the data

Everything the dashboard shows lives in `src/lib/data.ts`. Change `USER_NAME`
at the top of that file to change the name in the header. Each of the three
exports (`events`, `emails`, `initialTasks`) is a plain typed array — swapping
one for a real API response later only means matching its type.

## Note on `next.config.ts`

`allowedDevOrigins` is set because Next 16 blocks its own dev-only resources
(`/_next/static`, HMR) for any origin other than `localhost`. Without it the
page server-renders but never hydrates when you reach the dev server over
`127.0.0.1`, a LAN IP, or a forwarded port — the panels look right but nothing
clicks.
