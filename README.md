# Cleveland Civic Access · kiosk prototypes

Prototypes for **Cleveland Civic Access**, a resident-centered front door to services across Cleveland Public Library, the City of Cleveland, and CMSD. This repo holds three things on one app:

| Path | What | Status |
|---|---|---|
| **`/libraryentrance`** (and `/`) | **Main Library entrance kiosk.** Whole-building orientation beside the catalog computer, with **"Ask a library assistant"** answered by a real person | ▶ Current target, Cut 1 (Walkable) |
| **`/staff`** | **Library assistant console.** The person answering sees questions arrive live, replies, and tags each answer's source | Built ahead of Cut 2 at Jungu's request |
| **`/techcentral`** | **TechCentral concierge kiosk** (printing and 3D printing), with its phone pages, printed slip, and release-station card | 📌 Pinned, unchanged |

> **Status: prototype, not for patrons.** Every unverified fact is a placeholder: the entrance shows them as visible `[PLACEHOLDER: …]` tags. There's no placeholder build gate and no catalog sync yet (see [Known gaps](#known-gaps)).

**Try it:**
```bash
npm --prefix app install
```
```bash
npm --prefix app run dev
```
Then open http://localhost:5180. That's the entrance kiosk. The index of every page and flag is at `/links`.

To try the live assistant:
1. Open `/staff` in a second window. There's no sign-in.
2. Switch **Ask on the kiosk** on.
3. On the kiosk, tap to start, then **Ask a library assistant**.

---

## Where things live

| Truth for… | Lives in |
|---|---|
| **Why and what:** product intent, the build slices, the mockup spec, the facts catalog | The project's Obsidian vault, `build/`: `BUILD-SPEC.md`, `entrance-kiosk/BUILD-entrance-kiosk.md`, `techcentral-pilot/mockup-spec.md`, `catalog/`. Read-only for coding agents |
| **How:** implementation | This repo |
| **Proposed scope or intent changes from a build session** | The vault's `build/_FROM-BUILD.md`, the only file an agent may write there. Jungu merges it |

## How it's built

```
app/
  index.html, vite.config.ts      One Vite + React + TypeScript app; /api is proxied to the relay in dev
  server/index.ts                 The library assistant relay (Node, no dependencies, runs TypeScript directly)
  server/hours.json               Posted hours for Ask (empty = not decided yet; the switch alone decides)
  scripts/dev.mjs                 Starts the relay (5181) and Vite (5180) together
  src/main.tsx                    Router: /libraryentrance, /staff, /techcentral/…, /links
  src/entrance/                   The entrance kiosk
  src/staff/                      The console
  src/kiosk/, src/phone/, src/print/, src/Links.tsx   The TechCentral prototype (pinned; served under /techcentral)
  src/content/entrance.json       Entrance copy and facts (all placeholders in Cut 1)
  src/content/*.json              TechCentral copy and facts
  src/lib/                        Shared: placeholder rendering, icons, CPL mark, QR, speech
  CPL_TheCenter_icon.svg          The CPL mark
design-reference/                 The original design-canvas mockups (TechCentral)
DESIGN-SYSTEM-REVISION-*.md       Prompts sent to revise the CPL Design System's Service mode
HANDOFF.md, CLAUDE-CODE-PROMPT.md The original TechCentral handoff (historical)
```

`app/CPL-Design-System.html` is the CPL Design System reference. It's git-ignored, so get it from the design team.

### The entrance kiosk (`/libraryentrance`)

- **Same app, components, tokens, motion layer, and session lifecycle** as the TechCentral kiosk:
  - attract screen, Home, Back, Accessibility (larger text on by default, high contrast, read aloud) and Start over. Unlike TechCentral, the entrance bar has no Staff help button;
  - "Still there?" after 50 seconds, then a 15-second countdown, then a full reset that wipes the conversation.
