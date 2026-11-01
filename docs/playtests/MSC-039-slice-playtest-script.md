# MSC-039 — Slice Playtest Script

Script for observing the vertical slice with the owner's brother and friends. It covers [MSC-039](../04-phased-agent-task-plan.md) and the play checks that the [pending work register](../pending-work.md) schedules into it: P-08, P-10, P-11, P-13, P-22 and P-27. Results are observations, not approvals. Record them honestly, including confusion, boredom and bugs.

## 1. What this session can and cannot test

| Can test now | Cannot test yet |
|---|---|
| A newcomer's first 15–30 minutes alone: vacuum, unload, press, sell, shop, upgrade, beacon reveal, cutter, cart | **Real co-op role switching.** The game does not connect players yet (P-01/P-04 pending), so the "group route" and "co-op role switching" parts of MSC-039 stay **not run**. |
| Whether the next action is clear without help (P-11) | Shared spending between players (P-09, P-25) |
| A full keyboard-free and mouse-free run on a real controller (P-22) | Four players' sounds overlapping (P-28) |
| Close and reopen with progress (P-13) | Steam Deck reading size (P-23) |
| Whether the placeholder sounds help or annoy, and play with sound muted (P-27) | Final audio, art or prices (all placeholders) |

The optional group session in §6 (several people watching one player and swapping turns) gives useful talk-aloud data. It is **not** co-op evidence. Do not record it as such.

## 2. Before the session (owner)

1. **Build:** run `pnpm run package` and use `release/win-unpacked/`. Testers can play on the owner's PC, or the folder can be copied to theirs (USB or a drive the owner already has; no new service). **Do not copy** `tools/dev-p2p/host.bat` or `join.bat`; they are a dev-only test. Steam is not needed for this session.
2. **Fresh save per tester.** There is no in-game reset yet (P-14). Before each tester, rename the saves folder so it is kept as a backup: `%APPDATA%\Martian Scrap Co\saves` → `saves-T1`, `saves-T2`, … The game creates a new one. If that path does not exist, launch the game once, open the pause menu (Esc), and check that it says progress saves automatically. Then look under `%APPDATA%` for the folder with a `saves` subfolder.
3. **Defaults:** keep volumes at their defaults (master 80%, effects 100%, interface 80%). Set the language each tester prefers (L, or the pause menu).
4. **Controller:** an Xbox-style controller, connected before launch, for the controller run (§5, P-22).
5. **Privacy:** call testers T1, T2, … in every note; no real names. Recording the screen needs each tester's OK. **Do not record voices or the room microphone** unless that person explicitly agrees to it.
6. **Kit:** this script, one observation sheet per tester (§8), a clock or phone timer.

## 3. Roles

- **Facilitator (the owner):** reads the briefing, keeps time, and gives help **only** through the help ladder in §4.
- **Observer (optional, another person):** fills in the sheet. If there is no observer, the facilitator fills it in, ideally from a screen recording afterwards.
- **Tester:** plays and thinks aloud.

## 4. Rules during play

- Do not explain controls, goals or tricks beyond the briefing. If the tester asks, answer: "What do you think you should try?" and note the question.
- **Help ladder.** Use a step only after the tester has been stuck for **3 minutes** on the same thing, and note which step and when:
  1. "Look at the panels on the screen."
  2. "Read the 'Current job' panel aloud."
  3. Point at the place on screen (the intake, the compactor, the sale machine). Do not touch the controls.
  4. Explain the exact action. **Mark it as a failure for that step** (it was not clear enough).
- Never take the controls during the timed part.
- Write down what happened, not why you think it happened. Quote the tester's words when you can.

## 5. Session plan per tester (about 40 minutes)

### 5.1 Briefing (2 min)

Read this aloud, in the tester's language, and nothing more:

> **EN:** "This is an early test of a game about recycling scrap on Mars. Nothing here is final: art, sounds, prices and texts will change. We are testing the game, not you; if something is confusing, that is the game's fault and it is exactly what we want to find. Please say aloud what you are thinking, what you are trying and what surprises you. I will not help much, on purpose. Play however you like; stop whenever you want."
>
> **ES:** "Esto es una prueba temprana de un juego de reciclar chatarra en Marte. Nada es definitivo: el arte, los sonidos, los precios y los textos van a cambiar. Probamos el juego, no a ti; si algo confunde, es culpa del juego y es justo lo que queremos encontrar. Di en voz alta lo que piensas, lo que intentas y lo que te sorprende. Casi no te voy a ayudar, a propósito. Juega como quieras; puedes parar cuando quieras."

Then ask them which device they prefer. **At least one tester across the whole playtest does the full run on the controller without touching the mouse or keyboard** (P-22). If nobody does, the owner does it at the end (§5.5).

### 5.2 Free play, no coaching (up to 25 min)

Start the timer when the yard appears. Write the time (mm:ss) at which each milestone happens. Leave the time blank if it never happens.

| # | Milestone | What it shows |
|---|---|---|
| M1 | First piece vacuumed | Tip and collector are understood |
| M2 | First unload at the base intake | Batch unloading is found |
| M3 | Compactor starts pressing | Bale quota is understood |
| M4 | First bale picked up from the pad | Grip is found |
| M5 | First sale at the machine | Sale loop closed |
| M6 | Shop opened | Machine/shop link is found |
| M7 | "Not enough credits" seen (if it happens) | Error path is readable |
| M8 | Collector level 2 bought (two iron bales, 80 C) | **P-08** |
| M9 | Station beacon revealed | **P-10** |
| M10 | Cutter used on the rover | Tool switching is found |
| M11 | Cart used (load or push) | Medium handling is found |
| M12 | Pause menu opened | Menu is found |

