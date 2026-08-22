# Miles

**M**y **I**ntegrated **L**ife **E**fficiency **S**ystem — a dark,
single-screen dashboard for the start of the day: schedule, inbox, tasks,
news, weather and portfolio, all visible without scrolling, plus the one line
that actually changes what you do next, which is when to leave. It reads the
day to you when you sit down, and answers to its name while you're at the
computer.

Next.js 16 (App Router), Tailwind CSS v4, TypeScript.

## Run it

**Starting from zero?** [SETUP.md](./SETUP.md) is the complete walkthrough —
Node to Google to your phone, in order.

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

Nothing needs configuring to start — news and weather work immediately with no
API keys, and the portfolio panel runs on sample data until you connect
E*TRADE.

## The panels

| Panel | Source | Behaviour |
| --- | --- | --- |
| **Today's schedule** | **live-wired** | Real Google Calendar over a Zapier push; a sample day until one arrives. Finished events dim and strike through, the current one is tagged `NOW` and the next `NEXT` |
| **Waiting on you** | **live-wired** | Filtered mail over a Zapier push; sample data until one arrives. Clear an item to drop it from today's list |
| **Task list** | **live-wired** | Todoist, Google Tasks or Things over a Zapier push; sample data until one arrives. Overdue first, then by due date |
| **Today's news** | **live** | Local and world headlines over curated RSS, with the local list ranked by what matters rather than what's newest. Every item carries its source and age |
| **Weather** | **live** | Open-Meteo, in the header beside the date — click it for the full forecast |
| **Portfolio** | **live** | Keyless Yahoo quotes on the watchlist in config; real E*TRADE positions and cost basis once connected |
| **Leave by** | **live** | Drive time to the next event with a real address, counted back to a walk-out-the-door time |

Nothing here needs an API key to be useful: every panel falls back to sample
data and says so.

## Configuration

Everything personal lives in `src/lib/config.ts`: your name, the assistant's
name (which is also the wake word), your fallback location, the watchlist,
and the panel refresh intervals. The fallback ships as Lantana, FL —
it is only a fallback, since the browser's own coordinates take over as soon
as you grant geolocation.

**"Near me" follows you, not the config.** Granting geolocation moves the
weather *and* the local news: the coordinates are reverse-geocoded server-side
through `/api/place`, and the resulting locality is what the news panel is
keyed by.

**Local news is ranked, not just sorted.** With `ANTHROPIC_API_KEY` set, the
local headlines are read and ordered by consequence to someone who lives there
— storms, closures, outages and council votes above sports recaps and "best
of" roundups, which get dropped entirely. Recency becomes the tiebreaker
rather than the sort. The panel shows a `RANKED` chip when that ran, because
otherwise a better sort is indistinguishable from the old one. Without a key,
or on any failure, it falls back to the recency order.

News sources live in `src/lib/feeds.ts`. **Adding your own city's outlet there
is the single highest-value edit in this repo** — a real local newsroom's feed
beats any aggregator. Two fallbacks sit behind it: a city with no curated
entry uses Google News' geo feed, and so does a city whose curated feeds all
fail, so a newsroom quietly changing its feed URL costs you freshness rather
than the whole "Near me" tab. Google News covers everywhere but runs
noticeably staler (a 2026 survey found a median item age around 6.6 days, with
only ~7.6% under six hours). That's why it's never the primary, why every
headline shows its age, and why anything over a day old is flagged amber.

## The portfolio

By default the panel shows live Yahoo quotes for the watchlist in
`src/lib/config.ts` — no key, no account, nothing that expires, and it works
before the market opens. Edit the list to make it yours:

```ts
export const WATCHLIST: Holding[] = [
  { symbol: "SPY", speak: true },              // watched, not held
  { symbol: "NVDA", shares: 40, speak: true }, // held, and read out loud
  { symbol: "VTI", shares: 120, speak: false },// on screen, never spoken
];
```

