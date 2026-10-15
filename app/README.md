# TechCentral concierge kiosk — clickable prototype

Static Vite + React + TypeScript app. No backend, nothing stored. See the [repo README](../README.md) for what this is, how it relates to the vault specs, the design system, and known gaps.

```
npm install
npm run dev        # http://localhost:5180  (prototype index at /links)
npm run build      # static build in dist/ — host with an SPA fallback to index.html
npm run placeholders   # list every unverified [[...]] fact still in the content
```

## Pages (one build)

| Path | What |
|---|---|
| `/` | The kiosk. Portrait by default, scaled and centered in any window. |
| `/tc/usb`, `/tc/phone`, `/tc/email`, `/tc/make`, `/tc/3d`, `/tc/3d-self` | Phone plan pages (the QR codes) |
| `/tc/lost`, `/tc/pay`, `/tc/wrong`, `/tc/card`, `/tc/phone-help`, `/tc/fix` | Phone fix pages and the all-fixes page |
| `/tc/ref` | Plan B reference mode at the printer |
| `/print/slip?plan=usb` · `?fix=lost` | Printed plan slip (Letter) |
| `/print/card` | Release-station card (5.5 × 8.5 in) |
| `/links` | Prototype index |

## Flags

Defaults live in `src/config.ts` (`hasPrinter`, `orientation`, `placeholders`, `largerText`, timeouts). URL overrides:
`?orient=portrait|landscape|auto` · `?printer=0` · `?ph=mock|tags|clean` · `?lg=0` (start with larger text off) · `?idle=10&countdown=8` · `?timers=off` · `?fit=0`

## Content

All copy that staff verify lives in `src/content/*.json` (`printing`, `fixes`, `threed`, `assistant`, `site`). Each file has a `checkedDate` that feeds its “From TechCentral · checked …” line.

Unverified facts are written `[[what to verify|sample value]]`. The sample is made up and shows with a dotted underline (hover for what needs checking); `?ph=tags` shows the design's `[PLACEHOLDER: …]` tags instead. `[[label|]]` (empty sample) hides in mock mode and tags in tags mode. When staff confirm a fact, replace the whole `[[...]]` with plain text.

## Assistant

`src/lib/assistant.ts` defines `AnswerSource` (`suggestions`, `ask`). The prototype uses `stubSource`: suggested questions come from `assistant.json`'s `qa`; typed questions are keyword-matched, safety words are checked first and always return the fixed safety message, and anything unmatched is “Not in the guide”. Swap `answerSource` for a live model later without touching the UI.