Also note every time the tester:
- asks what to do, or says they are lost (**confusion**);
- repeats the same action many times without progress, or says it is boring (**repetitive action**);
- gets stuck physically (pieces, cart, falling), or the game misbehaves (**bug**), with the time;
- reacts to a sound: helpful, unclear or annoying (**P-27**).

### 5.3 "What now?" probes (P-11)

At about **5, 10 and 20 minutes**, at a calm moment, ask: *"What are you trying to do right now, and what will change when you do it?"* Write the answer word for word. It is a pass if the answer matches the game state (for example: "unload these at the intake, then the bin fills" or "carry the bale to the machine for credits").

### 5.4 Mute segment (P-27, MSC-038)

After about 20 minutes, open the pause menu and set **Master volume** to *muted* (confirm until it says muted). Let them play **3 more minutes**. Ask: *"Did you miss any information without sound?"* Note anything they missed. Set it back to 80% afterwards.

### 5.5 Close and reopen (P-13)

At the end (or at 25 min), ask them to close the game window normally, wait 5 seconds, and open it again. Check, and tick on the sheet: credits, collector level, container contents, bins, any bale on the pad or in the yard, cut rover parts, and the beacon state, all as they were. Note anything missing or moved. Saves happen a few seconds after each change, so the very last second may not be in it. That is expected, but note it.

**Controller run (P-22)**, if this tester used a controller, or by the owner at the end: complete vacuum → unload → press → pick up bale → sell → open shop → see the credit error or buy → pause → back, **without touching mouse or keyboard**. Note any step that needed the mouse or keyboard, and any place where the focus was lost or unclear.

### 5.6 Short interview (5 min)

Ask, and write the answers in their words:
1. What was the game about, in one sentence?
2. What was the most satisfying moment? And the most annoying?
3. Was anything unclear on screen (texts, icons, panels)?
4. Did the sounds help, or did any get on your nerves?
5. Would you want to keep playing? What would you do next?
6. Imagine playing this with friends: what would you like to do together?

## 6. Optional group session (not co-op evidence)

With two to four people in the same room and one PC: one plays, the others watch and may talk. Swap players every 5–7 minutes, keeping the same save. Note what the watchers suggest, whether people naturally split tasks ("you vacuum, I'll sell"), and whether anyone feels a task needs two people. This gives hints about PRD-003 (no classes, no two-person locks). The real co-op check is still pending (P-04).

## 7. After the session

1. Rename that tester's saves folder (§2.2) before the next tester.
2. Fill in the totals on the sheet: milestones reached, help-ladder steps used, confusions, repetitive moments, bugs.
3. Give the sheets (or a photo of them, or plain notes) to the agent. The agent writes the results into `docs/playtests/MSC-039-results.md` with anonymous tester IDs. It updates the MSC-039 Outcome, closes the pending items that have evidence (with date), and adds new items for each problem found. MSC-040 (the owner's slice and scope approval) uses these results.

**How to read the results (MSC-039 acceptance):**
- **Pass signals:** M1–M5 reached without step 4 of the help ladder; the "what now?" answers mostly match the game; no step needed two people; the muted segment lost no essential information; reopening kept the progress.
- **Record honestly:** every confusion, repetitive stretch and bug, even small ones. A newcomer needing help is a finding to fix, not a failed tester.
- **Not run:** co-op role switching. Write "not run — co-op transport pending (P-04)". Never write "passed".

## 8. Observation sheet (copy one per tester)

```text
Tester: T__   Date: ____   Device: KB+mouse / controller   Language: EN / ES   Played on: owner PC / own PC
Gaming experience (none / casual / regular): ______   Played first-person games before? Y / N

MILESTONES (mm:ss, blank if not reached)          HELP LADDER (step + time + what about)
M1 vacuum ____   M7 credit error ____               ______________________________________
M2 unload ____   M8 level 2 bought ____             ______________________________________
M3 press ____    M9 beacon revealed ____            ______________________________________
M4 bale ____     M10 cutter ____
M5 sale ____     M11 cart ____
M6 shop ____     M12 pause menu ____

"WHAT NOW?" (P-11)  5 min: ______________________________________ match? Y / N
                    10 min: _____________________________________ match? Y / N
                    20 min: _____________________________________ match? Y / N

CONFUSION (time + quote)            REPETITIVE / BORING (time + what)     BUGS (time + what happened)
__________________________          __________________________           __________________________
__________________________          __________________________           __________________________

SOUNDS (P-27): helpful ________  unclear ________  annoying ________
MUTED 3 MIN: missed anything? ____________________________________

REOPEN (P-13): credits [ ] level [ ] container [ ] bins [ ] bales [ ] rover cuts [ ] beacon [ ]  missing: ________
CONTROLLER-ONLY RUN (P-22): done Y / N   needed mouse/keyboard at: ______________  focus lost at: __________

INTERVIEW: 1 ________________________________ 2 ________________________________
           3 ________________________________ 4 ________________________________
           5 ________________________________ 6 ________________________________
```
