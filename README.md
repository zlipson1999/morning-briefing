# Morning Briefing

A dark, single-screen dashboard for the start of the day: schedule, inbox,
tasks, news, weather and portfolio, all visible without scrolling — plus the
one line that actually changes what you do next, which is when to leave.

Next.js 16 (App Router), Tailwind CSS v4, TypeScript.

## Run it

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
| **Today's schedule** | mock | Finished events dim and strike through, the current one is tagged `NOW` and the next `NEXT`, header counts what's left |
| **Unread email** | mock | Click to toggle read; the unread count follows. Persists for the day |
| **Task list** | mock | Tick to complete; live progress bar and overdue callout. Persists for the day |
| **Today's news** | **live** | Local and world headlines over curated RSS. Every item carries its source and age |
| **Weather** | **live** | Open-Meteo, in the header beside the date — click it for the full forecast |
| **Portfolio** | **live-wired** | Real E*TRADE positions and day P/L once connected; sample data until then |
| **Leave by** | **live** | Drive time to the next event with a real address, counted back to a walk-out-the-door time |

Calendar, email and tasks still run on the typed mock arrays in
`src/lib/data.ts` — swap them for real APIs the same way the live panels work.

## Configuration

Everything personal lives in `src/lib/config.ts`: your name, your fallback
location, and the panel refresh intervals. The fallback ships as Lantana, FL —
it is only a fallback, since the browser's own coordinates take over as soon
as you grant geolocation.

**"Near me" follows you, not the config.** Granting geolocation moves the
weather *and* the local news: the coordinates are reverse-geocoded server-side
through `/api/place`, and the resulting locality is what the news panel is
keyed by.

News sources live in `src/lib/feeds.ts`. **Adding your own city's outlet there
is the single highest-value edit in this repo** — a real local newsroom's feed
beats any aggregator. Two fallbacks sit behind it: a city with no curated
entry uses Google News' geo feed, and so does a city whose curated feeds all
fail, so a newsroom quietly changing its feed URL costs you freshness rather
than the whole "Near me" tab. Google News covers everywhere but runs
noticeably staler (a 2026 survey found a median item age around 6.6 days, with
only ~7.6% under six hours). That's why it's never the primary, why every
headline shows its age, and why anything over a day old is flagged amber.

## Connecting E*TRADE

The portfolio panel shows sample positions until you add a key.

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
re-login. There's also a two-hour inactivity timeout. For a dashboard you open
once a day that's close to free, and the panel prompts you when it happens.

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

## Leave-by time

Above the panels, and only when there's something to drive to, is the one
number that tells you to stand up rather than describing your day: when to
walk out the door for the next event you can't attend from a desk.

It goes green, then amber inside forty-five minutes, then pink once you're
late — the loudest thing on the screen at exactly the moment it should be.

Events qualify by having a real street address. A Zoom call has a `location`
but no `address`, and that distinction is the whole signal: the panel would
rather show nothing than guess where "Conf Rm 4B" is.

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

## The boot sequence and the voice

Opening the app powers up an arc reactor over a black screen, runs its start-up
checks, then fades into the dashboard. Any click or keypress skips it, and
`prefers-reduced-motion` drops straight to the dashboard.

While that plays, the briefing is read aloud — schedule, inbox, tasks,
portfolio and headlines — through the browser's own speech engine. No API key
and no audio files.

Two details that matter in practice:

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
curl -s localhost:3000/api/briefing | piper --model en_US-lessac-medium --output_file brief.wav
```

It's deliberately a plain HTTP endpoint rather than an integration, so any
assistant, cron job or phone shortcut can consume it without this app knowing
anything about them — the in-app voice reads this exact text. Each section is
independent: a dead upstream drops that sentence rather than the whole
briefing.

## On a phone

The app ships a web manifest and installs to a home screen as a standalone
app, which is where a morning briefing is actually read. Below `lg` the panels
stack and the page scrolls normally; the theme colour and `viewport-fit`
handle the status bar and the notch.

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
    panel.ts        the one response shape every panel route returns
    feeds.ts        curated RSS sources — edit this
    config.ts       name, home location, refresh intervals
    providers/
      news.ts       RSS/Atom/RDF parsing, per-feed error isolation
      weather.ts    Open-Meteo + Nominatim reverse geocoding
      etrade/       OAuth 1.0a signing, live client, mock provider
      etrade/seal.ts  AES-256-GCM sealing for the session cookie
      commute.ts    OSRM routing + Nominatim geocoding for the leave-by time
    briefing/
      snapshot.ts   everything known about today, gathered once
      template.ts   the deterministic composer — always available
      claude.ts     the Claude-authored composer — upgrade path, never required
  components/
    ArcReactor.tsx    generated SVG geometry, animated in CSS
    BootSequence.tsx  start-up overlay, skippable
    LeaveBy.tsx       the walk-out-the-door banner
    VoiceProvider.tsx owns the boot overlay and the speech session
    WeatherStrip.tsx  header summary; click for the full forecast
  hooks/
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
  every upstream dead, speaks symbols as words, and stays quiet about a
  portfolio that isn't connected.

## Note on `next.config.ts`

`allowedDevOrigins` is set because Next 16 blocks its own dev-only resources
for any origin other than `localhost`. Without it the page server-renders but
never hydrates when you reach the dev server over `127.0.0.1`, a LAN IP or a
forwarded port — the panels look right but nothing clicks.
