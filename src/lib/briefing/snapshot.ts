import { HOME_LOCATION, USER_NAME, WATCHLIST } from "@/lib/config";
import { getTodaysCalendar, getTodaysEvents } from "@/lib/calendar";
import { getInbox } from "@/lib/mail";
import { getTasks } from "@/lib/tasks";
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
    messages: {
      sender: string;
      subject: string;
      preview: string;
      important: boolean;
      label: string;
      /** Epoch ms, or null for sample data with no real timestamp. */
      receivedAt: number | null;
    }[];
  };
  tasks: {
    open: number;
    done: number;
    items: { title: string; note?: string; due: string; priority: string; project: string; overdue: boolean }[];
  };
  portfolio: {
    /** True only for a real brokerage account. */
    connected: boolean;
    /** "live"/"sandbox" is your account; "watchlist" is Yahoo; "mock" is neither. */
    mode: "watchlist" | "mock" | "sandbox" | "live";
    totalValue: number;
    dayChangePct: number;
    /** Only the symbols you've allowed the briefing to mention. */
    movers: { symbol: string; dayChangePct: number }[];
  } | null;
  news: {
    local: { title: string; source: string }[];
    global: { title: string; source: string }[];
    /** True when the local list was ordered by importance rather than recency. */
    curatedLocal: boolean;
  };
  commute: Commute | null;
  /** Tomorrow's first real calendar event; null when only sample data exists or the fetch failed. */
  tomorrow: {
    firstEvent: { title: string; start: string; location: string } | null;
  } | null;
};

/** Symbols the briefing is allowed to mention, from the watchlist config. */
const spokenSymbols = new Set(
  WATCHLIST.filter((holding) => holding.speak !== false).map((holding) => holding.symbol.toUpperCase()),
);

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
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  tomorrowDate.setHours(12, 0, 0, 0);
  const [inbox, taskList] = await Promise.all([getInbox(now), getTasks(now)]);

  const [weather, portfolio, news, commute, tomorrow] = await Promise.all([
    getWeather(latitude, longitude, place)
      .then((result) => result.value)
      .catch(() => null),
    readPortfolio()
      .then(({ portfolio: p, state }) => ({
        connected: state.connected,
        mode: p.mode,
        totalValue: p.totalValue,
        dayChangePct: p.dayChangePct,
        movers: [...p.positions]
          // On the watchlist, `speak: false` means on screen but not read out.
          .filter((position) => p.mode !== "watchlist" || spokenSymbols.has(position.symbol.toUpperCase()))
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
    getTodaysCalendar(tomorrowDate)
      .then((calendar) => {
        // Sample events describe the demo day, not the user's actual tomorrow.
        if (calendar.source === "sample") return null;
        const first = calendar.events[0];
        return {
          firstEvent: first
            ? { title: first.title, start: spoken(first.start), location: first.location }
            : null,
        };
      })
      .catch(() => null),
  ]);

  const openTasks = taskList.items.filter((task) => !task.done);

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
      unread: inbox.messages.length,
      messages: inbox.messages.map((message) => ({
        sender: message.sender,
        subject: message.subject,
        preview: message.preview,
        important: message.important,
        label: message.label,
        receivedAt: message.receivedAt,
      })),
    },
    tasks: {
      open: openTasks.length,
      done: taskList.items.length - openTasks.length,
      items: openTasks.map((task) => ({
        title: task.title,
        note: task.note,
        due: task.dueLabel,
        priority: task.priority,
        project: task.project,
        overdue: task.overdue,
      })),
    },
    portfolio,
    news,
    commute,
    tomorrow,
  };
}
