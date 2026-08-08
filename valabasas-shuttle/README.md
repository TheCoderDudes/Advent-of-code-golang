# Valabasas Shuttle

A driving dashboard for shuttling buyers between the Las Vegas Convention Center and the
private suite during show week. Mobile-first, dark, one-handed, installable to the iPhone
Home Screen, and it works with no signal at all — everything lives on the device.

- **Stack:** Vite + React + TypeScript + Tailwind. No backend, no auth, no database.
- **Storage:** `localStorage`, written on every state change.
- **Time:** every date and time is forced to `America/Los_Angeles`, whatever the phone says.
- **Network:** only used when you tap Navigate (opens Google Maps). Everything else is offline.

---

## Run it locally

```bash
cd valabasas-shuttle
npm install
npm run dev          # http://localhost:5173
```

Other scripts:

| command | what it does |
| --- | --- |
| `npm run build` | typecheck + production build into `dist/` |
| `npm run preview` | serve the built app (this is what the E2E tests drive) |
| `npm test` | unit tests — grouping, split/merge, CSV, links, time math |
| `npm run e2e` | Playwright end-to-end run of the whole driving flow |
| `npm run icons` | regenerate the PWA icon set |

The E2E suite needs a Chromium. If Playwright's own download is unavailable, point it at one
you already have:

```bash
CHROMIUM_PATH=/path/to/chrome npm run e2e
```

---

## Deploy

Both configs are committed, so it's a one-command deploy either way.

**Vercel**

```bash
npm i -g vercel
cd valabasas-shuttle
vercel                 # first time: link the project, accept the defaults
vercel deploy --prod   # or: npm run deploy:vercel
```

**Netlify**

```bash
npm i -g netlify-cli
cd valabasas-shuttle
npm run build
netlify deploy --prod --dir=dist   # or: npm run deploy:netlify
```

Either host gives you an HTTPS URL. HTTPS matters — service workers, the install prompt and
the wake lock all refuse to run over plain HTTP.

---

## Add it to your iPhone Home Screen

1. Open the deployed URL in **Safari** (not Chrome — only Safari can install to the Home Screen).
2. Tap the **Share** button (the square with the arrow, in the bottom bar).
3. Scroll down and tap **Add to Home Screen**.
4. Name it *Shuttle* and tap **Add**.
5. Launch it from the Home Screen icon. It opens full-screen with no Safari chrome, and it
   keeps working with no signal.

To update after a redeploy: open the app, pull down to refresh, or close it from the app
switcher and reopen. The service worker picks up the new version on the next launch.

---

## First-run setup

The app opens on **Import** the first time. Before your first run, go to **Settings** and fill in:

- **Suite address** — hotel + suite number. Blank by default on purpose; the app nags until you
  set it rather than shipping a wrong address that silently misroutes you.
- **My name** and **vehicle description** — these fill the text templates.
- **Vehicle capacity** — defaults to 6 seats.
- **Estimated drive time one-way** — defaults to 12 minutes.

---

## Importing your schedule

Export your Google Sheet as CSV and upload it on the **Import** screen. Headers are matched
case-insensitively with tolerant synonyms (`Company` → Account, `Pax` → Party Size, `Mins` →
Duration, and so on):

```
Date, Time, Account, Contact, Phone, Party Size, Pickup Location, Duration, Notes
```

`sample-appointments.csv` in this folder is a realistic show day you can import to see how
everything behaves — three accounts in the same 8:00 AM slot, one seven-person party that
trips the capacity warning, staggered return times, one buyer at a different hotel, and one
with no phone number. **Change the `Date` column to your actual show days** before using it
for anything real.

You get a preview table before anything commits, with any unreadable rows called out, and a
choice between replacing your schedule or merging into it. Phone numbers are normalised to
E.164 (`+1XXXXXXXXXX`); anything that isn't a usable number imports blank and simply disables
call/text for that account instead of dialling something wrong.

There's an **Export CSV** button on the same screen for backing up or handing the day off.

---

## How runs work

An appointment automatically produces two legs: a **pickup** (get them to the suite by the
start time) and a **return** (take them back once the meeting is over).