`shares` turns a watched symbol into a held one and puts it in the total.
`speak: false` keeps it on screen but out of the spoken briefing — which is
how you pick what gets talked about. A symbol you hold nothing of contributes
no total, so the briefing reads its movement rather than a balance, and only
when it actually moved by a percent or more.

## Connecting E*TRADE

Optional, and only worth it for real positions and cost basis. Yahoo covers
the rest.

1. Sign in at [developer.etrade.com](https://developer.etrade.com) with your
   E*TRADE account.
2. Complete the API Developer Agreement and the User Intent Survey. An
   individual key is issued immediately; sandbox first, then production.
3. `cp .env.example .env.local` and fill in the key and secret.
4. Set `SESSION_SECRET` in the same file. Without it the app still works, but
   the signing key is regenerated at boot, so a connection doesn't survive a
   restart and breaks outright on any host running more than one instance.
5. Restart, then hit **Connect E*TRADE** in the portfolio panel.

**Expect to reconnect every morning.** E*TRADE is OAuth 1.0a, and its access
tokens expire at midnight US Eastern — not a refresh-token flow, an actual
re-login. There's also a two-hour inactivity timeout. This used to be the one
thing on the dashboard that needed a daily human action; now it isn't, because
an expired session falls back to live watchlist prices rather than to nothing.
The panel prompts you, and works either way.

Access tokens ride in an httpOnly cookie, sealed with AES-256-GCM under
`SESSION_SECRET` before they leave the server. The browser holds ciphertext it
cannot read, cannot forge, and cannot hand to page JavaScript; a tampered
cookie fails to open rather than decrypting into anything useful. The server
keeps no per-session state at all, which is the point — the previous
in-memory design lost sessions at random on any host that runs more than one
instance or recycles them between requests, and blamed E*TRADE for it.

Expiry is still enforced server-side rather than left to the cookie: a token
minted on a previous US Eastern day is treated as dead, so you get a reconnect
prompt instead of a 401.

## Calendar, tasks and mail

Two ways to make the three personal panels real, and the app prefers them in
this order:

1. **Connect Google** — Miles polls Google Calendar, Gmail and Google Tasks
   directly. Free, nothing exposed to the internet, one-time consent. This is
   the recommended path.
2. **Zapier pushes** — works with non-Google sources (Todoist, Things), but
   the webhook action needs a paid Zapier plan and a public URL.

Until either is set up the panels show sample data and say so.

### Connecting Google (recommended)

One-time setup, about five minutes, no cost:

1. Go to [console.cloud.google.com](https://console.cloud.google.com), create
   a project (any name — "Miles" works).
2. **APIs & Services → Library**: enable the **Google Calendar API**, the
   **Gmail API**, and the **Google Tasks API**.
3. **APIs & Services → OAuth consent screen**: choose **External**, fill in
   the app name and your email, and add yourself under **Test users**. (Test
   mode is fine forever for an app only you use.)
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   type **Web application**, and under *Authorised redirect URIs* add

   ```
   http://localhost:3000/api/google/callback
   ```

5. Copy the client ID and secret into `.env.local` as `GOOGLE_CLIENT_ID` and
   `GOOGLE_CLIENT_SECRET`, set `SESSION_SECRET` if you haven't, restart.
6. Any panel showing sample data now offers **Connect Google** — click it,
   consent once, and the calendar, mail and task panels (and the briefing,
   and leave-by) run on your real data.

All three scopes are read-only: Miles can see your day, and cannot send mail,
edit events or complete tasks, because it never asked to be able to. The only
thing kept is the refresh token, sealed with AES-256-GCM under
`SESSION_SECRET`, on your disk. Disconnect with
`curl -X POST localhost:3000/api/google/disconnect`, and revoke Google's half
at [myaccount.google.com/permissions](https://myaccount.google.com/permissions).

The mail panel asks Gmail for `is:important is:unread newer_than:2d` by
default; set `GMAIL_SEARCH` to filter differently — `from:` lists of the
people you actually answer work well. Filter hard: a firehose just rebuilds
your inbox in a second place.

### Zapier pushes (the alternative)

For non-Google sources. Point a Zap at each ingest route and the panel is
real; a Google connection takes precedence when both exist.

In Zapier: your trigger → **Webhooks by Zapier**, POST with the header
`Authorization: Bearer $CALENDAR_INGEST_TOKEN` to

| Route | Trigger |
| --- | --- |
| `/api/calendar/ingest` | Google Calendar |
| `/api/tasks/ingest` | Todoist, Google Tasks, Things |
| `/api/email/ingest` | Gmail — **with a search**, see below |

**Zapier has to be able to reach your machine.** It runs in the cloud, and a
tailnet-only address doesn't exist from out there — so pointing a Zap at
`http://<machine>.<tailnet>.ts.net:3000/...` will not work. Expose the app to
Zapier with [Tailscale Funnel](https://tailscale.com/kb/1223/funnel):

```bash
tailscale funnel --bg 3000
```

That yields a public `https://<machine>.<tailnet>.ts.net` URL the Zaps can
POST to. The ingest routes are the only ones that write and they're
token-gated, but be clear-eyed that the read routes become public too; if that
bothers you, keep Funnel off and swap the push for a direct poll of the
source's API instead.

`DELETE ?id=<id>` on any of them handles a deletion Zap. These are the only
endpoints in the app that write, so they are the only ones with a secret, and
with `CALENDAR_INGEST_TOKEN` unset they refuse everything rather than accepting
anonymous writes. One token covers all three: three secrets to rotate would just
mean two that never get rotated.

**Zapier does not send one shape**, so none is demanded. Nested
(`start.dateTime`), flattened (`start__dateTime`) and renamed (`start_time`)
fields all parse. Attendees arrive as strings or as Google's objects. A bare
`date` becomes an all-day event; a missing end time defaults to an hour. Todoist
counts priority 4 down to 1 while everyone else sends a word — both work, and
anything unrecognised becomes medium rather than low, because guessing low
quietly buries work. Gmail's `from__name`/`from__email` pair and a raw
`Priya Raghavan <priya@nimbus.dev>` header both resolve.

A record that can't be read at all — an event with no start, a task with no
title — is rejected while the rest of the batch still lands, and the response
echoes back what was understood. Run your Zap's test and you can see whether a
calendar location became a drivable address.

**Filter the Gmail Zap.** Use a search like `is:important is:unread`, or a list
of the people you actually answer. Pushing everything turns the panel into a
second inbox, which is the thing a briefing exists to save you from.

**Nothing here can write back.** A push is one-directional, so clearing a
message means "handled, stop showing me this today" rather than marking it read
in Gmail, and ticking a task clears it from today's view rather than completing
it in Todoist. Both panels say so. A checkbox that quietly lies about the state
of your real inbox is worse than no checkbox.

**When a Zap stops firing**, the panel says `Last synced 3 days ago` rather than
presenting a stale push as today. A calendar silently showing yesterday is the
worst version of that failure, which is why the threshold is a day.

Records are kept in `.data/{calendar,tasks,mail}.json` — upserted by id, written
through one queue so simultaneous pushes can't interleave, and pruned on their
own schedule (events after two days, done tasks after a week, mail after a
week).

## Leave-by time

Above the panels, and only when there's something to drive to, is the one
number that tells you to stand up rather than describing your day: when to
walk out the door for the next event you can't attend from a desk.

It goes green, then amber inside forty-five minutes, then pink once you're
late — the loudest thing on the screen at exactly the moment it should be.

Events qualify by having a real street address, which is inferred from the
calendar's own location field. "500 S Australian Ave, West Palm Beach" is
drivable; "Conf Rm 4B", a Zoom link, "Remote" and "TBD" are not, and produce
nothing rather than a guess. That test errs toward silence on purpose — a
wrong address routes you somewhere you aren't going.

Routing is [OSRM](https://project-osrm.org)'s public server and geocoding is
Nominatim — no key, no account, no quota. The tradeoff is that OSRM has no
live traffic feed, so the estimate is padded (a third for rush hour, a tenth
otherwise, plus seven minutes door-to-door) and the UI says *estimated, no
live traffic* rather than implying a precision it doesn't have. Swap in a
traffic-aware router in `src/lib/providers/commute.ts` if you want the real
number.

## The briefing, written rather than listed

`GET /api/briefing` composes the spoken briefing two ways:

- **Deterministic** (always available, no key, no cost). Every section, in a
  fixed order. It lists.
- **Claude-authored** (`ANTHROPIC_API_KEY` set). Same data, read across
  instead of down: the deck that landed at 5:58 and the review it's for at 11,
  the only free window big enough for the overdue task, the drive that's in
  the rain. Sections with nothing notable are left out rather than narrated,
  and it ends on the single most useful thing to do first.

### Morning, what now, and wind-down

The full briefing is a morning thing. It plays once — on the first open of the
day, behind the arc reactor — and after that every open gets a short update
instead: the time, what you're in the middle of, what's next and how far away,
and only the mail and tasks close enough to the clock to be actionable.

None of the morning comes back. No weather forecast, no headlines, no
run-through of the day: by 3pm you know what today looks like, and the only
question left is *what now*. If nothing needs you, it says so and stops —
padding a short update is worse than silence.

**And it doesn't repeat itself.** Each thing worth saying carries a stable key
and an urgency stage, and the browser remembers what it was told and when. An
update twenty minutes after the last one skips whatever hasn't changed and says
only what has — mail that landed in those twenty minutes, a meeting that has
started, a task that has crossed into overdue.

The first open after **8pm** gets a once-daily evening wind-down instead. It
looks backward at how many tasks got finished, says where the portfolio or
watchlist closed when that data is real, and names the first event tomorrow.
It skips the morning boot sequence and never repeats weather, news, or today's
calendar. Later opens return to the short *what now* update. The moon button
in the header plays the wind-down on demand, including on browsers without
speech recognition.

A fact whose *urgency* changed is new information, not a repeat: "leave in
forty minutes" going quiet is right, and it becoming "leave in eight minutes"
and then "you're five minutes late" earns each of those. Both composers read
the same fact list, so the deterministic path and the Claude path suppress and
re-raise identically. The keys come back on `X-Briefing-Keys` and go out again
as `?said=`; `?since=` carries the timestamp.

The boot sequence is once a day too. A start-up animation you've already
watched is a gate, not a flourish. `GET /api/briefing?mode=now` and
`?mode=evening` are the same three briefings over HTTP, and the replay button
repeats whichever one you last heard.

Both follow the same order: **local news, then tasks, then the inbox**, then
a package arriving today if there is one, then the shape of the day, then
weather, the portfolio, and at most one item from the wider world. The single
exception is a leave-by time inside forty-five minutes, which jumps to the
front — "you should have left fourteen minutes ago" is not a sixth sentence.

The second is strictly an upgrade path. No key, a failed call, or a refusal
all fall back to the first, so the endpoint has no state where you get
nothing. `X-Briefing-Author` on the response says which one answered, and
`?author=template` forces the deterministic one.

Both composers read the same `BriefingSnapshot` and nothing else, so the
difference between them is judgement, not access. Generations are cached in
ten-minute buckets keyed on what's actually changed, so a page refresh doesn't
bill a new one.

`?format=json` returns the snapshot itself, for anything that would rather
render the data than hear it.

### Ask Miles anything

`GET /api/ask?q=<question>` answers one question, grounded in the exact same
`BriefingSnapshot` the briefing reads — "how's NVDA doing", "when's my next
thing with Sofia", anything about today. It's how "Hey Miles" handles
everything that isn't one of its recognised commands.

There's no deterministic floor here on purpose: a freeform question genuinely
needs a model to parse. Without `ANTHROPIC_API_KEY` the endpoint still
answers — honestly, saying it needs a key — rather than guessing at what was
asked. `/api/ask/audio` speaks the answer, the same way `/api/briefing/audio`
does.

### The week ahead

`GET /api/week` (and `/api/week/audio`) describes the shape of the next seven
days — which are heavy, which are wide open — by asking the calendar for each
day in parallel and comparing event counts. Deterministic and free: this is
structured data, not a judgement call, so it needs no model and works with no
key. "Hey Miles, week ahead" is the voice version; a good moment to ask is
Sunday night.

### Package radar

The mail panel already polls Gmail read-only; package radar asks it one more
question, with its own search (`PACKAGES_SEARCH`, default matches the major
carriers plus subjects like "shipped" or "out for delivery") so shipping
confirmations — rarely flagged important, often already read — aren't missed
by the inbox search. `GET /api/packages` returns everything currently in
transit; a banner appears above the panels only when something is arriving
**today**, the same way leave-by only appears when there's somewhere to
drive.

Carrier and delivery date are read heuristically from the subject and
snippet — best-effort, not a tracking-number integration. A message that
doesn't look like a real shipping update is left off rather than guessed at,
and delivered packages drop off the list once they've arrived. With nothing
connected this returns an empty list rather than sample data — a fabricated
package would be a strange thing to demo.

## Is any of this actually working?

Load **`/health`**.

Every upstream in this app fails safe on purpose — a dead feed drops its
headlines, a dead router hides the leave-by banner, a missing key falls back to
the deterministic briefing. That's the right behaviour, and it has one nasty
consequence: **a half-broken install looks exactly like a working one.** "Why
is Near Me empty" becomes an investigation rather than a glance.

So `/health` probes all of them and says which are `ok`, `failing` or `off`,
with the real error and a round-trip time. It distinguishes the three states
carefully:

- **failing** is a thing that should work and doesn't — including a feed that
  answers `200` with no items, which is what a moved feed URL looks like from
  the outside, and a Zapier store whose last push was over a day ago.
- **off** is a thing you haven't set up. No Claude key, no server voice, no
  E*TRADE, an empty store — all expected, all reported as off rather than
  broken.

Nothing on this page runs on the dashboard path. `GET /api/health` is the same
thing as JSON.

## Reaching it from your phone

The app is meant to be reached over [Tailscale](https://tailscale.com) rather
than deployed: one person, no public URL, and therefore no auth to build,
no login to get wrong, and no endpoint on the open internet serving your
inbox.

```bash
npm run dev:tailscale     # or: npm run start:tailscale, after a build
```

That binds every interface so the tailnet address is reachable — Tailscale's
own ACLs are what gate access, not the bind address. `next.config.ts` already
allows `*.ts.net` and the `100.64.0.0/10` range as dev origins, without which
the page server-renders on your phone but never hydrates.

Then, on the phone (the steps are Safari's, but Android Chrome is the same
shape):

1. Install the Tailscale app, sign into the same tailnet, flip it on.
2. Open `http://<machine>.<tailnet>.ts.net:3000` in the browser.
3. Share button → **Add to Home Screen**. It gets an icon and launches
   full-screen, without browser chrome; below `lg` the panels stack and the
   page scrolls normally, and the theme colour and `viewport-fit` handle the
   status bar and the notch.

No Tailscale yet and just want a first look? On the same Wi-Fi as the PC,
`npm run build && npm run start:tailscale`, find the PC's local IP
(`ipconfig` / `ifconfig`), and open `http://<that-ip>:3000` on the phone.
Production mode matters there: the dev server only trusts the origins in
`next.config.ts`, so over a bare LAN IP `next dev` renders but never hydrates.

iPhone specifics, honestly: Safari ships no speech recognition, so the
"Hey Miles" toggle hides itself there — the briefing still speaks, you just
start it with a tap. And Safari's built-in voices are the worst of any
platform, which is exactly what the server voice exists for: configure Piper
or ElevenLabs on the PC and the phone plays that audio instead.

## "Hey Miles"

With listening enabled — the **Hey Miles** toggle in the header — the tab
listens for its name through the browser's own speech recognition. Chrome and
Edge ship it; Firefox doesn't, and there the toggle simply doesn't render.

A few phrasings are recognised outright:

| You say | Miles does |
| --- | --- |
| "Hey Miles" (nothing after the name) | the short *what now* update |
| "Hey Miles, full briefing" / "…start over" | the whole morning briefing again |
| "Hey Miles, goodnight" / "…how did today go" | today's wind-down and tomorrow's first event |
| "Hey Miles, week ahead" / "…this week" | the shape of the coming week |
| "Hey Miles, stop" / "…be quiet" | stops talking |
| "Hey Miles, mute" / "…unmute" | the mute toggle |

**Anything else with real content is a question.** "Hey Miles, how's NVDA
doing" or "…when's my next thing with Sofia" goes to Claude, grounded in the
same data every other composer reads, and the answer is spoken back — one to
three sentences, only from what's actually in your day. This needs
`ANTHROPIC_API_KEY`; without one, asking says so honestly rather than
guessing at an answer. Only a bare "Hey Miles" with nothing after it means the
short update, since that's what asking for nothing means.

Three honest constraints. It's opt-in and persisted, because a dashboard must
never turn on the microphone by itself. It only listens while the tab is open,
and the browser shows its recording indicator the whole time — a feature, not
a bug. And it pauses while Miles is talking, so it can't hear its own voice
say its own name and loop. No audio leaves the machine through this app; the
recognition is the browser's. Renaming the assistant in `src/lib/config.ts`
renames the wake word with it.

## The boot sequence and the voice

Opening the app powers up an arc reactor over a black screen, runs its start-up
checks, then fades into the dashboard. Any click or keypress skips it, and
`prefers-reduced-motion` drops straight to the dashboard.

While that plays, the briefing is read aloud. It is spoken in one of two
voices, and the app prefers the first it can use:

- **The server's voice** (`GET /api/briefing/audio`), synthesised once per
  briefing and cached. Either [Piper](https://github.com/rhasspy/piper) — a
  local binary, no key, no network, no per-word cost — or ElevenLabs, if you
  want the better voice more than the zero dependency. Set either in
  `.env.local`; Piper wins when both are configured.
- **The browser's own engine**, if no backend is set up or synthesis fails.
  Free and offline, but the voice list differs on every platform, and none of
  the preferred ones exist on iOS Safari — which is the half of the time you
  would actually use this.

The fallback is automatic and silent: a missing binary, a bad key or a 502
costs you the better voice, never the briefing.

Two details that matter in the browser-engine path:

- **Browsers refuse speech without a user gesture.** That is discovered while
  the boot screen is still up, which is why the reactor screen is where it
  offers *Tap to enable voice* rather than the dashboard silently never
  talking.
- **Chrome stops synthesising a single long utterance after roughly fifteen
  seconds.** The briefing is split into sentence-sized utterances to get
  around it, which also makes stopping responsive.

The header carries a replay/stop control and a mute toggle. Mute persists
across visits and syncs between tabs.

## Speaking it somewhere else

`GET /api/briefing` returns the whole thing as plain prose, built for a
text-to-speech engine:

```bash
curl -s localhost:3000/api/briefing                    # the prose
curl -s localhost:3000/api/briefing/audio -o brief.wav # already spoken
```

It's deliberately a plain HTTP endpoint rather than an integration, so any
assistant, cron job or phone shortcut can consume it without this app knowing
anything about them — the in-app voice reads this exact text. Each section is
independent: a dead upstream drops that sentence rather than the whole
briefing.

## How the live panels work

Every live panel goes through the same path, so loading, failure, staleness and
partial failure are handled once instead of per panel:

```
src/
  app/
    api/{news,weather,place,briefing,etrade/*}/route.ts  server-side fetching
    error.tsx / global-error.tsx / not-found.tsx         app-level failure states
  lib/
    cache.ts        TTL cache: dedupes in-flight calls, serves stale on failure
    health.ts       probes every upstream — see /health
    panel.ts        the one response shape every panel route returns
    feeds.ts        curated RSS sources — edit this
    config.ts       name, home location, refresh intervals
    providers/
      news.ts       RSS/Atom/RDF parsing, per-feed error isolation
      weather.ts    Open-Meteo + Nominatim reverse geocoding
      etrade/       OAuth 1.0a signing, live client, mock provider
      google/       direct polling: OAuth, Calendar, Gmail, Tasks — all read-only
    seal.ts         AES-256-GCM sealing for stored secrets
      commute.ts    OSRM routing + Nominatim geocoding for the leave-by time
      news-rank.ts  ranks local headlines by consequence, falls back to recency
      quotes.ts     keyless Yahoo quotes over the configured watchlist
    push/           shared ingest auth and the serialised JSON store
    calendar/       Zapier-fed schedule: normalise, persist, read today
    tasks/          Zapier-fed task list, sorted overdue-first
    mail/           Zapier-fed inbox, filtered upstream
    tts/            server-side speech: Piper or ElevenLabs, cached per briefing
    packages.ts     heuristic shipping-mail classifier for the package radar
    briefing/
      snapshot.ts   everything known about today, gathered once
      template.ts   the deterministic composer — always available
      now.ts        the short "what now" update for every open after the first
      evening.ts    today's wind-down and tomorrow's first calendar event
      week.ts       the coming week's shape — deterministic, no key needed
      ask.ts        freeform Q&A over the snapshot — Claude-only, no floor
      claude.ts     the Claude-authored composer — upgrade path, never required
  components/
    ArcReactor.tsx    generated SVG geometry, animated in CSS
    BootSequence.tsx  start-up overlay, skippable
    LeaveBy.tsx       the walk-out-the-door banner
    PackagesStrip.tsx the "arriving today" banner
    SourceNotice.tsx  says when a panel is on sample data or a stale push
    VoiceProvider.tsx owns the boot overlay and the speech session
    WeatherStrip.tsx  header summary; click for the full forecast
  hooks/
    useWakeWord.ts    "Hey Miles" over the browser's own speech recognition
    usePanelData.ts   loading/error/stale/refresh, pauses polling when tab hidden
    useLocation.ts    geolocation, reverse-geocoded, with configured fallback
    useDailySet.ts    day-scoped localStorage for ticks and reads
    useBriefingVoice.ts speech synthesis, voice selection, mute preference
```

Three deliberate choices worth knowing:

- **One bad source never blanks a panel.** Feeds are fetched concurrently and
  failures are isolated; the panel renders what succeeded and names what
  didn't. If a refresh fails outright, the last good value is served and
  labelled `CACHED`.
- **Secrets stay server-side.** OAuth 1.0a signs every request with the
  consumer secret, so all E*TRADE calls happen in route handlers.
- **Polling pauses when the tab is hidden.** A backgrounded dashboard
  shouldn't hammer upstream APIs all day.
- **Nothing lives in server memory.** The cache is a bounded TTL map that can
  be thrown away at any moment; the E*TRADE session is a sealed cookie. Both
  are deliberate: anything held in a module-level `Map` is a bug waiting for
  the day the app runs on more than one instance.

## Tests

```bash
npm test        # vitest
npm run lint
npm run typecheck
```

All three plus `npm run build` run in CI on every push and pull request
(`.github/workflows/ci.yml`). The build is in there because it catches what
the others can't: a route that only fails once Next traces it, and any
accidental client/server boundary crossing.

The suite covers the places bugs actually hide:

- **RSS parsing** — RSS 2.0, Atom and RDF, CDATA, entity escapes, missing
  fields, junk input, cross-outlet dedupe.
- **OAuth 1.0a signing** — pinned against the published OAuth 1.0 signature
  vector, so a broken signature is caught without live credentials.
- **The cache** — including a regression for a real bug: the in-flight dedupe
  used to `await` outside the `try`, so a failed refresh served stale data to
  the caller that started it and threw at every caller that joined it.
- **Session sealing** — round trip, tamper rejection, wrong-key rejection, and
  the midnight-US-Eastern expiry boundary (including a UTC midnight that isn't
  an Eastern one).
- **Weather mapping** — every field the panel and the spoken briefing read,
  and the wall-clock parsing that stops a server in another timezone from
  announcing a 3am sunrise.
- **Feed routing** — that Lantana, its neighbouring towns and a bare county
  name all reach the same newsrooms.
- **Commute maths** — rush-hour padding, counting back to a leave-by time,
  going negative once you're late, and returning nothing rather than throwing
  when the geocoder or the router is down.
- **Briefing composition** — that the deterministic briefing is valid with
  every upstream dead, speaks symbols as words, stays quiet about a portfolio
  that isn't connected, holds the local-news-first order, and hoists an
  imminent leave-by above it.
- **Ingest** — every Zapier field shape for all three sources, the address test
  that gates leave-by, sender parsing, priority mapping, and a store that
  survives a restart, upserts by id, doesn't lose simultaneous writes, and
  distinguishes an empty real calendar from no calendar at all.
- **The now-brief** — that it repeats none of the morning, scopes tasks and
  mail to the current hour, counts down only inside the horizon, never doubles
  the period after a spoken time, says nothing when nothing has changed, and
  re-raises a fact whose urgency moved (a countdown going critical, a task
  going overdue) while staying quiet about one that merely still exists.
- **Health checks** — that a feed answering 200 with no items is a failure, an
  unconfigured key is not, and a store nobody has pushed to is empty rather
  than broken.
- **Google** — event, message and task mapping (all-day events, Zoom rooms
  getting no address, Gmail's structural labels, Tasks' fake-midnight due
  dates); and the grant store: sealed on disk and never plaintext, access
  tokens cached, a revoked grant forgotten rather than retried forever.
- **The wake word** — matched against what recognition actually produces:
  comma-happy greetings, the name mid-utterance, and near-misses ("forty miles
  away", "smiles") that must not trigger it; plus the command grammar and its
  fall-through to a freeform question when nothing else matches.
- **Package radar** — carrier and status detection per major carrier, ETA
  parsing (today/tomorrow/weekday/month-day), out-for-delivery defaulting to
  today with no explicit date, delivered packages dropped from the list, and
  `getPackages()` returning an empty list rather than sample data when
  nothing's connected.
- **Ingest auth** — bearer and header forms, a near-miss token rejected on
  length before comparison, and everything refused when no token is set.
- **News ranking** — that a model's output is validated rather than trusted:
  out-of-range, duplicate and non-numeric positions are ignored, a chatty or
  fenced reply still parses, and everything else falls back to recency.
- **Speech backends** — backend selection and precedence, that the key travels
  as a header and never in a URL, that identical text is synthesised once, and
  that every failure path returns null so the browser engine takes over.

## Note on `next.config.ts`

`allowedDevOrigins` is set because Next 16 blocks its own dev-only resources
for any origin other than `localhost`. Without it the page server-renders but
never hydrates when you reach the dev server over `127.0.0.1`, a LAN IP or a
forwarded port — the panels look right but nothing clicks.
