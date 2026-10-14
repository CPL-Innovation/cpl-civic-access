Paste this into Claude Code, started from the project folder that contains this handoff folder.

---

Build the TechCentral concierge kiosk from the design handoff in `./techcentral-kiosk-handoff/`.

1. Read `HANDOFF.md` fully, then read `design-reference/Main.dc.html`. It's the source of truth for copy, content, and behavior. Treat the `.dc.html` files as a spec; don't port their runtime.
2. Before writing code, propose: the stack (I'd lean toward Vite + React + TypeScript, static build, no backend), the folder structure, and how the content JSON will be organized. Wait for my OK.
3. Then build in this order, committing after each step:
   a. Extract the content model (`PLANS`, `FIX`, `FAILS`, `QA`, `RULES`, etc.) into editable JSON, keeping every `[[placeholder]]`, and render placeholders as visible tags.
   b. The kiosk shell: welcome screen, Home, the bottom bar, the state machine with Back history, the idle countdown, and full reset.
   c. Home → printing plan → takeaway in portrait (all four file sources).
   d. "My print didn't come out" → fix cards.
   e. 3D printing: what you can make, which way is right, Plan A, Plan B (including the failure options with the fixed safety message), the rules.
   f. The assistant panel against a stubbed answer source: suggested questions, the answer card, all four refusal states, the on-screen keyboard.
   g. The accessibility panel: larger text, high contrast, read aloud via `speechSynthesis`.
   h. Landscape layout.
   i. Phone pages at the `url` paths, the print slip, and the release-station card.
4. Add a config flag for "no printer" and a URL flag to force orientation.
5. Check it against the accessibility acceptance list in `HANDOFF.md`. Tell me what passes, what doesn't, and every open decision you hit.

Don't invent facts. Anything unverified stays a visible placeholder.
