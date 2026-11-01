# Pending Work Register

Everything an implementation left to add, test or decide, so nothing is lost between tasks. Each task's **Outcome** in the [task plan](04-phased-agent-task-plan.md) keeps its summary; this register is the working list.

**Rules:** every implementation adds its open items here in the same commit and closes them (with date and evidence) when they are verified. An item is closed only by observed evidence, never by a plan. Owner decisions and approvals stay in the decision records under `docs/decisions/` and the [PRD](01-product-requirements.md).

**Kinds:** *Play check* (seen in real play), *Co-op* (needs the real two-account transport), *Owner* (owner decision or hardware/account), *Feature* (still to build), *Release* (must happen before shipping).

Last updated: 2026-11-01 (develop merge of phases 3 and 4, before MSC-037).

## Open

| # | Task | Kind | Item | Blocked by |
|---|---|---|---|---|
| P-01 | MSC-026 | Owner | Two-account P2P message exchange with the dev test (`tools/dev-p2p/`), owner and a second account on another network. | Owner test (in progress) |
| P-02 | MSC-026 | Owner | Real App ID (A1); 480 is only for local tests and is never committed or shipped. | Steamworks app |
| P-03 | MSC-026 | Owner | Steam overlay invite seen working between two accounts. | P-01 |
| P-04 | MSC-027–030 | Co-op | Late join, leave/rejoin, invitations and the T1 gate on the real transport. | P-01 |
| P-05 | MSC-031 | Co-op | Guest unload at the intake (guest half of the check). | P-04 |
| P-06 | MSC-032 | Co-op | Compactor interruption when the host or a guest leaves. | P-04 |
| P-07 | MSC-033 | Co-op | Sale under disconnect/rejoin and replayed network event ids. | P-04 |
| P-08 | MSC-034 | Play check | A successful collector purchase seen in play (sell two bales, buy level 2). | — |
| P-09 | MSC-034 | Co-op | Guest purchase request, host approve/decline and "Can spend" over the real transport. | P-04 |
| P-10 | MSC-035 | Play check | Station beacon reveal seen in play after the full route (two sales, upgrade, clearing). | P-08 |
| P-11 | MSC-035 | Play check | Novice walkthrough: a new player names the next action and the visible change. | — |
| P-12 | MSC-035 | Owner | Marker position, radius and 35% threshold are placeholders until the slice playtest. | MSC-039 |
| P-13 | MSC-036 | Play check | Close and reopen after real progress (bales, purchase, cuts) and see everything resume. | — |
| P-14 | MSC-036 | Feature | Host-only menu to start a new campaign or reset, and a choice when a save is unreadable or from a newer version. | Menu work |
| P-15 | MSC-036 | Co-op | Guest never writes the host campaign, checked with a real guest session. | P-04 |
| P-16 | MSC-036 | Owner | Steam Cloud wiring and the divergent-history choice (both summaries, backup kept). Cloud is Proposed. | Authorization |
| P-17 | MSC-036 | Owner | Saves on Steam Deck / Proton (prefix path, suspend, Cloud recovery). | Deck access |
| P-18 | MSC-036 | Feature | Closing the window saves only best effort; the main process could wait for a final save before quitting. | — |
| P-19 | MSC-036 | Feature | Moved props (cart, parts) are saved only with the next durable change, not on their own. | — |
| P-20 | MSC-026 | Release | Remove the dev-only two-account P2P test (`electron/steam/devP2pTest.ts`, `tools/dev-p2p/`, its `main.ts` block and tests). | MSC-118 |
| P-21 | Merge | Owner | Steam smoke on the merged packaged build with the Steam client running (2026-11-01 run had Steam closed: binding loaded, init failed as expected). | Steam running |

## Closed

| # | Task | Item | Closed |
|---|---|---|---|
| — | — | — | — |