- **Attract screen:** "New here? Find your way around the Main Library", plus the catalog-computer redirect for people looking for a book.
- **Home:**
  - "Ask a library assistant", shown only while a person is on;
  - a short draft directory (six starting entries for desk staff to correct);
  - the TechCentral doorway.
- **Directory entry:** floor, nearest desk, hours, and a photo slot, all placeholder tags.
- **TechCentral doorway:** location and hours, plus buttons into the TechCentral prototype's print and 3D-print plans, with tags on. Start over there brings the kiosk back to the entrance.
- **Ask panel** (mockup spec §5, Phase 1):
  - a full-height chat. Before the first message it's voice-first: a large record button ("Tap and ask out loud"), then suggested questions; after that, bubbles above a message field with a small mic and Send at the bottom, and the on-screen keyboard docked under it. There's no public-screen notice;
  - **voice input:** tap the mic for a live dictation view (bars that follow your voice, words appearing as you speak); when you finish, the view shows what it heard with **Retry** or **Send it** (Send it sends the message and returns to the chat). It uses the browser's speech recognition; in Chrome that means Google's speech service hears the audio. `?voice=demo` plays a scripted dictation without a microphone, and `?voice=off` hides the mic;
  - "The library assistant is looking into it" while waiting; if no reply comes, the panel says where staff are;
  - **Close ends the conversation:** with a conversation going, Close (or Back, Escape, the backdrop) asks "End this chat?" Ending it tells the relay (the console marks it ended; the log says "patron ended the chat") and erases it from the screen. "Based on: …" only steps out to a place and keeps the conversation;
  - each reply with "Based on: …", a source line, and Helpful / Not helpful;
  - after the reply timeout (2 minutes), a plain pointer to staff;
  - typed emergency words show the locked emergency message instantly; "Are you a bot?" is answered with locked copy by the person at the console;
  - no AI cues anywhere.
- **While waiting for a reply, the idle timer pauses** (until the reply timeout), so the kiosk doesn't wipe a conversation while the patron is standing there.

### The relay and console (`/staff`)

The relay (`app/server/index.ts`) passes questions from a kiosk session to the console and replies back, in real time.
- **How it talks:** server-sent events out, plain POSTs in.
- **Storage:** in memory only. A restart erases everything.
- **When Ask shows on the kiosk:** only when the console switch is on, a console is connected, and it's inside the posted hours (none are set yet).

