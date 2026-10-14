# TechCentral Concierge Kiosk — build handoff

Design canvas: https://claude.ai/code/artifact/b31e4cc2-edf6-45ce-84e5-8ec91ffe91fc (private — share it from the canvas if others need it)
Spec: `mockup-spec.md` v2 and the v2 design prompt (2026-10-14) in the CPL Cleveland Civic Access vault.

## What's in this folder

| File | What it is |
|---|---|
| `design-reference/Main.dc.html` | The whole kiosk: every screen, overlay, and state, in portrait and landscape. **The source of truth for copy, content, and behavior.** |
| `design-reference/Phone.dc.html` | Phone view the QR code opens (printing plan + assistant) |
| `design-reference/PhoneRef.dc.html` | Plan B reference mode for use at the 3D printer |
| `design-reference/Slip.dc.html` | Printed plan slip (Letter) |
| `design-reference/Card.dc.html` | Release-station card (5.5×8.5 in) |
| `design-reference/canvas.json` | Canvas layout only. Ignore for the build. |

The `.dc.html` files run in the design canvas's own runtime (`support.js`, `<x-dc>`, `<sc-if>`, `<sc-for>`, `{{holes}}`, `class Component extends DCLogic`). **Don't port that runtime.** Read them as a spec: the markup shows structure and classes, the `<style>` block in `<helmet>` holds the visual tokens, and the `<script>` block holds the content model and state machine.

## What to build

A static web app that runs full-screen in a browser's kiosk mode on an existing device. No backend, no accounts, nothing stored. The same build serves the phone pages that the QR codes open.

- **Kiosk:** routes or a state machine covering every screen below, in both 1080×1920 portrait and 1920×1080 landscape (an orientation media query or a URL flag).
- **Phone:** read-only plan pages at 375px wide, one URL per plan and per fix (the `url` fields in the content model, e.g. `/tc/usb`). No kiosk session behavior.
- **Print:** slip and card as print stylesheets or printable pages.
- **Assistant:** build the UI and the four refusal states against a **stubbed** answer source, fed by the `QA` table in `Main.dc.html`. The live model and its retrieval/guardrails are a separate decision. Keep the interface swappable.

## Content model (lift into JSON)

In `Main.dc.html`'s script block:

- `PLANS`: usb, phone, email, make (printing) and A, B (3D). Each has eyebrow, title, chip, ctx, url, say, facts[], steps[{text, detail, alt}], and step flags (`rules`, `ref`, `fail`).
- `FIX`: lost, money, wrong, card, phone. Each has label, title, cause, steps[], url, say.
- `FAILS`: the four Plan B failure options. `smell` is safety-only.
- `QA`: suggested questions per context (print, fix, m1, planA, planB). `kind` is one of answer | notin | judge | safety | off.
- `RULES`, `GALLERY`, `SCQ` (self-check), and the fixed strings `STAFF`, `HOURS`, `NOTIN`, `OFF`.

**Placeholders:** any text in `[[double brackets]]` is unverified. Render it as a visible `[PLACEHOLDER: …]` tag (see the `.ph` style). Keep this behavior until staff verify each fact, and make it easy to grep for the brackets that remain.

Move this content into JSON files that staff can edit without touching code. Each one needs a `checkedDate` that feeds the "From TechCentral · checked [date]" line.

## Screens and state

State: `screen`, `plan`, `sym`, `step`, overlay (`assistant` | `a11y` | `staff` | `idle`), the assistant's state (context, question, keyboard, typed text, notice seen, vote), a11y flags (`lg`, `hc`, `read`), `added[]` (answers added to the plan), the self-check answers, and a `hist` stack for Back.

Screens: `attract` → `home` → `p0` → `plan` → `step` → `take`; `home` → `px` → `fx` / `fxother`; `home` → `m0` → `m1` → `plan` (A/B) → `step`; `rules`; `other`.

Behaviors that must survive the rebuild:

1. **Idle:** 50 s without a touch opens "Still there?" with a 15 s visible countdown, then a full reset. "I'm still here" restores the overlay that was open.
2. **Reset** (Start over, Done, timeout) clears **everything**: choices, assistant history, typed text, a11y toggles, and added answers.
3. **Bottom bar** on every in-session screen, always the same order: [Back slot, reserved even when empty] [Staff help] [Accessibility] [Start over]. Overlays sit **above** the content but never cover this bar.
4. **Assistant opens only** from "Ask about this plan," "Ask about this" on fix cards, "Something else" under "My print didn't come out," and "Not sure which? Ask." It never opens from Home or a floating button.
5. **On first open, the assistant shows the public-screen notice.** Suggested-question buttons come first; typing (on-screen keyboard) comes second. There is no voice input.
6. **An answer** shows: the plain answer, a "Based on: …" button that jumps to that step, the AI label with the checked date, thumbs up/down, and "Add to my plan" (which appears on the takeaway screen).
7. **Safety** (smell, smoke, noise, burn) always shows the same **fixed** message with nothing generated, both in the assistant and in Plan B step 4.
8. **The assistant never** approves a print, rules on a policy, or puts someone in "Run it yourself."
9. **Takeaway:** Print it (hidden when the device has no printer; make it a config flag), Scan to your phone (QR **and** large short URL, side by side), and Show staff (a one-line summary to say at the desk).

## Visual tokens

These come from the CPL design system, with **Work Sans for all titles and body text** (no serif or Replica display):

- Ink `#002A5C` · Brand blue `#0057B7` (pressed `#004591`) · Butter `#E9E186` · Page `#FBFAF6` · Parchment `#F7F4ED` · Warm gray line `#CBC4BC` · Secondary text `#505A69`
- Safety: background `#FFE6E1`, border `#B3321F`, text `#5C1309`
- High contrast: black, white, and `#FFF200`
- Radii: 6px for cards and buttons, 999px for tags only. 2px borders, subtle navy-tinted shadows.
- Type: base 30px (portrait), 25px (landscape), and +20% with "Larger text." Everything sized in `em` off the root so the larger-text toggle scales the whole screen.
- Motion: only the breathing "Tap anywhere to start" on the welcome screen, wrapped in `prefers-reduced-motion: no-preference`. Nothing flashes.

## Accessibility acceptance

- On portrait, every primary action and the bottom bar sit in the lower two-thirds of the screen.
- Touch targets are at least 44px; Home and the M1 choices are much larger.
- Real `<button>` elements, `aria-pressed` on toggles, and `role="dialog"` with `aria-modal` on overlays. Focus moves into an overlay and returns to the trigger on close.
- Read aloud: use the Web Speech API (`speechSynthesis`) as a first pass, with the "Reading aloud: …" bar and a Stop button. Confirm the audio hardware.
- Text contrast is at least 4.5:1; color is never the only signal; step progress appears in text; every image slot has instructional alt text.

## Open decisions (from the spec, still unresolved)

- Hardware: orientation, printer, audio, mounting height, distance from the desk. **Build both orientations and a no-printer mode until these are confirmed.**
- Budget line: an existing device in kiosk mode vs. buying one ("the kiosk is not the product").
- Real short URLs and QR codes, and every `[[placeholder]]` fact.
- The assistant's model, retrieval, and logging policy. Nothing personal can be stored.

## Out of scope

A patron-PC or desktop layout, other makerspace equipment, large-format printing, accounts, saved history, phone-required notifications, voice input.
