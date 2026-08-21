import { HOME_LOCATION, USER_NAME } from "@/lib/config";
import { emails, initialTasks } from "@/lib/data";
import { getTodaysEvents } from "@/lib/calendar";
import type { CalendarEvent } from "@/lib/data";
import { nextCommute, type Commute } from "@/lib/providers/commute";
import { getNews } from "@/lib/providers/news";
import { getWeather, type Weather } from "@/lib/providers/weather";
import { readPortfolio } from "@/lib/providers/etrade";

/**
 * Everything known about today, gathered once.
 *
 * Both composers read this and nothing else: the deterministic one and the
 * Claude-authored one see identical material, so the difference between them
 * is judgement rather than access.
 */
export type BriefingSnapshot = {
  userName: string;
  now: { weekday: string; date: string; time: string; hour: number; minutes: number };
  weather: Weather | null;
  schedule: {
    remaining: number;
    total: number;
    events: {
      title: string;
      start: string;
      end: string;
      location: string;
      kind: string;
      attendees: string[];
      status: "past" | "now" | "upcoming";
    }[];
    /** Gaps of half an hour or more between the remaining events. */
    freeWindows: { from: string; to: string; minutes: number }[];
    /** Pairs of remaining events that overlap. */
    conflicts: { a: string; b: string }[];
  };
  inbox: {
    unread: number;
    messages: { sender: string; subject: string; preview: string; important: boolean; label: string }[];
  };
  tasks: {
    open: number;
    done: number;
    items: { title: string; note?: string; due: string; priority: string; project: string; overdue: boolean }[];
  };
  portfolio: {
    connected: boolean;
    totalValue: number;
    dayChangePct: number;
    movers: { symbol: string; dayChangePct: number }[];
  } | null;
  news: {
    local: { title: string; source: string }[];
    global: { title: string; source: string }[];
    /** True when the local list was ordered by importance rather than recency. */
    curatedLocal: boolean;
  };
  commute: Commute | null;
};

const toMinutes = (hhmm: string) => {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return hours * 60 + minutes;
};

const spoken = (hhmm: string) => {
  const [hours, minutes] = hhmm.split(":").map(Number);
  const suffix = hours < 12 ? "a.m." : "p.m.";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return minutes === 0 ? `${hour12} ${suffix}` : `${hour12}:${String(minutes).padStart(2, "0")} ${suffix}`;
};

/**
 * Gaps worth naming. Anything shorter than half an hour isn't a window you
 * can put work in, it's the walk between two meetings.
 */
function freeWindowsAfter(events: CalendarEvent[], nowMinutes: number) {
  const remaining = events
    .filter((event) => toMinutes(event.end) > nowMinutes)
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));

  const windows: { from: string; to: string; minutes: number }[] = [];
  for (let i = 0; i < remaining.length - 1; i++) {
    const gap = toMinutes(remaining[i + 1].start) - toMinutes(remaining[i].end);
    if (gap >= 30) {
      windows.push({ from: spoken(remaining[i].end), to: spoken(remaining[i + 1].start), minutes: gap });
    }
  }
  return windows;
}

function conflictsAfter(events: CalendarEvent[], nowMinutes: number) {
  const remaining = events.filter((event) => toMinutes(event.end) > nowMinutes);
  const clashes: { a: string; b: string }[] = [];

  for (let i = 0; i < remaining.length; i++) {
    for (let j = i + 1; j < remaining.length; j++) {
      const overlaps =
        toMinutes(remaining[i].start) < toMinutes(remaining[j].end) &&
        toMinutes(remaining[j].start) < toMinutes(remaining[i].end);
      if (overlaps) clashes.push({ a: remaining[i].title, b: remaining[j].title });
    }
  }
  return clashes;
}

/**
 * Every section is independent and optional: a dead upstream costs you that
 * section, never the briefing.
 */
export async function gatherSnapshot({
  latitude = HOME_LOCATION.latitude,
  longitude = HOME_LOCATION.longitude,
  place = HOME_LOCATION.label,
  now = new Date(),
}: {
  latitude?: number;
  longitude?: number;
  place?: string;
  now?: Date;
} = {}): Promise<BriefingSnapshot> {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  // The calendar is read first: the commute depends on it, and everything
  // else can be fetched alongside.
  const events = await getTodaysEvents(now);

  const [weather, portfolio, news, commute] = await Promise.all([
    getWeather(latitude, longitude, place)
      .then((result) => result.value)
      .catch(() => null),
    readPortfolio()
      .then(({ portfolio: p, state }) => ({
        connected: state.connected,
        totalValue: p.totalValue,
        dayChangePct: p.dayChangePct,
        movers: [...p.positions]
          .sort((a, b) => Math.abs(b.dayChangePct) - Math.abs(a.dayChangePct))
          .slice(0, 3)
          .map(({ symbol, dayChangePct }) => ({ symbol, dayChangePct })),
      }))
      .catch(() => null),
    getNews(place)
      .then(({ value }) => ({
        local: value.local.slice(0, 4).map(({ title, source }) => ({ title, source })),
        global: value.global.slice(0, 4).map(({ title, source }) => ({ title, source })),
        curatedLocal: value.curatedLocal,
      }))
      .catch(() => ({ local: [], global: [], curatedLocal: false })),
    nextCommute(events, nowMinutes, { latitude, longitude }).catch(() => null),
  ]);

  const openTasks = initialTasks.filter((task) => !task.done);

  return {
    userName: USER_NAME,
    now: {
      weekday: now.toLocaleDateString("en-US", { weekday: "long" }),
      date: now.toLocaleDateString("en-US", { month: "long", day: "numeric" }),
      time: now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
      hour: now.getHours(),
      minutes: nowMinutes,
    },
    weather,
    schedule: {
      remaining: events.filter((event) => toMinutes(event.end) > nowMinutes).length,
      total: events.length,
      events: events.map((event) => ({
        title: event.title,
        start: spoken(event.start),
        end: spoken(event.end),
        location: event.location,
        kind: event.kind,
        attendees: event.attendees,
        status:
          toMinutes(event.end) <= nowMinutes
            ? "past"
            : toMinutes(event.start) <= nowMinutes
              ? "now"
              : "upcoming",
      })),
      freeWindows: freeWindowsAfter(events, nowMinutes),
      conflicts: conflictsAfter(events, nowMinutes),
    },
    inbox: {
      unread: emails.length,
      messages: emails.map((email) => ({
        sender: email.sender,
        subject: email.subject,
        preview: email.preview,
        important: email.important,
        label: email.label,
      })),
    },
    tasks: {
      open: openTasks.length,
      done: initialTasks.length - openTasks.length,
      items: openTasks.map((task) => ({
        title: task.title,
        note: task.note,
        due: task.due,
        priority: task.priority,
        project: task.project,
        overdue: task.due.toLowerCase() === "yesterday",
      })),
    },
    portfolio,
    news,
    commute,
  };
}