The console is one screen for one person:
- a queue with wait timers and badges ("Emergency words", "Are you a bot?");
- the conversation;
- saved answers (tap to use, then edit) and locked answers (one tap, can't be edited);
- a **source tag** on every reply: catalog fact, named source, or none, which is logged as a candidate catalog entry;
- "Send to the desk now", which marks a handoff;
- **Settings** (patron-facing switches, live, reset on relay restart). First one: **Place cards start a chat**. When it's on and Ask is showing, tapping a place on Home opens the chat and sends that card's question as the patron's first message; when it's off, the card opens the place's info screen;
- **Delete conversation** for a finished one (confirm step), or **Clear ended conversations** for all of them. Open conversations can't be deleted. Deleted ones also leave the log export;
- an optional chime for new questions;
- **Export log (CSV)**, one row per exchange: time, kiosk, context, question, answer, source, response time, outcome, vote. It holds no patron identifiers.

**Access:** the console is open, with no sign-in, by default. Set `STAFF_PASSCODE` on the relay to require a passcode, which you should do before the kiosk is on any network other people can reach. There are no accounts.

### The TechCentral prototype (`/techcentral`)

Unchanged, served under a new prefix: the kiosk, the phone pages at `/techcentral/tc/*`, the slip and card at `/techcentral/print/*`, and its own index at `/techcentral/links`. Old `/tc/*` and `/print/*` links redirect.

Demo it with placeholder tags on (`/techcentral?ph=tags`). Its stubbed assistant still uses the earlier "AI answer" labelling.

Details are in [app/README.md](app/README.md).

## Design

Both kiosks and the console follow the **CPL Design System, Service mode**:
- navy and butter fields with a marigold call to action;
- one primary action per screen, with the ghost button left and the primary right;
- square geometry, 1.5px line icons, and 48px targets;
- radio cards for pick-one choices, and coral for safety.

The kiosks also carry two labelled departures, pending the design-system revision in the prompt files:
- an **expressive motion layer**, off under reduced motion;
- **large-display exceptions:** filled navy icon tiles and 2px borders.

## Run, build, configure

| Command | What it does |
|---|---|
| `npm --prefix app run dev` | Relay on 5181 and Vite on 5180, which proxies `/api` |
| `npm --prefix app run build` | Static build into `app/dist/` |
| `npm --prefix app start` | The relay serves `app/dist/` and `/api` from one process (`RELAY_PORT` or `PORT`) |

**Relay environment variables:**
- `STAFF_PASSCODE` (optional; unset means `/staff` is open with no sign-in)
- `REPLY_TIMEOUT_S` (default 120)
- `RELAY_PORT` or `PORT`

**Entrance flags:**
- `?ask=live|scripted|off` (scripted = canned replies at a person's pace, for demos with nobody at the console)
- `?replyDelay=7` and `?noreply=1` (scripted mode)
- `?replyTimeout=20`
- `?hours=off` (scripted: Ask hidden)
- `?kiosk=main-entrance`
- `?voice=demo|off` (simulated dictation, or no mic button)
- `?cards=chat` (scripted mode: act as if "Place cards start a chat" were on)

**Shared kiosk flags:**
- `?orient=portrait|landscape|auto`
- `?lg=0`
- `?idle=10&countdown=8`
- `?timers=off`
- `?fit=0`

## Deployment

| Where | What runs there | URL |
|---|---|---|
| **Railway** (project `cpl-civic-access`, service `relay`) | The whole app: the relay serves the built pages **and** `/api`, so live answering works | https://relay-production-1068.up.railway.app |
| **Vercel** | The pages only (static). Talks to the Railway relay when built with `VITE_API_BASE` | https://cpl-civic-access.vercel.app |

**Railway** builds from `app/` using `app/railway.json`: Railpack, `npm ci --include=dev && npm run build`, `npm start`, health check `/api/health`, **one replica**. Conversations live in memory, so there must be exactly one instance, and a redeploy or restart erases them.
- **Variables:** `ALLOWED_ORIGINS=https://cpl-civic-access.vercel.app` (CORS for the Vercel pages). Set `STAFF_PASSCODE` to lock `/staff`; without it, anyone with the URL can answer as the library assistant.
- **Redeploy from your machine:** `cd app && railway up --service relay`. Or connect the GitHub repo to the service in Railway's dashboard (root directory `app`) for automatic deploys.

**Vercel** serves `app/dist` with `app/vercel.json`, which sends every page path to `index.html`. For live answering on the Vercel URL, set the environment variable `VITE_API_BASE=https://relay-production-1068.up.railway.app` in the Vercel project and redeploy. Without it, the Vercel pages can't reach a relay, so Ask stays hidden.

## Known gaps

The open items for Cut 2 (the two-week patron run) are tracked in `entrance-kiosk/BUILD-entrance-kiosk.md`. In short:

- **No catalog sync.** Content is hand-written JSON in the repo. `catalog/main-library/` doesn't exist yet. Its entries come from the desk staff and then the question log.
- **No placeholder build gate.** A patron-facing build must fail on any placeholder fact. Nothing here is patron-facing yet.
- **Log retention is undecided** (decision 2). The relay keeps everything in memory only, and the CSV export is manual.
- **The live run needs:**
  - a reflowing layout (decision 1): the kiosks render a fixed canvas scaled to the screen, allowed through R2 only;
  - posted hours and an end date;
  - the entrance emergency wording from CPL security;
  - kiosk lockdown and a network path to the relay.
- **TechCentral:** catalog sync, `@cpl/tokens`, and reflow before R3, all on hold while it's pinned.

## License

[MIT](LICENSE)
