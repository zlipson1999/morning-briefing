# Setting up Miles, from zero

Everything from a bare computer to the briefing playing on your phone, in
order. Do the parts top to bottom; each one only needs doing once except the
last.

## 1. Install the basics

1. Install **Node.js** from [nodejs.org](https://nodejs.org) — the LTS button,
   default options.
2. Install **Git** from [git-scm.com](https://git-scm.com) if you don't have
   it (Mac already does).

## 2. Get Miles

Open a terminal (Windows: PowerShell) and run, one line at a time:

```bash
git clone https://github.com/zlipson1999/morning-briefing
cd morning-briefing
git checkout claude/morning-briefing-improvements-9btzw4
npm install
```

Then make your settings file:

```bash
copy .env.example .env.local      # Windows
cp .env.example .env.local        # Mac / Linux
```

## 3. Create the Google connection (free, ~5 minutes)

This is what lets Miles read your real calendar, Gmail and tasks — read-only,
straight from Google, nothing shared with anyone.

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and sign
   in. Project dropdown (top left) → **New Project** → name it `Miles` →
   Create → make sure it's selected.
2. **APIs & Services → Library**: search for and **Enable** each of:
   *Google Calendar API*, *Gmail API*, *Google Tasks API*.
3. **APIs & Services → OAuth consent screen**: choose **External**; app name
   `Miles`, your email where asked; under **Test users** add your own Gmail
   address. Save. (Test mode is fine forever for an app only you use.)
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   application type **Web application**; under *Authorised redirect URIs* add
   exactly:

   ```
   http://localhost:3000/api/google/callback
   ```

   Create, and keep the **Client ID** and **Client secret** it shows you.

## 4. Fill in `.env.local`

Open `.env.local` in any text editor. Every entry has instructions above it;
the ones that matter:

| Setting | Where it comes from | Why |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | step 3 | your calendar, mail and tasks |
| `SESSION_SECRET` | run `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"` | connections survive restarts |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) — optional, ~a cent a morning | Claude writes the briefing and ranks local news |

Also open `src/lib/config.ts` and put your own stocks in `WATCHLIST` —
`shares:` for what you own, `speak: false` for anything you want on screen
but not read aloud.

## 5. First run

```bash
npm run build
npm run start:tailscale
```

1. Open **http://localhost:3000** — the arc reactor boots and the briefing
   plays. If the browser asks, click *Tap to enable voice*.
2. Click **Connect Google** on any panel showing sample data → approve the
   consent screen once. Your real day appears.
3. Open **http://localhost:3000/health** — News, Weather, Commute, Yahoo and
   Google should be green. Anything red names its actual error.
4. Optional: click **Hey Miles** in the header (Chrome/Edge), allow the mic,
   and say *"Hey Miles"* out loud.

## 6. The phone

1. Install **Tailscale** on the PC from
   [tailscale.com](https://tailscale.com), sign in (Google login works, free).
2. Install the **Tailscale app** on the phone, sign into the *same* account.
   When iOS says Tailscale wants to add a VPN configuration, tap **Allow** —
   that prompt *is* Tailscale, not a request to buy something. Toggle it on.
3. In the phone's Tailscale app, find your PC's name (like
   `desktop-abc123`), then open in Safari:

   ```
   http://<that-name>.<your-tailnet>.ts.net:3000
   ```

4. Share button → **Add to Home Screen** → **Add**. Miles now launches
   full-screen from its own icon, from anywhere — as long as the PC is on.

iPhone notes: no "Hey Miles" there (Safari has no speech recognition — the
toggle hides itself), and if the voice sounds rough, set up Piper on the PC
(`PIPER_BIN` / `PIPER_VOICE` in `.env.local`) so every device plays the same
good voice.

## 7. Day to day

Keep the PC on with `npm run start:tailscale` running. That's the whole
routine — first open of the day gets the boot sequence and the full briefing,
every open after that gets a short "what now" update that never repeats
itself, and the first open after 8pm gets the evening wind-down. You can also
say *"Hey Miles, goodnight"* whenever you want to hear it.

## Optional extras

- **E*TRADE** — real positions and cost basis instead of watchlist quotes.
  See the README; expect to reconnect each morning (their tokens expire
  nightly, not ours).
- **Piper voice** — one good voice on every device, no key, no cost:
  [github.com/rhasspy/piper](https://github.com/rhasspy/piper).
- **Local news feeds** — `src/lib/feeds.ts` is preloaded for Palm Beach
  County; add or swap outlets any time.

## When something looks wrong

**http://localhost:3000/health** first — it probes every service Miles
depends on and says which one is broken and why, so a quiet panel never has
to be a mystery.
