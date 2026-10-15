# App details

The app serves three surfaces: the Main Library entrance kiosk (`/libraryentrance`, also `/`), the library assistant console (`/staff`), and the TechCentral prototype (`/techcentral`). This file covers the TechCentral prototype; the [repo README](../README.md) covers the entrance kiosk, the relay, and the console.

## TechCentral concierge kiosk — clickable prototype

The TechCentral prototype itself uses no backend and stores nothing (its assistant is a stub). See the [repo README](../README.md) for how it relates to the vault specs, the design system, and known gaps.

```
npm install
npm run dev        # relay + Vite; http://localhost:5180  (index of everything at /links)
npm run build      # static build in dist/
npm start          # the relay serves dist/ (with SPA fallback) and /api
npm run placeholders   # list every unverified [[...]] fact still in the content
```

## Pages (one build)

| Path | What |
|---|---|
All TechCentral paths sit under `/techcentral` (old `/tc/*` and `/print/*` links redirect).

| Path | What |
|---|---|
| `/techcentral` | The kiosk. Portrait by default, scaled and centered in any window. `?start=p0\|m0` opens on a screen; `?return=/libraryentrance` hands back on reset (used by the entrance doorway). |
| `/techcentral/tc/usb`, `…/tc/phone`, `…/tc/email`, `…/tc/make`, `…/tc/3d`, `…/tc/3d-self` | Phone plan pages (the QR codes) |
| `/techcentral/tc/lost`, `…/pay`, `…/wrong`, `…/card`, `…/phone-help`, `…/fix` | Phone fix pages and the all-fixes page |
| `/techcentral/tc/ref` | Plan B reference mode at the printer |
| `/techcentral/print/slip?plan=usb` · `?fix=lost` | Printed plan slip (Letter) |
| `/techcentral/print/card` | Release-station card (5.5 × 8.5 in) |
| `/techcentral/links` | TechCentral index |

## Flags

Defaults live in `src/config.ts` (`hasPrinter`, `orientation`, `placeholders`, `largerText`, timeouts). URL overrides:
`?orient=portrait|landscape|auto` · `?printer=0` · `?ph=mock|tags|clean` · `?lg=0` (start with larger text off) · `?idle=10&countdown=8` · `?timers=off` · `?fit=0`

## Content

All copy that staff verify lives in `src/content/*.json` (`printing`, `fixes`, `threed`, `assistant`, `site`). Each file has a `checkedDate` that feeds its “From TechCentral · checked …” line.

Unverified facts are written `[[what to verify|sample value]]`. The sample is made up and shows with a dotted underline (hover for what needs checking); `?ph=tags` shows the design's `[PLACEHOLDER: …]` tags instead. `[[label|]]` (empty sample) hides in mock mode and tags in tags mode. When staff confirm a fact, replace the whole `[[...]]` with plain text.

## Assistant

`src/lib/assistant.ts` defines `AnswerSource` (`suggestions`, `ask`). The prototype uses `stubSource`: suggested questions come from `assistant.json`'s `qa`; typed questions are keyword-matched, safety words are checked first and always return the fixed safety message, and anything unmatched is “Not in the guide”. Swap `answerSource` for a live model later without touching the UI.
