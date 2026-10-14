# Prompt delta: follow-up to the Service mode revision

Send this to the same coding agent after the first prompt (`DESIGN-SYSTEM-REVISION-PROMPT.md`). It turns that prompt's optional section 5 into adopted rules and adds one type change.

---

Follow-up to the Service mode revision. Section 5 of the last prompt ("Optional, for large public displays") is now decided: adopt both items as rules, plus the type change in item 3. Everything else in the last prompt stands.

## 1. Add a large-display surface to Service mode

Add a surface modifier for screens read from 2 feet or more away, such as kiosks, wall displays and public terminals: `[data-mode="service"][data-surface="large"]`. Document when to use it. Phones and desktop service pages don't use it.

Add a token `--hairline-width`. It is `1px` by default and `2px` under the large surface. Apply it to:
- card, option-card and radio-card borders;
- ghost and secondary button borders;
- input borders;
- dividers inside service flows.

State why in the token note: warm gray only reaches 1.7:1 at 1px, which disappears at a distance.

Active and selected states keep their current rule (border turns `cpl-navy-ink`) at the same 2px width. Don't stack an extra inset ring on top.

## 2. Service tiles: filled icon tiles on primary category cards

Revise the Iconography rule "Line icons. 1.5px stroke. No fills." Line icons stay unfilled, but in Service mode a primary category or option card may set its icon inside a filled tile:
- `cpl-navy` square, `radius-md` (6px), about 2.2× the body size;
- white 1.5px line icon, about 1.3× the body size;
- in high contrast, a yellow tile with a black icon.

Use tiles only on top-level choices, such as a home screen's categories or a "where's your file?" picker. Never use them inline with text, in buttons, or as status. The icon still sits next to a visible label.

Add a "Service tile" example to the Iconography and Cards guidance, showing a do (category card with tile and label) and a don't (a tile without a label, or a tile used as a button).

## 3. Eyebrows stay caption-sized in Service mode

Service mode currently collapses `--fs-sm` into the 18px body, which makes all-caps eyebrows and kickers as large as body text and too loud. In Service mode:
- `.eyebrow` and `.kicker` use `--fs-xs` (14px), semibold, with `--ls-caps` tracking and `cpl-navy`;
- other meta text keeps collapsing into body as it does now.

## Deliverables

- Add the `--hairline-width` token to `tokens.json` and regenerate `tokens.css`.
- Add the large-surface block to `modes.css`.
- Update the Iconography and Cards cards with the service-tile examples.
- Update the ServiceMode card to show the large surface.
- Update the Type card's eyebrow note.
- Keep everything else unchanged and backward compatible.
