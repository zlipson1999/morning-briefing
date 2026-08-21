export const USER_NAME = "Zach";

export type CalendarEvent = {
  id: string;
  title: string;
  start: string; // 24h "HH:MM"
  end: string;
  location: string;
  attendees: string[];
  kind: "meeting" | "focus" | "personal" | "interview";
};

export type Email = {
  id: string;
  sender: string;
  senderEmail: string;
  subject: string;
  preview: string;
  receivedAt: string; // "HH:MM"
  important: boolean;
  hasAttachment: boolean;
  label: "Inbox" | "Work" | "Personal" | "Updates";
};

export type Task = {
  id: string;
  title: string;
  note?: string;
  due: string;
  priority: "high" | "medium" | "low";
  project: string;
  done: boolean;
};

export const events: CalendarEvent[] = [
  {
    id: "e1",
    title: "Standup — Platform",
    start: "09:00",
    end: "09:15",
    location: "Zoom",
    attendees: ["Priya R.", "Marcus D.", "Elena K.", "+4"],
    kind: "meeting",
  },
  {
    id: "e2",
    title: "Deep work: inference latency",
    start: "09:30",
    end: "11:00",
    location: "Blocked",
    attendees: [],
    kind: "focus",
  },
  {
    id: "e3",
    title: "Design review — voice pipeline v2",
    start: "11:00",
    end: "12:00",
    location: "Conf Rm 4B",
    attendees: ["Sofia L.", "Daniel W.", "Priya R."],
    kind: "meeting",
  },
  {
    id: "e4",
    title: "Lunch w/ Marcus",
    start: "12:30",
    end: "13:30",
    location: "Cafe Lento",
    attendees: ["Marcus D."],
    kind: "personal",
  },
  {
    id: "e5",
    title: "Interview — ML Infra (round 3)",
    start: "14:00",
    end: "15:00",
    location: "Zoom",
    attendees: ["Amara O.", "Recruiting"],
    kind: "interview",
  },
  {
    id: "e6",
    title: "1:1 with Elena",
    start: "15:30",
    end: "16:00",
    location: "Conf Rm 2A",
    attendees: ["Elena K."],
    kind: "meeting",
  },
  {
    id: "e7",
    title: "Q3 roadmap sync",
    start: "16:30",
    end: "17:15",
    location: "Zoom",
    attendees: ["Leadership", "+9"],
    kind: "meeting",
  },
];

export const emails: Email[] = [
  {
    id: "m1",
    sender: "Priya Raghavan",
    senderEmail: "priya@nimbus.dev",
    subject: "Re: latency numbers from last night's run",
    preview:
      "p95 dropped to 180ms after the batching change — but p99 is still spiky. Can you look before standup?",
    receivedAt: "06:42",
    important: true,
    hasAttachment: true,
    label: "Work",
  },
  {
    id: "m2",
    sender: "GitHub",
    senderEmail: "notifications@github.com",
    subject: "[pocket-ai] 3 checks failed on #218",
    preview:
      "The workflow 'CI / integration' failed for commit 137fc62. View the run to see which jobs failed.",
    receivedAt: "06:15",
    important: false,
    hasAttachment: false,
    label: "Updates",
  },
  {
    id: "m3",
    sender: "Sofia Lindqvist",
    senderEmail: "sofia@nimbus.dev",
    subject: "Deck for the 11am design review",
    preview:
      "Attached the latest — slides 6-9 are the ones I want your read on. Wake word handling changed.",
    receivedAt: "05:58",
    important: true,
    hasAttachment: true,
    label: "Work",
  },
  {
    id: "m4",
    sender: "Amara Okonjo",
    senderEmail: "amara.okonjo@gmail.com",
    subject: "Confirming 2pm today",
    preview:
      "Looking forward to it. I'll dial in a few minutes early in case there are setup issues on my end.",
    receivedAt: "22:31",
    important: false,
    hasAttachment: false,
    label: "Inbox",
  },
  {
    id: "m5",
    sender: "Hailo Support",
    senderEmail: "support@hailo.ai",
    subject: "Ticket #48211 — HailoRT driver timeout",
    preview:
      "Thanks for the logs. Our team reproduced the timeout on kernel 6.18. A patched runtime is available in...",
    receivedAt: "21:07",
    important: false,
    hasAttachment: false,
    label: "Work",
  },
  {
    id: "m6",
    sender: "Marcus Delgado",
    senderEmail: "marcus@nimbus.dev",
    subject: "Lento at 12:30 still good?",
    preview: "They don't take reservations so I'll head over at 12:20 to grab a table. Ping if you're running late.",
    receivedAt: "20:44",
    important: false,
    hasAttachment: false,
    label: "Personal",
  },
  {
    id: "m7",
    sender: "Stripe",
    senderEmail: "receipts@stripe.com",
    subject: "Your receipt from Anthropic",
    preview: "Amount paid $240.00 — invoice 4F2A-9C11. This is an automated receipt for your records.",
    receivedAt: "19:02",
    important: false,
    hasAttachment: true,
    label: "Updates",
  },
];

export const initialTasks: Task[] = [
  {
    id: "t1",
    title: "Chase down the p99 latency spike",
    note: "Suspect the tokenizer warm-up path, not batching.",
    due: "Today, 9am",
    priority: "high",
    project: "pocket-ai",
    done: false,
  },
  {
    id: "t2",
    title: "Review Sofia's voice pipeline deck",
    note: "Slides 6–9 before the 11am.",
    due: "Today, 11am",
    priority: "high",
    project: "Design",
    done: false,
  },
  {
    id: "t3",
    title: "Write interview feedback for Amara",
    due: "Today, EOD",
    priority: "medium",
    project: "Hiring",
    done: false,
  },
  {
    id: "t4",
    title: "Bump HailoRT to the patched runtime",
    note: "Support says the 6.18 timeout is fixed.",
    due: "Tomorrow",
    priority: "medium",
    project: "pocket-ai",
    done: false,
  },
  {
    id: "t5",
    title: "Draft Q3 roadmap talking points",
    due: "Today, 4:30pm",
    priority: "high",
    project: "Planning",
    done: false,
  },
  {
    id: "t6",
    title: "Renew the domain before it lapses",
    due: "Fri",
    priority: "low",
    project: "Personal",
    done: false,
  },
  {
    id: "t7",
    title: "Merge the task-scheduler subprocess PR",
    due: "Yesterday",
    priority: "medium",
    project: "pocket-ai",
    done: true,
  },
];
