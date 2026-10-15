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
  - **voice input:** tap the mic for a live dictation view (bars that follow your voice, words appearing as you speak); when you finish, the view shows what it heard with **Retry** or **Send it** (Send it sends the message and returns to the chat). By default it streams the audio through the relay to **OpenAI Realtime** (`gpt-live-transcribe`), so words appear while the patron is still talking (first word about 1 s in, then each word about 0.2–0.3 s behind the speaker; the review shows about 1.2 s after they stop). The other choices are OpenAI after speaking (records, then `gpt-4o-transcribe`) and the browser's built-in recognizer (desktop Chrome sends audio to Google; Android falls back to OpenAI). OpenAI needs `OPENAI_API_KEY` on the relay; without it the kiosk uses built-in recognition. Audio is forwarded, never stored. `?stt=live|server|browser` forces a path; `?voicedebug=1` logs each step on screen; `/mictest` records and replays to check a kiosk's microphone. `?voice=demo` plays a scripted dictation without a microphone, and `?voice=off` hides the mic;
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
- **When Ask shows on the kiosk:** only when the console switch is on (it starts on), a console is connected, and it's inside the posted hours (none are set yet).

The console is one screen for one person:
- a queue with wait timers and badges ("Emergency words", "Are you a bot?");
- the conversation;
- saved answers (tap to use, then edit) and locked answers (one tap, can't be edited);
- a **source tag** on every reply: catalog fact, named source, or none, which is logged as a candidate catalog entry;
- "Send to the desk now", which marks a handoff;
- **Suggested replies (AI).** When a patron asks something, the relay asks Claude (Anthropic API) to draft a reply from the conversation and the **facts library** (the vault catalog, synced into `app/src/content/catalog.generated.json`). The draft appears above the reply box with the facts it relied on (and each fact's provenance), a note for staff, and **Send as is**, **Edit in the box**, or **Redraft**. Grounding follows the catalog README: catalog facts only; a placeholder fact is never stated as a value but appears as a `[[label]]` placeholder tag; locked copy (e.g. the safety stop) is chosen by id and inserted exactly as written; with no matching fact the card says so and you write the answer. Using a draft fills in the source tag, and the log's `draft` column records *sent as is* / *edited* / *not used*. Patrons aren't told. Drafts never reach the kiosk on their own. Code: `app/server/drafts.ts`;
- **Settings** (live, reset on relay restart). **Suggested replies**: on/off, and the drafting model (Claude Sonnet 5.5 by default; Opus 5.5, Haiku 5.5, or any model id typed in). Then the kiosk's patron-facing switches: **Place cards start a chat** (starts on), **Prototype index link** (hidden by default; show it for demos), and **Voice transcription**: OpenAI live (words while speaking, default), OpenAI after speaking, or the device's built-in recognizer with OpenAI as the fallback. When it's on and Ask is showing, tapping a place on Home opens the chat and sends that card's question as the patron's first message; when it's off, the card opens the place's info screen;
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
| `npm --prefix app run catalog:sync` | Copies the vault's `build/catalog/` frontmatter into `app/src/content/catalog.generated.json` (one way; fails on a `{{ref}}` to a missing fact). `CATALOG_DIR` overrides the vault path. Re-run after editing facts, then redeploy |

**Relay environment variables:**
- `STAFF_PASSCODE` (optional; unset means `/staff` is open with no sign-in)
- `REPLY_TIMEOUT_S` (default 120)
- `ASK_DEFAULT=off`, `CARDS_CHAT_DEFAULT=off` (start those console switches off; both start on)
- `ANTHROPIC_API_KEY` (turns on suggested replies), `DRAFT_MODEL_DEFAULT` (default `claude-sonnet-5-5`), `DRAFTS_DEFAULT=off` (start with automatic drafts off), `DRAFT_FAKE=1` (canned drafts for trying the console without a key; the `kiosk-fake-drafts` launch config sets it)
- `VOICE_ENGINE_DEFAULT=live|server|browser` (where the Voice transcription setting starts; default `live`), `SHOW_INDEX_DEFAULT=on` (start with the Prototype index link shown)
- `OPENAI_API_KEY` (turns on server transcription), `OPENAI_TRANSCRIBE_MODEL` (default `gpt-4o-transcribe`), `OPENAI_LIVE_MODEL` (default `gpt-live-transcribe`), `OPENAI_REALTIME_URL` (default `wss://api.openai.com/v1/realtime?intent=transcription`), `TRANSCRIBE_FAKE=1` (canned transcript, for testing without a key)
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

### Running it as a kiosk on an Android screen

The site is installable as a full-screen app: `app/public/manifest.webmanifest` (full screen, portrait, starts at `/libraryentrance`), CPL-mark icons (regenerate with `node app/scripts/make-icons.mjs`), and a pass-through service worker (`app/public/sw.js`) that caches nothing and never touches `/api`.

1. In Chrome on the device, open the Railway URL → ⋮ → **Install app** (or **Add to Home screen**).
2. Open it from the home screen: no address bar, no status bar.
3. Lock it in with Android **App pinning** (Settings → Security → App pinning), or use a kiosk browser such as Fully Kiosk Browser for auto-start, screen schedules, and a locked-down device.
4. Tap the mic once and **Allow** the microphone, so voice input works for patrons.

## Known gaps

The open items for Cut 2 (the two-week patron run) are tracked in `entrance-kiosk/BUILD-entrance-kiosk.md`. In short:

- **Catalog sync covers the drafts only.** The suggested replies read the synced catalog; the kiosk's own screens are still hand-written JSON. `catalog/main-library/` doesn't exist yet, so drafts for entrance questions (restrooms, library cards) come back "no fact covers this" until it does.
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
