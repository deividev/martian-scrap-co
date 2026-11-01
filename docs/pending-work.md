# Pending Work Register

Everything an implementation left to add, test or decide, so nothing is lost between tasks. Each task's **Outcome** in the [task plan](04-phased-agent-task-plan.md) keeps its summary; this register is the working list.

**Rules:** every implementation adds its open items here in the same commit, each with the task that will do it (**Do in**), and closes them (with date and evidence) when they are verified. Before starting a task, check this register for items whose **Do in** names it: they are part of that task's work. An item is closed only by observed evidence, never by a plan. Owner decisions and approvals stay in the decision records under `docs/decisions/` and the [PRD](01-product-requirements.md).

**Kinds:** *Play check* (seen in real play), *Co-op* (needs the real two-account transport), *Owner* (owner decision or hardware/account), *Feature* (still to build), *Release* (must happen before shipping).

Last updated: 2026-11-01 (MSC-039 playtest script ready: P-08, P-10, P-11, P-13, P-22 and P-27 are gathered with [it](playtests/MSC-039-slice-playtest-script.md)).

## Open

| # | Task | Kind | Item | Blocked by | Do in |
|---|---|---|---|---|---|
| P-01 | MSC-026 | Owner | Two-account P2P message exchange with the dev test (`tools/dev-p2p/`), owner and a second account on another network. | Owner test (in progress) | MSC-026 |
| P-02 | MSC-026 | Owner | Real App ID (A1); 480 is only for local tests and is never committed or shipped. | Steamworks app | MSC-027 |
| P-03 | MSC-026 | Owner | Steam overlay invite seen working between two accounts. | P-01 | MSC-028 |
| P-04 | MSC-027–030 | Co-op | Late join, leave/rejoin, invitations and the T1 gate on the real transport. | P-01 | MSC-027–030 |
| P-05 | MSC-031 | Co-op | Guest unload at the intake (guest half of the check). | P-04 | Co-op pass after MSC-028 |
| P-06 | MSC-032 | Co-op | Compactor interruption when the host or a guest leaves. | P-04 | Co-op pass after MSC-028 |
| P-07 | MSC-033 | Co-op | Sale under disconnect/rejoin and replayed network event ids. | P-04 | Co-op pass after MSC-028 |
| P-08 | MSC-034 | Play check | A successful collector purchase seen in play (sell two bales, buy level 2). | — | MSC-039 |
| P-09 | MSC-034 | Co-op | Guest purchase request, host approve/decline and "Can spend" over the real transport. | P-04, P-25 | Co-op pass after MSC-028 |
| P-10 | MSC-035 | Play check | Station beacon reveal seen in play after the full route (two sales, upgrade, clearing). | P-08 | MSC-039 |
| P-11 | MSC-035 | Play check | Novice walkthrough: a new player names the next action and the visible change. | — | MSC-039 |
| P-12 | MSC-035 | Owner | Marker position, radius and 35% threshold are placeholders until the slice playtest. | MSC-039 | MSC-040 |
| P-13 | MSC-036 | Play check | Close and reopen after real progress (bales, purchase, cuts) and see everything resume. | — | MSC-039 |
| P-14 | MSC-036 | Feature | Host-only menu to start a new campaign or reset, and a choice when a save is unreadable or from a newer version. | Menu work | MSC-081 |
| P-15 | MSC-036 | Co-op | Guest never writes the host campaign, checked with a real guest session. | P-04 | MSC-094 |
| P-16 | MSC-036 | Owner | Steam Cloud wiring and the divergent-history choice (both summaries, backup kept). Cloud is Proposed. | Authorization | MSC-093 |
| P-17 | MSC-036 | Owner | Saves on Steam Deck / Proton (prefix path, suspend, Cloud recovery). | Deck access | MSC-030, MSC-108 |
| P-18 | MSC-036 | Feature | Closing the window saves only best effort; the main process could wait for a final save before quitting. | — | MSC-092 |
| P-19 | MSC-036 | Feature | Moved props (cart, parts) are saved only with the next durable change, not on their own. | — | MSC-079 |
| P-20 | MSC-026 | Release | Remove the dev-only two-account P2P test (`electron/steam/devP2pTest.ts`, `tools/dev-p2p/`, its `main.ts` block and tests). | — | MSC-118 |
| P-21 | Merge | Owner | Steam smoke on the merged packaged build with the Steam client running (2026-11-01 run had Steam closed: binding loaded, init failed as expected). | Steam running | Next owner session (MSC-027) |
| P-22 | MSC-037 | Play check | Full slice with a real controller and no mouse: vacuum, unload, press, sell, open the shop, the insufficient-credit error, buy, pause and back. | — | MSC-039 |
| P-23 | MSC-037 | Owner | Menus and HUD read at handheld size (Steam Deck): text size, safe-area margins, focus contrast. | Deck access | MSC-030, MSC-086 |
| P-24 | MSC-037 | Feature | Comfort settings reachable from the pause menu (look sensitivity, invert, remapping, toggle/hold), stored locally per device. | — | MSC-084 |
| P-25 | MSC-037 | Co-op | Host panel to approve or decline guest purchase requests and mark "Can spend"; a guest's Buy becomes a request. | P-04 | MSC-082 |
| P-26 | MSC-037 | Feature | After closing the pause menu with Esc the browser needs a click to capture the mouse again (Esc does not count as a user gesture); a controller needs nothing. Consider a "click to continue" cue. | — | MSC-089 |
| P-27 | MSC-038 | Play check | Hear every gameplay cue in real play (collect, unload, press start, bale ready, sale, purchase, reveal, error) and judge loudness and annoyance; the browser check only reached the menu cues in the scene. | — | MSC-039 |
| P-28 | MSC-038 | Co-op | Four players' cues overlapping on the real transport: remote changes sound right, the voice cap holds, and positional attenuation is not done yet. | P-04 | MSC-047, MSC-103 |
| P-29 | MSC-038 | Feature | Replace the synthesized placeholder cues with the approved audio pilot (offline recipes, validated WAV, human audition) and add a music bus. | MSC-045–046 | MSC-047, MSC-078 |
| P-30 | MSC-038 | Feature | Volumes cycle with confirm; offer left/right adjustment (and a direct mute) once menus support horizontal steps. | — | MSC-084, MSC-088 |
| P-31 | MSC-038 | Feature | Clicking the view when the window cannot take pointer lock (hidden or unfocused pane) leaves an unhandled `WrongDocumentError` promise in the console; catch it like the menu's recapture does. | — | MSC-089 |
| P-32 | MSC-039 | Owner | Run the slice playtest with the brother and friends using the script, then hand the sheets over for the results record. | — | MSC-039 |

## Closed

| # | Task | Item | Closed |
|---|---|---|---|
| — | — | — | — |
