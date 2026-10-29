# MSC-004 — Personal Progression Policy and Test Access

**Task:** [MSC-004](../04-phased-agent-task-plan.md#msc-004--resolve-personal-progression-and-test-access) · **Date:** 2026-10-29 · **Phase:** 1 — Decision baseline · **Depends on:** [MSC-003](MSC-003-session-privacy-spending.md)

Defines what belongs to each player (not to the host campaign) and records which devices, accounts and Steam permissions actually exist for later validation gates. Missing access is a **recorded blocker**, never a purchase instruction.

## Personal progression policy (proposal)

| Item | Owner | Persistence | Rule |
|---|---|---|---|
| Campaign world, credits, upgrades, facilities | **Host** | Host save only | Approved (PRD-016). Guests never persist or copy it. |
| Independent guest play | Guest | Guest's own new campaign | Starts from zero; no import of host progress. |
| Robot color/variant choice | Player | Local profile per player, follows them into any session | Cosmetic only; never a class or tool lock. Two players may pick the same color; the game shows names to disambiguate. |
| Display name | Player | Steam persona name | No custom account or name storage. |
| Settings (graphics, audio, input bindings, sensitivity, accessibility) | Player, per device | Local only, **not synced** | PC and Deck keep separate settings (PRD-021). |
| Steam achievements | Player | Steam | Earned by each player in whichever world they are playing, **including as a guest**. The host never unlocks for a guest. Counters are idempotent (no farm by repeating the same action on the same object). |
| Steam stats | Player | Steam | Optional; same idempotency rule. |
| Leaderboards | — | — | **None at launch.** Not part of a calm co-op campaign. |
| Personal unlocks that change gameplay | — | — | **None.** All gameplay progression lives in the host campaign. |
| Steam Cloud | Host campaign saves only (proposed) | Explicit conflict choice with backup | Detailed in MSC-036/PRD-021; settings stay local. |

## Test access inventory

Verify availability only; no setup commands, purchases or account changes.

| # | Access needed | Needed by | Available? |
|---|---|---|---|
| A1 | Steamworks partner account with an App ID for Martian Scrap Co. | MSC-025–030, packaging, achievements | **No** — blocker. Steam Direct fee is already covered; owner must create the app before MSC-025. |
| A2 | Second legitimate Steam account on a second device in a **different network** | MSC-027–028 | **No** — blocker for MSC-027–028. Needs a legitimate second account and device (e.g. a friend), never a purchase. |
| A3 | Steam Deck | MSC-030, MSC-107–109 | **No** — blocker for real-Deck evidence. Deck compatibility stays an unverified target. |
| A4 | Xbox-compatible controller on Windows | MSC-013, MSC-037, PRD-022 | **Yes**. |
| A5 | Four total accounts/devices for representative four-player load | MSC-029, MSC-103 | _pending_ (asked at MSC-029) |
| A6 | Microphone | — | **Inapplicable**: voice deferred at MSC-003 V0. |

## Context used

- [Co-op guide](../../references/online-coop.txt) §3 (Steamworks in Electron, App ID requirement, win64 binding), §4 (per-player achievements, idempotent counters), §8 (Deck via Proton, real-Deck checklist), §10 (two accounts cannot share one machine; PC + Deck pairing).
- [Steam Voice guide](../../references/steam-voice-steps.md) §12 — not applied: voice deferred.

## Deviations

- Source App ID, fork, vendor binaries and debug environment variables are **not transferred**; this game needs its own App ID (A1).
- Source leaderboards are **not adopted**.
- Source "personal stats" are optional here, not required.

## Owner decision

**Policy (owner, 2026-10-29):** Approved as proposed. Host owns all gameplay progression; robot color, settings and Steam achievements are personal; no leaderboards or personal gameplay unlocks at launch.

**Access (owner, 2026-10-29):** controller available. No App ID, no second account/device on another network and no Steam Deck yet. These are recorded blockers for MSC-025–030 and later device gates; local phases (MSC-005–024) can proceed.
