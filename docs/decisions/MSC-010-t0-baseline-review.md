# MSC-010 — T0 Baseline and Early-Risk Sequence

**Task:** [MSC-010](../04-phased-agent-task-plan.md#msc-010--approve-baseline-and-early-risk-sequence) · **Date:** 2026-10-29 · **Gate:** T0 product/tech baseline · **Depends on:** MSC-001–009

## 1. Product baseline (already decided)

| Item | Decision | Record |
|---|---|---|
| Core constraints (Mars, host saves, 1–4 online, ≥6 h four-player target, zero spend) | Confirmed unchanged | [MSC-001](MSC-001-decision-register-review.md) |
| Materials (6), tools (6), sectors (7 / 390 min) | Provisional first-pass set; polymer suction removed | [MSC-002](MSC-002-content-hypotheses.md) |
| Privacy, spending, removal, host exit | Approved policy | [MSC-003](MSC-003-session-privacy-spending.md) |
| V0 voice | **Deferred** | [MSC-003](MSC-003-session-privacy-spending.md#v0--voice-chat-decision) |
| Personal progression | Approved policy | [MSC-004](MSC-004-personal-progression-test-access.md) |

## 2. Architecture candidates for acceptance

Status after this gate: **accepted as the working baseline**; each remains replaceable if its own spike/gate fails.

| Layer | Candidate | State |
|---|---|---|
| Language/build | TypeScript 6.0.3 strict, Vite 8.3.5 | Implemented (MSC-005) |
| Desktop | Electron 44.10.0, sandboxed preload, single typed bridge | Implemented (MSC-006) |
| Packaging | electron-builder 26.17.0, asar allowlist, fuses, `dir` target | Implemented (MSC-007) |
| Checks | ESLint/typescript-eslint, Prettier, Vitest, `npm run check` | Implemented (MSC-008) |
| Domain/content | Branded ids, ranged units, zod strict content schema | Implemented (MSC-009) |
| Rendering | Three.js WebGLRenderer | Approved library; in use |
| Physics | Rapier JS/WASM | **Spike at MSC-011** (CSP will need `'wasm-unsafe-eval'` if WASM is compiled at runtime) |
| UI | DOM/CSS with a small view layer; no framework yet | Candidate |
| Input | Action abstraction over keyboard/pointer/Gamepad API | Candidate (MSC-013); controller available for tests |
| Networking | Host-authoritative, transport-independent protocol; local test transport first | Candidate (MSC-021–024) |
| Steam transport | Bounded native extension around SteamNetworkingMessages | **Feasibility unresolved** (MSC-025–030) |
| Audio | Tone.Offline recipes + validated PCM encoder; Web Audio runtime | Candidate (MSC-045–046) |
| 3D production | Procedural primitives + Blender Python/GLB | Candidate (MSC-042–044) |

## 3. Early-risk sequence

```text
Phase 2  MSC-011–020  Local physics/handling spikes ............ runnable now
Phase 3  MSC-021–024  Protocol, claims, idempotency, late join .. runnable now (local transport)
         MSC-025–030  Native Steam T1 gate ...................... BLOCKED by access A1–A3
Phase 4+ Vertical slice, pilots, catalogs ...................... after T1 (sequential plan)
```

- Native Steam and real Deck evidence (T1) **precede** any catalog/content production.
- **Readback of blockers** (MSC-004): no Steamworks App ID (A1), no second account/device on another network (A2), no Steam Deck (A3). Missing access is a Needs-decision blocker, never a purchase.
- Because the plan is strictly sequential, reaching MSC-025 without A1–A3 will **stop the roadmap** at T1 until the owner either provides access or explicitly re-sequences local-only work (for example, continuing the vertical slice on the local transport). That choice is deferred to the moment it happens.

## 4. V0 / V1 review

- V0 outcome: voice **deferred**. No voice implementation, microphone access, UI or claim exists or is planned for launch.
- V1 (native voice feasibility) is **not required** unless voice is re-approved after MSC-030; any re-approval must pass V1 before MSC-088.
- No source-project feature became an implicit requirement: leaderboards, Discord, public lobbies, join codes, always-on voice and relay transport were explicitly not adopted (MSC-003, MSC-004, MSC-006 deviations).

## 5. Marketing-measurement planning (no collection approved)

Only questions, ownership and limits are planned here. Nothing is built, collected or published.

| Question (once a Steam store page exists) | Evidence source | Owner | Zero-cost method |
|---|---|---|---|
| How many wishlists are added per day, and is the rate rising or falling? | Steamworks wishlist report CSV | Owner | Manual dated export saved locally |
| When a day is unusual, what caused it? | Steamworks store traffic page + dated action log | Owner | Manual snapshot of that day + log entry |
| Which actions (news, capsule change, demo) move the rate? | Action log vs. daily snapshots | Owner, agent analyzes on request | Markdown/CSV log in the repo; analysis only when asked |

Proposed contract (from PRD §11): dated snapshots with source and time window; additions, removals and net shown separately; today marked partial; unreadable or missing data recorded as **unknown, never zero**; small samples and UTM-only coverage treated as limits on attribution; a coincident video/search spike is a hypothesis, not proof.

Limits: no scraping, no stored cookies or tokens, no new analytics service or paid tool, no automatic posts/emails/DMs/ticket replies. The source's historical figures (record days, CTRs, demo open rate) are **not targets**. Prerequisite: A1 (App ID and store page), so measurement cannot start yet.

## Context used

- [Steam Voice guide](../../references/steam-voice-steps.md) §§1–3, 5, 12 — confirms voice depends on an initialized Steam client and real two-person validation; not applied because V0 is deferred.
- [Marketing reference](../../references/marketing.txt) — purpose (three daily questions), data sources, daily snapshot and action log, starting order, "what not to measure" and "must not do" sections.

## Deviations

- Source authenticated scraping of partner pages with stored cookies, YouTube API search and ticket-service integration are **not adopted**; owner-supplied manual exports replace them.
- Source spike heuristic (2× seven-day median, ≥20 additions) is kept only as a starting hypothesis.
- Source decisions about creator outreach and cross-promotion belong to another game and are not adopted as policy here.

## Owner decision

**Decision (2026-10-29):** T0 accepted. The architecture candidates are the working baseline, the early-risk sequence stands (native Steam/Deck T1 before any catalog production), voice stays deferred, and marketing measurement remains planning-only until a store page exists. Phase 1 is closed.
