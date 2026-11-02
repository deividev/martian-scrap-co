# Pending Work Register

Everything an implementation left to add, test or decide, so nothing is lost between tasks. Each task's **Outcome** in the [task plan](04-phased-agent-task-plan.md) keeps its summary; this register is the working list.

**Rules:** every implementation adds its open items here in the same commit, each with the task that will do it (**Do in**), and closes them (with date and evidence) when they are verified. Before starting a task, check this register for items whose **Do in** names it: they are part of that task's work. An item is closed only by observed evidence, never by a plan. Owner decisions and approvals stay in the decision records under `docs/decisions/` and the [PRD](01-product-requirements.md).

**Kinds:** *Play check* (seen in real play), *Co-op* (needs the real two-account transport), *Owner* (owner decision or hardware/account), *Feature* (still to build), *Release* (must happen before shipping).

Last updated: 2026-11-02 (full project review in [estado-del-proyecto.md](estado-del-proyecto.md); P-40 and P-41 added).

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
| P-32 | MSC-039 | Owner | Run the slice playtest with the brother and friends using the script, then hand the sheets and playtest log files over for the results record. | — | MSC-039 |
| P-33 | MSC-039 | Release | Remove or compile out the dev-only playtest log (`electron/playtestLog.ts`, `src/dev/`, the `playtest:*` IPC channels and preload bridge, `tools/dev-playtest/`) and never ship the batch files. | — | MSC-118 |
| P-34 | MSC-039 | Owner | First launch of the new build by the owner: the save is copied from the old `Martian Scrap Co.` folder to `Martian Scrap Co` and resumes, and `playtest.bat` writes a log file to `Documents\Martian Scrap Co playtest logs`. Both were checked only with tests: launching the packaged game from the agent's shell crashed Windows twice (2026-11-01). | — | MSC-039 |
| P-35 | MSC-039 | Feature | The playtest log's last lines (and the `session-end` line) can be lost when the window closes, because the renderer's final send is not awaited; main could flush on quit. Same root as P-18. | — | MSC-092 |
| P-36 | MSC-039 | Release | The old `%APPDATA%\Martian Scrap Co.` folder (trailing dot) stays on dev machines after the save copy; delete it with a tool that supports it, or leave it. Shipped builds never create it. | — | MSC-114 |
| P-37 | MSC-039 | Feature | Several "Current job" lines and tips name mouse buttons even when a controller is in use (for example "hold left click"); they should follow the active device like the bottom hint line does. Found while writing the Spanish playtest guide; also watch for it in P-22. | — | MSC-085 |
| P-38 | MSC-039 | Feature | The same tool has two names on screen: the HUD panel says "Magnetic collector / Imán colector" while jobs, the shop and notices say "collector / colector". Pick one name per language. | — | MSC-083, MSC-087 |
| P-39 | MSC-039 | Owner | Keep the Spanish session guide (`docs/playtests/MSC-039-guia-prueba.md`) aligned with the English script whenever either changes, and record the results from both. | — | MSC-039 |
| P-40 | Review | Owner | Back up the work to GitHub: on 2026-11-02 `develop` was 33 commits ahead of `origin/develop`, `phase/04-vertical-slice` 22 ahead, and `phase/03-coop-authority` was never pushed (its commits are in `develop`). With the recurring Windows crashes, local-only history is at risk. Pushing needs the owner's go-ahead. | Owner go-ahead | Now |
| P-41 | Review | Owner | Find the cause of the recurring 0x50 Windows crashes (memory dump analysis or a memory test). They happen under heavy load, crashed the PC twice while the agent launched the packaged game (2026-11-01), and once truncated `electron.exe`. Binaries were intact on 2026-11-02. | — | Before long play sessions |

## Closed

| # | Task | Item | Closed |
|---|---|---|---|
| — | — | — | — |
