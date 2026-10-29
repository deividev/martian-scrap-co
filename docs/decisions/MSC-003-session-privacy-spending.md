# MSC-003 — Session Privacy, Spending and V0 Voice Policy

**Task:** [MSC-003](../04-phased-agent-task-plan.md#msc-003--resolve-session-privacy-and-spending-policy) · **Date:** 2026-10-29 · **Phase:** 1 — Decision baseline · **Depends on:** [MSC-002](MSC-002-content-hypotheses.md)

Policy for lobby visibility, shared purchases, guest removal, host exit and the conditional V0 voice decision. It refines [PRD-016–020](../01-product-requirements.md#6-cooperative-product-contract) and [PRD §10](../01-product-requirements.md#10-implementation-context-and-conditional-voice-gate). Approved items bind design; technical feasibility is still proven at the native gate (MSC-025–030).

## P1 — Lobby visibility and joining

| Rule | Proposal |
|---|---|
| Default visibility | **Friends-only / invite-only Steam lobby.** |
| Public browser | **Not at launch.** No public lobby list. |
| Join codes | **Not at launch.** May be revisited after MSC-030 as a separate decision. |
| Entry paths | Steam invitation while the game is open; invitation that launches the closed game; "Join game" from the Steam friends list. |
| Pre-join information | Host name, current occupancy (n/4) and "This is <host>'s campaign; progress is saved in their world". |
| Capacity | Maximum four players including host. |
| Recoverable errors | Full lobby, denied access, version mismatch and closed lobby each show a clear message and return to the menu. |
| Host lock | Host can close the session to new joins ("Locked") at any time. |

## P2 — Shared credits and purchase permissions

| Action | Default permission |
|---|---|
| Collect, sort, cut, compact, sell | Everyone. |
| Buy upgrades or facilities | **Host buys directly. Guests send a purchase request** that the host approves or declines. |
| Trusted guests | Host can mark a guest as **"Can spend"** for this session; that guest buys directly. |
| Visibility | Every purchase and request is announced to the crew (who, what, cost, new balance). No silent credit depletion. |
| Free baseline | Basic collector, cart, intake and sale method are never purchasable, sellable or lost (PRD-011). |
| Host-only, never delegable | Delete/reset campaign, change world permissions, overwrite or load saves, change lobby visibility, remove players. |

## P3 — Guest removal

- Host can **remove** a guest from the pause/crew menu with a confirmation prompt.
- A removed guest cannot rejoin that session until the host invites them again.
- Anything the guest was holding is released safely at a valid position; claims are cleared (PRD-019).
- Removal never deletes or alters the guest's own separate campaigns.

## P4 — Guest leave, rejoin and late join

- A guest who leaves releases held objects; the world keeps all committed work.
- A rejoining or late-joining guest receives the current world, facilities and campaign phase **before** acting (PRD-020), plus a short contextual introduction if new.
- Rejoin never restores stale claims or consumed material.

## P5 — Host exit

- Host exit triggers a **safe save first**, then ends the session for everyone.
- Guests see: "<host> ended the session. The campaign is saved in <host>'s world." and return to the menu.
- **No host migration**, no guest copy of the campaign. A guest who wants to keep playing starts their own separate campaign.
- Host crash recovers only the last valid committed save; this boundary is disclosed in the session UI.
- Multiplayer pause does not stop simulation; the menu says so. Solo pause genuinely pauses.

## V0 — Voice chat decision

**Recommendation: DEFER voice chat** for the launch scope.

Reasons:

- Steam already provides friends-list voice and the overlay; players can talk without an in-game service.
- In-game voice adds native capture/decompress bindings, binary transport, per-speaker playback, microphone permission UI, controller/Deck checks and privacy obligations (Steam Voice guide §§2–11), all on top of the riskiest gate (native Steam, MSC-025–030).
- Zero-spend production with one owner favors finishing the base co-op first.

If deferred:

- All voice-specific subwork in MSC-010, MSC-025–027, MSC-083–089, MSC-094–095, MSC-103, MSC-107–109, MSC-112–113 and MSC-116 is recorded as **deferred/inapplicable**; base tasks still run.
- **No microphone controls, indicators or "voice chat" claims** appear in the game, store or trailer.
- The game never captures or records microphone audio.
- Voice may be reconsidered after MSC-030 as a new owner decision with the V1 gate.

If instead approved, the proposed (not adopted) safeguards are: explicit enable + microphone permission; push-to-talk default, mute and truthful availability/capture/transmit indicators; host-relayed lobby-scoped bounded packets; no recording by default; idempotent stop/drain/cleanup on leave; global listening only (no proximity) at first.

## Tabletop check scenarios

| # | Scenario | Expected result under this policy |
|---|---|---|
| T1 | Friend accepts invite while game open | Sees host/occupancy/ownership notice, receives world, then acts. |
| T2 | Friend accepts invite with game closed | Game launches into the same join flow. |
| T3 | Fifth player tries to join | "Session full" message, back to menu. |
| T4 | Guest on older build joins | Version mismatch message; no state change. |
| T5 | Guest without "Can spend" buys an upgrade | Request sent; host sees cost and approves/declines; crew is notified. |
| T6 | Two players buy simultaneously with insufficient credits | Host commits one; the other is rejected with the current balance. |
| T7 | Guest tries to reset campaign or load save | Option not present for guests. |
| T8 | Host removes a disruptive guest holding a cart | Cart released safely; guest returned to menu; cannot rejoin without new invite. |
| T9 | Guest disconnects mid-carry and rejoins | Object was released; guest receives current world; no duplicate. |
| T10 | Host quits | Safe save, guests informed whose world it is, session ends; no migration. |
| T11 | Host game crashes | Guests informed; host reloads last committed save. |
| T12 | (Voice deferred) player looks for mic settings | No voice controls exist; nothing is captured. |
| T13 | (Voice deferred) trailer/debug recording | No player voice can be present; capture guide consent rule stays. |

## Context used

- [Co-op guide](../../references/online-coop.txt) §2.1 (host-authoritative world, guests send intents), §2.4–2.5 (lobby kinds `invite`/`public`/`code`, invitation paths, no host migration), §6 (Cloud allow-list and local hardware settings).
- [Steam Voice guide](../../references/steam-voice-steps.md) §2 (topologies), §5 (capture authorization), §9 (controls), §10 (cleanup), §11 (listening rules only if needed).

## Deviations

- Source public lobby list and 4-letter codes are **not adopted**: PRD-017 starts private/friends-only.
- Source Discord "Ask to join" integration is **not adopted**: no extra service in scope.
- Source relay WebSocket transport is not a player-facing path here; any dev relay is a later technical decision (MSC-021).
- Source personal leaderboards/achievements are left to MSC-004.
- Source voice "Always active" mode is not proposed as a default.

## Owner decision

**Decision (2026-10-29):** Approved P1–P5 as written. **V0: voice chat DEFERRED** for launch scope. All voice-specific subwork is deferred/inapplicable; no microphone capture, controls, indicators or voice claims. Reconsidering voice requires a new owner decision after MSC-030, followed by the V1 gate.
