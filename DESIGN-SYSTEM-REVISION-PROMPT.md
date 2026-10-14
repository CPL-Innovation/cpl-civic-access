# Prompt: loosen the CPL Design System's Service mode for delight

Paste the block below into a coding agent working on the CPL Design System source (tokens.json, modes.css, and the Iconography, Logo and ServiceMode guidance cards).

---

You're revising the Cleveland Public Library Design System. Service mode is currently too strict about motion and decoration. It's used for kiosks and public terminals, such as the TechCentral guide kiosk, and its rules push those screens to feel static, like slides changing. Loosen it on purpose, with guardrails. Keep everything else about Service mode as it is: the type scale, navy and butter as the only large color areas, square geometry, 48px targets, the focus ring, and one primary action per screen.

## 1. Motion: replace "state changes only, never decoration" with four tiers

Rewrite the Service mode motion rule in `modes.css` and its documentation as four tiers:

1. **Functional (default, unchanged):** state changes such as color, toggles, progress, loading and sheets opening or closing. Uses `--dur-fast` 100ms, `--dur-base` 160ms, `--dur-slow` 200ms and `--ease-standard`.
2. **Transitional:** screen-to-screen navigation can slide in the direction of travel. The incoming screen moves up to 56px with a crossfade, and the outgoing one moves up to 40px. It takes up to 400ms. Its content may rise in a stagger of about 40ms per item, finishing within 300ms. Back reverses the direction.
3. **Feedback micro-interactions:**
   - a press scale of 0.97 to 0.99, at 60 to 140ms;
   - arrows and chevrons leaning 4 to 6px on press or hover;
   - a spring "pop" of up to 400ms when something is confirmed (a check, a selected option, a vote);
   - a countdown number that ticks.
4. **Ambient / delight:** allowed only on attract, welcome, idle and hero moments, never on screens where someone is reading steps or filling in a form. Examples:
   - an oversized emblem turning very slowly (one turn every 2 minutes or slower);
   - small accent icons gently bobbing (loops of 4 seconds or longer, moving 12px or less);
   - a call-to-action arrow nudging every 2 to 3 seconds.

   Allow at most two ambient motions per screen.

Add tokens:
- `--ease-out: cubic-bezier(.22,.8,.24,1)`
- `--ease-spring: cubic-bezier(.3,1.35,.5,1)`
- `--dur-expressive: 380ms`
- `--dur-ambient-min: 4s`

Guardrails, written into the docs:
- `prefers-reduced-motion: reduce` turns off tiers 2 to 4 entirely. Tier 1 drops to near-instant.
- Nothing flashes more than three times a second (WCAG 2.3.1). No opacity pulses on text or buttons.
- Ambient motion is decorative and `aria-hidden`. It must stop once the person starts interacting, which happens naturally when it only lives on attract or idle screens (WCAG 2.2.2).
- Motion never delays or blocks input. Taps register during transitions.
- Only `transform` and `opacity` are animated for tiers 2 to 4. Never layout properties.

## 2. Iconography: allow decorative icon clusters on hero and attract screens

Clarify "Icons support labels; they don't replace them." It applies to interactive and informational icons. Add an exception: a small cluster of 3 to 5 line icons may appear as illustration on attract or hero screens. They must be `aria-hidden`, use a 1.5px stroke, use the accent color on navy (butter), and sit next to a headline that carries the meaning. Add a do / don't example to the Iconography card.

## 3. Logo: allow an oversized emblem watermark on navy service fields

Add to the Logo guidance: on a navy service field, the emblem may be used as a single oversized watermark. That means 4 to 8% white, cropped by the frame into open negative space, never behind body text or buttons, and once per screen. It may rotate in the ambient tier. Repeating patterns of the emblem are not allowed. The primary lockup rules (emblem with words to the right, clearspace) are unchanged and still apply to the real lockup on the same screen.

## 4. Clarify gold on navy

Service mode says butter is the "continue" color on navy. cpl.org's hero uses marigold (`#F1C400`) for its primary button on navy. State that either is allowed for the single primary action on a navy field: marigold for an emphatic call to action such as an attract screen's "Tap anywhere to begin", butter for routine continue steps. Keep `cpl-navy-ink` text on both.

## 5. Optional, for large public displays (decide before adopting)

- **Hairlines:** on screens viewed from more than 2 feet away, allow 2px warm-gray borders on option cards instead of 1px. Warm gray is only 1.7:1 at 1px.
- **Icon tiles:** allow a filled navy tile (6px radius) behind a white line icon on primary category cards, as a "service tile", for faster scanning from a distance.

## Deliverables

- Update `tokens.json` and regenerate `tokens.css` with the new motion tokens.
- Update `modes.css` and its comments with the motion tiers.
- Update the ServiceMode, Iconography and Logo guidance cards, each with a short do / don't example.
- Add a "Motion tiers" specimen card showing each tier with reduced-motion behavior.
- Keep every existing token and value backward compatible.
