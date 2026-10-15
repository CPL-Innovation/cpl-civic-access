# Cleveland Civic Access · TechCentral kiosk prototype

A clickable prototype of the **TechCentral concierge kiosk** at Cleveland Public Library: a touchscreen at the TechCentral entrance that gives a patron a short plan for their visit, plus the phone pages, printed slip, and release-station card that let the plan leave with them.

It is part of **Cleveland Civic Access**, a resident-centered front door to services across CPL, the City of Cleveland, and CMSD. TechCentral is the first pilot.

> **Status: prototype, not for patrons.** Every unverified fact is invented sample content. There is no backend, no live AI, and no placeholder build gate yet (see [Known gaps](#known-gaps)).

**Try it:** clone, then `npm --prefix app install && npm --prefix app run dev`, and open http://localhost:5180. The index of every page and flag is at `/links`.

---

## Where things live

| Truth for… | Lives in |
|---|---|
| **Why and what:** product intent, journeys, the pilot mockup spec, the facts catalog | The project's Obsidian vault, `build/` (`BUILD-SPEC.md`, `techcentral-pilot/mockup-spec.md`, `catalog/techcentral/`). Read-only for coding agents |
| **How:** implementation | This repo |
| **Proposed scope or intent changes from a build session** | The vault's `build/_FROM-BUILD.md`, the only file an agent may write there. Jungu merges it into the specs |

This repo doesn't duplicate the vault specs. If code and spec disagree on intent, the disagreement goes into `_FROM-BUILD.md`, not into this README.

## What's in the repo

```
app/                          The prototype: Vite + React + TypeScript, static build, no backend
  src/kiosk/                  Kiosk shell, state machine, screens, overlays, kiosk.css
  src/phone/                  Phone pages the QR codes open (/tc/*)
  src/print/                  Printed plan slip and release-station card (/print/*)
  src/content/*.json          Patron-facing copy and facts, editable without touching code
  src/lib/                    Placeholder rendering, stubbed assistant, speech, QR, CPL mark
  src/config.ts               Deployment flags (printer, orientation, placeholders, larger text, timeouts)
  CPL_TheCenter_icon.svg      The CPL mark (landing lockup and watermark read from this file)
  README.md                   App details: pages, flags, content format, assistant interface
design-reference/             The original design-canvas mockups (.dc.html), kept as reference
HANDOFF.md, CLAUDE-CODE-PROMPT.md   The original design handoff and build prompt (historical; the build has moved past them)
DESIGN-SYSTEM-REVISION-PROMPT.md    Prompt sent to revise the CPL Design System's Service mode (motion, decorative icons, watermark)
DESIGN-SYSTEM-REVISION-DELTA.md     Follow-up: large-display hairlines, service tiles, caption-size eyebrows
```

`app/CPL-Design-System.html` is the CPL Design System reference. It's large and git-ignored, so get it from the design team and put it at that path.

## What the prototype does

- **Kiosk** (`/`), portrait 1080×1920 by default, scaled to fit any window:
  - Landing screen, then Home with four categories: Print something, 3D print something, Computers & Wi‑Fi, Something else.
  - **Printing:** where's your file → a one-screen plan → step detail → take it with you (print a slip, scan a QR code with a large short URL, or show staff). "My print didn't come out" lives inside Printing: five fix cards plus "something else".
  - **3D printing:** what you can make → which way is right for you (with a three-question self-check) → Plan A (we print it) or Plan B (run it yourself, including failure options with a fixed safety message) → the rules.
  - **Computers & Wi‑Fi:** a preview screen with short facts and a staff path.
  - **Assistant:** opened from "Ask about this", with suggested questions first and an on-screen keyboard second. Answers show "Based on…" and an AI label, and can be added to the plan. There are four refusal types: not in the guide, staff call, off-topic, and safety. It runs on a stub.
  - **Always available:** Back, Staff help, Accessibility (larger text on by default, high contrast, read aloud) and Start over.
  - **Session:** "Still there?" after 50 seconds, then a 15-second countdown, then a full reset that wipes everything.
- **Phone pages** (`/tc/usb`, `/tc/3d`, `/tc/lost`, `/tc/ref`, …): read-only plans and fixes with an accordion of steps and the same assistant. No kiosk session.
- **Print** (`/print/slip`, `/print/card`): the Letter slip and the 5.5×8.5 in release-station card, with print stylesheets.

## Design

The UI follows the **CPL Design System, Service mode**:
- five-step type scale;
- navy and butter for large areas, marigold for the main call to action on navy;
- one primary action per screen, ghost button left and primary right;
- square geometry, 1.5px line icons, 48px touch targets, and the system focus ring;
- the radio-card pattern for pick-one choices, and coral for safety.

Two labelled layers in `app/src/kiosk/kiosk.css` go beyond Service mode on purpose, pending the design-system revision in the prompt files:

- **Expressive layer:** the slowly turning CPL watermark, bobbing landing icons, directional screen slides, staggered entrances, press feedback and confirmation pops. All of it is off under `prefers-reduced-motion`.
- **Large-display exceptions:** filled navy icon tiles on category cards, and 2px card borders for reading at a distance.

## Content and placeholders

Facts staff must confirm are written `[[what to verify|sample value]]` in `app/src/content/*.json`.
- **By default** the sample value shows with a dotted underline; hover it to see what needs checking.
- **`?ph=tags`** shows the `[PLACEHOLDER: …]` tags the pilot spec asks mockups to use.
- **`npm --prefix app run placeholders`** lists what's left.

Every unverified fact here is made up for the prototype.

## Run, build, configure

```bash
npm --prefix app install
```
```bash
npm --prefix app run dev
```
```bash
npm --prefix app run build
```

The build is static (`app/dist/`). Host it with an SPA fallback to `index.html`, so `/tc/*` and `/print/*` resolve.

**Flags:** defaults are in `app/src/config.ts`, and URL overrides are listed in [app/README.md](app/README.md#flags):
- `?orient=portrait|landscape|auto`
- `?printer=0`
- `?ph=mock|tags|clean`
- `?lg=0`
- `?idle=10&countdown=8`
- `?timers=off`
- `?fit=0`

## Known gaps

Things the specs require that this prototype doesn't do yet:

- **No catalog sync.** Content is hand-written JSON in the repo. The vault's `catalog/techcentral/` facts library (YAML frontmatter, `{{entity.fact}}` references, per-fact `provenance` and `last_verified`) is meant to be synced one-way into the app. That sync and the renderer that carries provenance to the screen aren't built.
- **No placeholder build gate.** A patron-facing build must fail on any placeholder fact. This repo has one build, and it shows sample values by default.
- **Assistant is a stub** over a fixed Q&A table with keyword matching. The live model, retrieval, and logging policy are undecided.
- **Fixed-canvas kiosk.** The kiosk renders a fixed 1080×1920 (or 1920×1080) canvas scaled to the window. It doesn't reflow, so it doesn't meet WCAG 1.4.10 (reflow at 320px / 200% zoom) the way the platform spec requires of the shared web app. Phone pages do reflow.
- **Short URLs and QR codes** point at this build's own address, and the printed short URLs are placeholders. There is no real printer integration; "Print my plan" is simulated.
- **No breakage reporting** ("this wasn't right") and **no staff-facing catalog view**.
- **Not run on kiosk hardware.** Reach, glare and audio are unconfirmed.

## License

[MIT](LICENSE)