Legs going the same direction at close-enough times are grouped into a **Run** — one drive
carrying several accounts. The two directions group independently, so three buyers who ride
in together at 8:00 can absolutely leave at 9:00, 9:30 and 10:00 as three separate runs.
The closeness threshold is the **auto-group window** in Settings (20 minutes by default).

Grouping is only a suggestion:

- **Split** an account out of a run into its own (per-account **More**, or the red *Split this
  run* shortcut on a capacity warning).
- **Merge** two runs (Day timeline → *Merge with…*, or the one-tap fix on a conflict badge).
- **Move** an account from one run to another (per-account **More** → *Move to another run*).

Anything you do by hand is pinned, and auto-grouping will never quietly undo it. Regardless of
what you do, every scheduled appointment belongs to exactly one pickup run and exactly one
return run — that's enforced centrally and covered by tests.

Inside a run, each account carries its own **waiting / onboard / dropped** state, so you can
chase the one buyer who isn't outside yet without touching the other two. The run can't be
completed until everyone is resolved, and **no-show — leave without them** is always available.
Marking a no-show removes that account's return run and tells you it did.

### Leave-by math

```
pickup run:  leave by = appointment start − drive time − buffer − (extra stops × per-stop minutes)
return run:  leave by = meeting end − buffer          (you're already at the suite)
```

The card goes amber 15 minutes before leave-by and red once it's passed, and beeps + vibrates
when the time hits while the app is open.

One note on the pickup formula, which is exactly as specified: it subtracts the drive *back* to
the suite but not the drive *out* to the convention center, so with a 12-minute estimate you'd
leave 22 minutes early and arrive about 12 minutes late. Settings has a **Round-trip leave-by**
toggle that counts both drives. It's off by default so the specified behaviour is what ships —
flip it on if you want the leave-by time to match what the clock actually does.

---

## Integrations

All native URL schemes, no API keys.

- **Navigate** — `comgooglemaps://` first, falling back to `https://www.google.com/maps/dir/`.
  The destination follows the run: pickup point(s) → suite on the way in, suite → drop-off(s)
  on the way back. When a run has more than one address, it builds a multi-stop route with
  `waypoints=` on the web URL, because the app scheme doesn't handle waypoints reliably. Origin
  is left off so Maps starts from wherever you actually are.
- **Call** — `tel:+1XXXXXXXXXX`. One account dials straight through; several open a picker.
- **Text** — `sms:+1XXXXXXXXXX&body=…` (the iOS-compatible `&body=` form). iOS can't compose one
  SMS to several people from a URL, so *Text all* queues them and you tap through one at a time.
  Templates with `{contact}` `{account}` `{me}` `{vehicle}` `{minutes}` are editable in Settings,
  and any template using `{minutes}` opens a 5 / 10 / 15 / 20 / 30 quick-pick first.

---

## Screens

- **Now** — the current run in big type: verb, where, live countdown to leave-by, total heads,
  and a stacked list of accounts each with its own call / text / no-show. One big button walks
  the run through *Start driving → Arrived → Everyone onboard → Complete*, with a boarding
  checklist on multi-account runs. A smaller NEXT card sits underneath.
- **Day** — every run for the day in order, accounts stacked inside each block, overlap
  conflicts flagged with a one-tap merge when they're the same direction, counters at the top,
  and an end-of-day summary once the day is done.
- **Accounts** — every appointment grouped by day, searchable, add/edit/delete by hand.
- **Import** — CSV in, CSV out.
- **Settings** — addresses, timing, capacity, grouping, templates, and *Wipe all data*.

---

## Layout of the code

```
src/
  lib/
    runs.ts        auto-grouping, reconciliation, split/merge/move, leave-by, conflicts
    time.ts        America/Los_Angeles helpers and tolerant date/time parsing
    csv.ts         PapaParse import with fuzzy headers + export
    links.ts       maps / tel / sms URL builders, template rendering
    navigation.ts  which address the Navigate button should target right now
    selectors.ts   which run is "now", which is next, how far behind the day is
    hooks.ts       ticking clock, wake lock, alert tone, vibration
  state/
    reducer.ts     every mutation funnels through reconciliation
    store.tsx      context + persistence on every change
  screens/         Now, Day, Accounts, Import, Settings
  components/      run card, passenger row, message sheet, shared UI
```
