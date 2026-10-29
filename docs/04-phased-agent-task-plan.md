# Martian Scrap Co. — Phased Agent Task Plan

**Version:** 1.2 first-pass full-game plan (marketing-context alignment, not reapproval) · **Date:** 2026-10-29 · **Status:** execution started; see each task's Status field.

This is a practical sequential breakdown from an empty project to a complete premium game, not a demo-only roadmap or a claim that every future bug fix can be predicted. It creates no implementation, packages, skills, account changes or publication authority. The current assignment produced planning documents only.

**Source of truth:** [Product requirements](01-product-requirements.md) · [Visual direction and concept images](02-visual-art-direction.md) · [Technical architecture](03-technical-stack-architecture.md).

## How to use this plan

- **Approved** product constraints remain binding. Catalogs, sector names, exact balances, libraries, privacy/spending rules and personal progression policy remain **Proposed** until their decision tasks are approved.
- **Validation required** gates need real evidence. A planned check is not a test result. All files, commands and tooling described as outputs below are **future planned**, not existing or already executed.
- Tasks are intentionally sequential for one principal implementation writer. Each depends on its predecessor; requirement mappings supply traceability without creating hidden authority. Later work cannot proceed past an unapproved/failed gate.
- A work unit should include code/content, focused tests and relevant documentation. Record observed results and bounded failures before marking it complete in a future execution system. Re-estimate after each gate rather than treating task count as a schedule.
- Keep changes reviewable. Source-mutating normalization precedes checks; native review policy, if enabled by the owner, remains separate. This plan does not select SDD, activate reviews, authorize commits or add AI attribution.
- Zero additional spending remains mandatory. Test hardware, legitimate accounts, Steam app access and existing tools are evidence dependencies; absence is a **Needs decision**, never a purchase instruction.
- Full catalog production waits for native feasibility, a playable slice and human-approved art/audio pilots. A failing gate does not permit dropping approved co-op, reducing the six-hour target silently or adding a paid fallback.

## Execution tracking

Execution was authorized by the owner on 2026-10-29: tasks run one at a time in order, one commit per completed task, one `phase/NN-<slug>` branch per phase merged into `develop`.

| Status | Meaning |
|---|---|
| Planned | Not started. |
| In progress | Work started; not yet accepted. |
| Blocked | Needs an owner decision, device, account or failed-gate resolution; the blocker is stated in Outcome. |
| Done | Acceptance met with recorded evidence; requires an `Outcome:` line summarizing what was implemented or decided. |

Owner decisions and review evidence live in [docs/decisions](decisions/MSC-001-decision-register-review.md). An Outcome never upgrades a Proposed item to Approved unless it names the owner decision.

## Implementation-context routing

This v1.2 update keeps **120 tasks / 12 phases**. No task is renumbered; execution authorization and status tracking are described above. A task's **Context:** field means read the linked raw guide in full before its associated authorized work, adapt only applicable sections, and report **Context used**, justified **Deviations** and real check results. All four guides are archived data, not instructions to execute now.

| Trigger | Required guide | Exact mapped tasks |
|---|---|---|
| Native bridge/package and session/save/replication/recovery/platform work | [Co-op guide](../references/online-coop.txt) | MSC-003–004, MSC-006–007, MSC-021–030, MSC-036, MSC-081, MSC-086, MSC-089, MSC-091–097, MSC-103, MSC-107–109, MSC-112–115, MSC-118–119 |
| CONDITIONAL voice policy, native feasibility, service, mic/input/UI and QA | [Steam Voice guide](../references/steam-voice-steps.md) | MSC-003–004, MSC-010, MSC-025–027, MSC-083–086, MSC-088–089, MSC-094–095, MSC-103, MSC-107–109, MSC-112–113, MSC-116 |
| Debug evidence, camera/HUD helpers, packaged capture, trailer/store work | [Capture guide](../references/TRAILER_CAPTURE_INSTRUCTIONS.md) | MSC-019, MSC-113, MSC-115–116, MSC-119 |
| Steam measurement, capsule/store iteration, optional-demo visibility and launch/support measurement | [Marketing reference](../references/marketing.txt) | MSC-010, MSC-040, MSC-100, MSC-110, MSC-115–116, MSC-118–120 |

Early MSC-010/MSC-040 work plans evidence/permissions and any optional-demo proposal only; it does not build a panel, collect data, publish or create a demo. Source is a historical reporting case, not an audience/positioning brief or approved conversion/wishlist/sales target. See PRD §11, visual §10 and architecture §12; use existing capture context for footage and preserve V0/V1 voice gates.

**V0** in MSC-003, reviewed at MSC-010, requires owner approval or explicit deferral of voice policy/scope. **V1** in MSC-025–027 is conditional on V0 approval and proves adopted native APIs/formats plus real packaged two-way mic playback before MSC-088's conditional service subunit. If deferred, record voice subwork as deferred/inapplicable while checking the base task; never pretend voice passed. Voice controls/routes/modes/rates/forks remain proposals, and campaign completion cannot depend on chat. See PRD §10, visual §9 and architecture §11. A failed voice gate blocks its dependent subwork for a decision without dropping approved base co-op. No guide approves always-on capture or recording people.

## Gate summary

| Gate | Task | Required decision/evidence |
|---|---|---|
| T0 baseline | MSC-010 | Reviewed product/architecture candidates and early-risk plan. |
| Handling | MSC-020 | Satisfying basic interaction and observed physics budgets. |
| T1 native | MSC-030 | Packaged real Steam different-network tests, four-player load and early real Deck evidence. |
| T2 slice | MSC-040 | Solo/co-op/controller complete collect–sort–compact–sell–buy–save loop. |
| T3 pilots | MSC-050 | In-engine art and human-auditioned audio; then approve catalogs/custom skills. |
| Main mechanics | MSC-060 | Tool niches, credit-dominant economy and finite-resource safeguards. |
| Full content | MSC-080 | All campaign stages and ending present; not yet duration/quality certified. |
| Feature complete | MSC-100 | Explicit scope and traceable persistence/online coverage. |
| T4/T5 release candidate | MSC-110 | Four-newcomer six-hour, solo, real-device, performance and recovery evidence. |
| Delivery | MSC-120 | Owner-authorized handoff; price decided only after full game is developed. |

## Phase 1 — Decision baseline and secure empty-project foundation

### MSC-001 — Confirm the product decision register

Depends on: none

Output: Reviewed approved/proposed/validation-required baseline and PRD traceability map.

Acceptance: Owner confirms no change to Mars, host saves, four-player co-op, six-hour target or zero-spend constraints.

Check: Review every PRD decision row against the approved brief.

Requirements: PRD-001–004, PRD-013–016.

Status: Done

Outcome: 2026-10-29 — Reviewed all 13 PRD §1 decision rows against the brief and mapped them to PRD-001–022 in [MSC-001 review](decisions/MSC-001-decision-register-review.md). Owner confirmed no change to Mars, host saves, four-player co-op, six-hour target or zero spend. No Proposed item promoted.

### MSC-002 — Approve first-pass content hypotheses

Depends on: MSC-001

Output: Decision log for material families, tool catalog and sector sequence.

Acceptance: Proposed names/counts/timing remain explicitly provisional until owner approval; no optional content props up campaign duration.

Check: Owner walkthrough of PRD sections 3–5.

Requirements: PRD-005–015.

Status: Done

Outcome: 2026-10-29 — Owner walkthrough of PRD §§3–5 recorded in [MSC-002 log](decisions/MSC-002-content-hypotheses.md). Six material families, six tool families and the seven-sector/390-minute sequence approved as the provisional first-pass set; polymer suction collector removed (PRD roster updated). Names, counts, prices and minutes stay provisional; optional content contributes zero to duration.

### MSC-003 — Resolve session privacy and spending policy

Depends on: MSC-002

Output: Approved lobby visibility, purchase permissions, guest removal and host-exit behavior.

Acceptance: No public discovery, host migration or guest carryover is inferred; shared spending is understandable. V0: record explicit voice approval or deferral and proposed enable/permission, listening/transmission, mute/PTT/status and recording policy; source modes are not approved defaults.

Check: Tabletop host/guest join, purchase and leave scenarios. Tabletop privacy/mic-denied/focus/recording scenarios; report Context used and justified Deviations.

Requirements: PRD-016–020.

Context: [Co-op guide](../references/online-coop.txt) §§2, 6; [Steam Voice guide](../references/steam-voice-steps.md) §§2, 5, 9–11; PRD §10 and architecture §11.

Status: Done

Outcome: 2026-10-29 — Owner approved the [MSC-003 policy](decisions/MSC-003-session-privacy-spending.md): friends/invite-only lobbies (no public list or codes at launch), host buys directly while guests request purchases unless marked "Can spend", host-only removal/save/reset powers, safe-save host exit with no migration. **V0: voice chat deferred**; all voice subwork is deferred/inapplicable. 13 tabletop scenarios recorded; Context used and Deviations listed. PRD-017/018/020 and PRD §10 updated.

### MSC-004 — Resolve personal progression and test access

Depends on: MSC-003

Output: Policy for cosmetics/settings/achievements plus available devices, accounts and Steam permissions.

Acceptance: Independent guest campaign remains separate; missing Deck/accounts/access are recorded blockers, not purchase instructions. Record actual account/device/microphone access for conditional V1 without purchases; no source project's credentials or identifiers transferred.

Check: Owner reviews policy and evidence-access checklist. Verify availability only; do not run reference setup commands.

Requirements: PRD-016–022.

Context: [Co-op guide](../references/online-coop.txt) §§3, 8, 10; [Steam Voice guide](../references/steam-voice-steps.md) §12.

Status: Done

Outcome: 2026-10-29 — Owner approved the [MSC-004 policy](decisions/MSC-004-personal-progression-test-access.md): host owns all gameplay progression; robot color, Steam achievements (also as guest, idempotent) and per-device local settings are personal; no leaderboards or personal gameplay unlocks. Access inventory: controller available; **no Steamworks App ID, no second account/device on another network, no Steam Deck** — recorded blockers for MSC-025–030 and device gates, not purchases. Microphone inapplicable (voice deferred). PRD-016 updated.

### MSC-005 — Create the empty TypeScript and Vite project

Depends on: MSC-004

Output: Planned project root, strict TypeScript, Vite entry and dependency lockfile.

Acceptance: No reused game source; exact free dependencies and license revisions recorded after compatibility review.

Check: Fresh local build/typecheck smoke with no external service dependency.

Requirements: PRD-001, PRD-022.

Status: Done

Outcome: 2026-10-29 — Created the empty project from scratch: `package.json` (ESM, Node >=22.12), `package-lock.json`, strict `tsconfig.json` (noUncheckedIndexedAccess, exactOptionalPropertyTypes, verbatimModuleSyntax), `vite.config.ts` (relative base, dev server `127.0.0.1:5173`), `index.html` and `src/main.ts` with a Three.js toolchain smoke scene in `src/presentation/`. Pinned three 0.186.1, vite 8.3.5, typescript 6.0.3 (7.x rejected: typescript-eslint supports <6.1) with licenses in the [dependency register](dependencies.md). Checks: `npm ci` + `npm run build` (typecheck + build) pass with 0 vulnerabilities; dev server rendered the scene with no console errors. No reused game source.

### MSC-006 — Establish secure Electron boundaries

Depends on: MSC-005

Output: Planned electron main/preload and typed platform adapter.

Acceptance: Context isolation, no Node integration, sandbox and narrow validated IPC; browser adapter reports capability absence honestly. Adapt native/preload/unpack boundaries, not source-project paths, generic IPC or another packager configuration.

Check: Security readback plus rejection tests for malformed/unapproved IPC. Document adopted revision and Context used/Deviations; prove actual package boundaries rather than copy examples.

Requirements: PRD-021–022.

Context: [Co-op guide](../references/online-coop.txt) §§1, 3; architecture §§4, 11.

Status: Done

Outcome: 2026-10-29 — Added Electron 44.10.0 with ESM main (`electron/main.ts`), sandboxed CommonJS preload (`electron/preload.cts`) and pure IPC policy (`electron/ipcPolicy.ts`), plus the renderer `PlatformAdapter` in `src/platform/` (browser adapter reports all capabilities absent). Context isolation, no Node integration, sandbox, frozen single-method bridge, allowlisted/arity/size/sender-checked IPC, denied navigation/new windows/webviews, permission allowlist (pointer lock, fullscreen) and production CSP. Checks: 26 Vitest rejection/readback tests pass; the built app probed via CDP showed no `require`/`process`/`ipcRenderer`, blocked inline script and `window.open`, and no console errors. Readback, Context used and Deviations in [MSC-006 record](decisions/MSC-006-electron-boundaries.md).

### MSC-007 — Prove production asset loading and packaging

Depends on: MSC-006

Output: Single electron-builder pipeline, package allowlist and production path resolver.

Acceptance: Packaged launch uses no dev server; native-unpack design and runtime assets load from clean location. Adapt native/preload/unpack boundaries, not source-project paths, generic IPC or another packager configuration.

Check: Build and inspect one clean Windows package, with source art/secrets/saves excluded. Document adopted revision and Context used/Deviations; prove actual package boundaries rather than copy examples.

Requirements: PRD-021–022.

Context: [Co-op guide](../references/online-coop.txt) §§1, 3; architecture §§4, 11.

Status: Done

Outcome: 2026-10-29 — Added electron-builder 26.17.0 as the single pipeline (`npm run package` → `release/win-unpacked/`, Windows x64 `dir` target) with an asar allowlist (`dist`, `dist-electron/electron`, `package.json`), `asarUnpack` for future `native/**`/`.node` files, hardened Electron fuses and the `resolveAppPaths()` production resolver (`electron/paths.ts`, 3 tests). three moved to devDependencies so the package carries no `node_modules`. A bundled PNG proves relative asset loading. Checks: asar contents listed with no sources/docs/tests/saves/art; the package copied to a clean temp folder launched without a dev server, loaded the texture and preload bridge with CSP active and no console errors; RUN_AS_NODE fuse effective. Details in [MSC-007 record](decisions/MSC-007-packaging.md).

### MSC-008 — Create local verification and CI-equivalent checks

Depends on: MSC-007

Output: Planned lint/format/typecheck/test/build/package commands and documented local runner.

Acceptance: All checks runnable without new paid infrastructure; failures preserve useful bounded logs.

Check: Introduce one intentional fixture failure and verify check failure, then remove it.

Requirements: PRD-019–022.

Status: Done

Outcome: 2026-10-29 — Added ESLint 10 + typescript-eslint (type-aware, both tsconfig projects, domain import boundary for future `src/domain/`), Prettier, `.gitattributes` (LF for authored text; `references/**` now archived byte-for-byte with original endings) and `tools/check.mjs`. `npm run check` runs format, lint, typecheck, test, renderer build, Electron build and the docs validator in order (`-- --package` adds electron-builder), writes bounded head/tail logs to `.check-logs/` and exits non-zero on any failure. All local, no paid infrastructure. Checks: full run 7/7 PASS; an intentional failing fixture test made the runner report `test` FAIL with the assertion and exit 1, then was removed and the run returned to 7/7 PASS.

### MSC-009 — Define domain contracts and content schema

Depends on: MSC-008

Output: Planned domain types, stable IDs, units, material compatibility and content validation.

Acceptance: Rendering/native handles cannot be entity identity; credits and quantities have explicit valid ranges.

Check: Schema and unit tests reject negative, non-finite and unknown values.

Requirements: PRD-005–011, PRD-019.

Status: Done

Outcome: 2026-10-29 — Added `src/domain/`: branded string ids (`ContentId`, `EntityId`, `WorldId`, `TransactionId`) with a never-reusing persisted `EntityIdAllocator`, so numeric render/physics/native handles cannot act as identity; unit types (credits, quantity, kg, m, s) with explicit ranges that throw instead of clamping and a non-negative credit spend; material/tool definitions with `checkCompatibility` returning intelligible reasons. Added `src/content/schema.ts` (zod 4.6.7 strict schema with duplicate/unknown-reference checks and a PRD-011 rule that every material is collectable by a free-baseline tool) and the provisional MSC-002 pack in `src/content/firstPass.ts` (placeholder prices/masses; only ferrous is magnet-compatible). Checks: `npm run check` 7/7; 84 tests including rejection of negative, fractional, NaN/Infinity, string, unknown-field, unknown-id and duplicate values; lint verified to block `three` imports in `src/domain/`.

### MSC-010 — Approve baseline and early-risk sequence

Depends on: MSC-009

Output: T0 review record and prototype scope.

Acceptance: Owner accepts proposed architecture candidates and knows native Steam/Deck gates precede catalog production. Review V0 decision explicitly: no conditional voice implementation before owner approval; deferral leaves base co-op unchanged. Plan marketing-measurement questions, evidence ownership and legitimate zero-extra-cost access early; no new service, publication or data collection is approved.

Check: Read back dependencies, zero-cost constraint and unresolved test-access blockers. Confirm V1 is required for any approved voice subwork and no source feature became an implicit requirement. Review proposed snapshots/action log, unavailable/partial-data handling and owner permissions; historical wishlist results are not targets.

Requirements: PRD-013, PRD-016–022.

Context: [Steam Voice guide](../references/steam-voice-steps.md) §§1–3, 5, 12; PRD §10 and architecture §11. [Marketing reference](../references/marketing.txt) purpose/data/snapshot/starting-order sections; PRD §11, visual §10 and architecture §12.

Status: Done

Outcome: 2026-10-29 — **Gate T0 accepted by the owner** ([MSC-010 review](decisions/MSC-010-t0-baseline-review.md)). Architecture candidates are the working baseline (implemented: TS/Vite, secure Electron, electron-builder, checks, domain/content; pending spikes: Rapier, protocol, Steam transport, audio, 3D). Early-risk order confirmed: local Phase 2 and MSC-021–024 can run; MSC-025–030 are blocked by missing App ID, second account/network and Deck, and catalogs wait for T1. V0 voice deferral reviewed, V1 not required. Marketing measurement planned only (owner-run manual Steamworks exports, unknown never zero, no scraping/services), starting after a store page exists.

## Phase 2 — Local authoritative simulation and physical handling

### MSC-011 — Integrate Rapier feasibility scene

Depends on: MSC-010

Output: Planned simulation adapter with a small physics sandbox.

Acceptance: WASM loads in browser and packaged Electron; gravity/scale/collider conventions documented.

Check: Run identical basic bodies/queries in dev and packaged runtime.

Requirements: PRD-005, PRD-008.

Status: Done

Outcome: 2026-10-29 — Added the engine-neutral `PhysicsWorldPort` and a Rapier 0.21.0 (compat WASM) implementation in `src/simulation/physics/`, documented conventions (+Y up, SI units, Mars gravity 3.721 m/s², fixed 1/60 s step with capped catch-up, numeric handles never used as identity) and turned the smoke scene into a small falling-crates sandbox. CSP now allows `'wasm-unsafe-eval'` only. Check: the same probe (3 boxes, 600 steps, downward ray) gave identical results in Vitest/Node, the browser dev server and the packaged Electron app from a clean folder; 4 new tests. Details in [MSC-011 record](decisions/MSC-011-physics-conventions.md).

### MSC-012 — Separate visual density from active bodies

Depends on: MSC-011

Output: Decorative, dormant and active scrap categories with stable IDs.

Acceptance: Activation does not refill cleared scrap; awake-body count is observable.

Check: Activate/deactivate a cluster repeatedly and verify identity/conservation.

Requirements: PRD-001, PRD-005, PRD-021.

Status: Done

Outcome: 2026-10-29 — Added `ScrapField` (`src/simulation/scrap/scrapField.ts`): clusters hold decorative visual counts (never simulated) plus identified pieces that are `dormant` (pose only), `active` (physics body, transient handle map) or `removed` (terminal, never re-created). Deactivation stores the live pose and rotation; snapshots persist no handles and save active pieces as dormant; a fully cleared cluster drops its decorative mass so cleared areas stay cleared. `metrics()` exposes dormant/active/removed, decorative instances, physics bodies and awake bodies. Physics boxes accept an initial rotation. Check: 50 activate/step/deactivate cycles keep the same ids, conserve 15 pieces, leave only the ground body and never revive a removed piece; save/restore round trip preserves poses; awake count observed going 9 → 0 after settling; `npm run check` 7/7.

### MSC-013 — Implement first-person action controller

Depends on: MSC-012

Output: Planned movement/look/interact abstraction and simple robot proxy.

Acceptance: Keyboard/mouse and controller share actions; collisions and camera remain stable.

Check: Navigate ramps, corners and recovery zones on both input types.

Requirements: PRD-003, PRD-022.

Status: Done

Outcome: 2026-10-29 — Added one action vocabulary (`src/input/actions.ts`: move, look, jump, interact, pause, active device) fed by `KeyboardMouseSource` (WASD/arrows by physical code, pointer-locked mouse look, blur releases keys) and `GamepadSource` (standard mapping, rescaled radial deadzone, time-scaled stick look, edge-triggered A/X/Menu); settings defaults in `inputSettings.ts`. `PlayerController` drives a Rapier kinematic capsule (new character API in the physics port: slide, 40° slope limit, 0.3 m autostep, ground snap) with clamped pitch, calm Mars-gravity jump (~0.9 m) and recovery to the last fully supported ground (four-ray support check) from pits or recovery zones. The scene is now a first-person movement test yard (15°/30°/50° ramps, 20/50 cm steps, inside corner, pit) with a rounded robot proxy, crosshair and device-aware prompts. Checks: 10 controller tests on the yard (both ramps climbed, 50° blocked, 20 cm stepped/50 cm blocked, corner not penetrated, pit recovery, pitch clamp, jump height) plus a test proving keyboard W and a full forward stick give identical movement; 9 input tests; in-browser W press moved the player 4 m with the prompt switching to keyboard; `npm run check` 7/7. **Not yet exercised on real controller hardware**: the owner's keyboard/controller walkthrough is part of MSC-020.

### MSC-014 — Build collector compatibility and target feedback

Depends on: MSC-013

Output: Basic magnetic collection action and compatibility cues.

Acceptance: Ordinary magnet collects ferrous only; unsupported targets remain intact and explained.

Check: Test all proposed material flags, wall occlusion and competing targets.

Requirements: PRD-005–006, PRD-009.

Status: Done

Outcome: 2026-10-29 — Added `pickTarget` (`src/simulation/collection/targeting.ts`: 3.5 m reach, 14° cone, closest-to-aim then nearest, line-of-sight ray that must hit the candidate itself and ignores the player capsule) and `MagneticCollector` (`magneticCollector.ts`): compatibility comes from the content pack, so the ordinary magnet attracts ferrous only; incompatible pieces stay untouched with a reason built from content ("Aluminum isn't magnetic. Collect with: Hands, Grabber."); compatible pieces are pulled at 6 m/s and collected exactly once on arrival (0.7 m), not on button press; pulls drop safely when out of range. The test yard gained a mixed 18-piece pile with readable material colors, target highlight and an on-screen feedback line with the material symbol as a non-color cue (E / click or X to collect). Checks: all six material flags (ferrous attracted, five rejected and left active), wall occlusion, reach/cone limits, competing targets switching with aim, single collection and no confirmation at press; in the running Electron app the player looked down at the pile, targeted "Fe Ferrous Scrap: collect" and E raised the collected count 0 → 1; `npm run check` 7/7. Not stealing another player's held object needs claims (MSC-022).

### MSC-015 — Implement portable batch container

Depends on: MSC-014

Output: Container accounting, capacity feedback and safe overflow behavior.

Acceptance: Small scrap transfers once; full capacity never deletes or duplicates input.

Check: Boundary tests around empty/full containers and repeated collect requests.

Requirements: PRD-005–006, PRD-019.

Status: Done

Outcome: 2026-10-29 — Added the domain `PortableContainer` (`src/domain/container.ts`): provisional capacity 20 pieces, per-material batch summary, `unloadAll()` that hands every item back exactly once, duplicate ids rejected, full intake refused without touching contents. The collector now captures through a `CollectionSink`: a full container makes compatible targets `blocked` ("Container full. Unload at the base intake.") and refuses to start a pull; if it fills mid-pull the piece is dropped and stays in the world; otherwise the piece leaves the world and enters the container in the same step. `fixedUpdate` returns explicit outcomes (collected / dropped with reason). HUD shows "Container n/20" with a full state. Checks: boundary tests for empty, capacity−1, full, overflow, repeated requests for the same piece, invalid capacity/mass, and collector integration (blocked at start, full on arrival keeps the piece, two pieces collected once each with removed count equal to container count); running Electron app showed "Container 1/20" after one collection; `npm run check` 7/7.

### MSC-016 — Implement medium-object grip and placement

Depends on: MSC-015

Output: Claimable medium props with rotate/drop anchors.

Acceptance: Grip remains readable in first person; invalid placement rejects safely.

Check: Pick/drop near edges, other props and player collision proxies.

Requirements: PRD-005, PRD-008.

Status: Done

Outcome: 2026-10-29 — Added `ClaimRegistry` (one holder per object; second claims fail instead of stealing; holder-only release; `releaseAll` for disconnects), `MediumPropSet` (dynamic medium props with recovery to the last settled, sleeping pose when they fall below −20 m) and `GripController`: the held object stays a physical body steered to a hold point 1.6 m ahead and 0.45 m below the eye (readable in first person), floats while held, rotates in 45° steps (new `rotate` action: Q/R, LB/RB) and cannot pass through walls or props. Placement is refused and the object kept when it is held back by an obstacle (`blocked`) or overlaps the player; a valid place restores gravity and releases the claim. Physics port gained sleep state, angular velocity, pose teleport and gravity scale. The test yard has three medium props; aim chooses between props and scrap by angle, with grab/holding/refusal prompts. Checks: 10 grip/claim tests (claim and hold point, claimed-by-other refusal, rotation, valid place, wall blocking + refused placement, player overlap refusal, props not passing through each other, edge drop recovered to the last settled pose not the release point) and a rotate input test; in the running Electron app the player aimed at "Polymer housing: grab", grabbed, rotated and placed it; `npm run check` 7/7. Observation for MSC-020: a held object at full follow speed can shove lighter props hard.

### MSC-017 — Prototype cart handling and recovery

Depends on: MSC-016

Output: Loadable cart with retrieval/reset assistance.

Acceptance: One player can move intended loads; cart cannot permanently trap required resources.

Check: Drive loaded/empty routes and recover overturned/out-of-bounds cases.

Requirements: PRD-005, PRD-014.

Status: Done

Outcome: 2026-10-29 — Added `Cart` (`src/simulation/handling/cart.ts`): a 40 kg push cart claimed by one pusher, steered to a point 1.4 m ahead of the player with heading following the player; up to 4 loads / 60 kg (provisional). Loaded props are claimed by the cart and ride on bed slots with their bodies disabled, so they cannot fall out or be grabbed; `unloadAll` lines them up beside the cart with physics restored and claims released. Recovery assistance: the cart rights itself after more than 1 s tipped past 60°, and returns (with its loads) to its last settled spot if it leaves the yard. Physics port gained body enable/disable and linear velocity readback; quaternion helpers moved to `physics/quat.ts`; new `secondary` action (F / Y) unloads. Test yard has a cart: aim to push, drop a held prop over the bed to load, F to unload. Checks: 10 cart tests (empty route, turning, second-player push refused, full 4-item load carried along a route, mass/duplicate limits, claimed prop refused, unload with physics and claims restored, bed detection, tip-over self-righting with load kept, out-of-bounds return with loads); in the running Electron app a prop was grabbed, loaded (1/4), pushed 3.3 m and unloaded; `npm run check` 7/7.

### MSC-018 — Prototype designed cutting joints

Depends on: MSC-017

Output: Assembly state and predefined stable fragment graph.

Acceptance: Each joint/fragment is created at most once; cut order preserves access.

Check: Cut joints in alternative valid orders and retry identical commands.

Requirements: PRD-008, PRD-019, PRD-021.

Status: Planned

### MSC-019 — Build representative benchmark fixture

Depends on: MSC-018

Output: Parameterizable dense-yard fixture and frame/simulation/memory metrics.

Acceptance: Metrics distinguish visual instances, awake bodies and interaction cost; no safe-count claims yet. Any debug/camera/HUD evidence helper is bounded and separately authorized; it records no human voice by default and implies no launch photo mode.

Check: Capture baseline on identified available hardware with build hash. Record actual build/settings and useful evidence; source capture preferences are not benchmark results.

Requirements: PRD-001, PRD-005, PRD-022.

Context: [Capture guide](../references/TRAILER_CAPTURE_INSTRUCTIONS.md) camera/format/review guidance; visual §9 and architecture §11.

Status: Planned

### MSC-020 — Review core handling and simulation feasibility

Depends on: MSC-019

Output: Handling approval and provisional measured budgets.

Acceptance: Owner accepts collector/cart/cutting feel; unresolved performance failures block scale-up.

Check: Recorded keyboard/controller walkthrough and worst-case fixture review.

Requirements: PRD-002, PRD-005–009, PRD-022.

Status: Planned

## Phase 3 — Co-op authority and real Steam/native feasibility

### MSC-021 — Define protocol and transport ports

Depends on: MSC-020

Output: Versioned message schemas and local deterministic transport.

Acceptance: Protocol has bounded messages and no direct Steam dependency in domain. Use source intents/events, claim cleanup and snapshot lessons without adopting packet thresholds/timers or legacy P2P.

Check: Schema tests plus local two-client intent/event exchange. Report Context used/Deviations and invariant/rejection evidence under late join, duplication and reconnect.

Requirements: PRD-016–020.

Context: [Co-op guide](../references/online-coop.txt) §§2.1–2.5; architecture §§5–6, 11.

Status: Planned

### MSC-022 — Implement host validation and object claims

Depends on: MSC-021

Output: Host command router, claim ownership and reject/resync responses.

Acceptance: Only lobby members with permission affect world; simultaneous claims produce one owner. Use source intents/events, claim cleanup and snapshot lessons without adopting packet thresholds/timers or legacy P2P.

Check: Race two clients, send stale revisions and forged/invalid intents. Report Context used/Deviations and invariant/rejection evidence under late join, duplication and reconnect.

Requirements: PRD-018–020.

Context: [Co-op guide](../references/online-coop.txt) §§2.1–2.5; architecture §§5–6, 11.

Status: Planned

### MSC-023 — Implement event idempotency and fault harness

Depends on: MSC-022

Output: Transaction IDs/result cache plus delay/loss/duplicate/reorder injection.

Acceptance: Repeated collect/cut intents cannot duplicate outputs; disposable pose loss is tolerated. Use source intents/events, claim cleanup and snapshot lessons without adopting packet thresholds/timers or legacy P2P.

Check: Replay a fixed fault schedule and compare authoritative invariants. Report Context used/Deviations and invariant/rejection evidence under late join, duplication and reconnect.

Requirements: PRD-019–021.

Context: [Co-op guide](../references/online-coop.txt) §§2.1–2.5; architecture §§5–6, 11.

Status: Planned

### MSC-024 — Implement late join and bounded snapshots

Depends on: MSC-023

Output: Consistent-revision snapshot/chunk/reassembly and catch-up pipeline.

Acceptance: Partial/oversize/expired snapshots never enable interaction; rejoin releases stale claims. Use source intents/events, claim cleanup and snapshot lessons without adopting packet thresholds/timers or legacy P2P.

Check: Join active fixture, omit/duplicate chunks and request resync. Report Context used/Deviations and invariant/rejection evidence under late join, duplication and reconnect.

Requirements: PRD-020–021.

Context: [Co-op guide](../references/online-coop.txt) §§2.1–2.5; architecture §§5–6, 11.

Status: Planned

### MSC-025 — Audit native binding and choose modern candidate

Depends on: MSC-024

Output: Revision-specific Steam API/SDK support matrix and minimal addon design.

Acceptance: Legacy P2P is not presented as modern transport; Messages candidate or blocker is explicit. If V0 approved voice, audit exact capture/codec/stop-state exports, binary format/framing and runtime compatibility for V1; fork/API availability is not assumed.

Check: Inspect adopted binding/SDK source and review licenses/maintenance cost. Record adopted SDK/binding commit and unsupported capabilities; reference documentation alone is not native proof.

Requirements: PRD-017, PRD-019–020.

Context: [Co-op guide](../references/online-coop.txt) §3 and open networking risks; [Steam Voice guide](../references/steam-voice-steps.md) §3; architecture §§5, 11.

Status: Planned

### MSC-026 — Build bounded native Steam transport spike

Depends on: MSC-025

Output: Conditional Rust/N-API extension or minimal SDK addon plus secure bridge.

Acceptance: Only required lobby/identity/transport methods exposed; packaged binary initializes correctly. CONDITIONAL voice subunit only after V0: reuse one Steam lifecycle, implement bounded native capture/decode/transport probe and shutdown; no second initializer or required source fork.

Check: Native startup, callback shutdown and reliable/disposable message smoke. If authorized, prove real microphone bytes/return states and receive playback in the packaged probe; exporting methods or injected PCM is insufficient.

Requirements: PRD-017, PRD-019–020.

Context: [Co-op guide](../references/online-coop.txt) §§1–3; [Steam Voice guide](../references/steam-voice-steps.md) §§1–8; architecture §11 V0/V1.

Status: Planned

### MSC-027 — Prove packaged two-network Steam connectivity

Depends on: MSC-026

Output: T1 evidence from two legitimate accounts/devices and different networks.

Acceptance: Steam-launched packaged game connects without port forwarding; no paid backend fallback. If V0 approved voice, V1 also requires real bidirectional mic capture/decode/playback between legitimate participants before MSC-088; otherwise record voice subwork deferred, not passed.

Check: Record send/receive, teardown, membership rejection and network conditions. Record actual format, queue/IPC bounds and two-way audio/device evidence without storing conversations by default.

Requirements: PRD-017, PRD-019–020.

Context: [Co-op guide](../references/online-coop.txt) §§2.4–2.5, 10; [Steam Voice guide](../references/steam-voice-steps.md) §12; architecture §11 V1.

Status: Planned

### MSC-028 — Prove real invitations and recovery paths

Depends on: MSC-027

Output: Evidence for open/closed-game invites, versions, rejoin and host departure.

Acceptance: No duplicated world effects; host-exit consequence is clear; unsupported version blocked. Source invite/rejoin/Deck checkmarks, flags, rate choices and performance statements are not results here.

Check: Real Steam scenario matrix with saves and sanitized logs. Exercise actual adopted revision and platforms; report Context used, justified Deviations and missing evidence.

Requirements: PRD-016–021.

Context: [Co-op guide](../references/online-coop.txt) §§2, 7–10; architecture §§5–6, 11.

Status: Planned

### MSC-029 — Prove representative four-player native load

Depends on: MSC-028

Output: Four-player benchmark using concurrent collection/cart/cutting and late join.

Acceptance: Agreed budget evidence includes bandwidth/snapshot/frame percentiles; findings are actionable. Source invite/rejoin/Deck checkmarks, flags, rate choices and performance statements are not results here.

Check: Record a sustained representative session on available target hardware. Exercise actual adopted revision and platforms; report Context used, justified Deviations and missing evidence.

Requirements: PRD-013, PRD-019–022.

Context: [Co-op guide](../references/online-coop.txt) §§2, 7–10; architecture §§5–6, 11.

Status: Planned

### MSC-030 — Prove early Deck path and close native feasibility gate

Depends on: MSC-029

Output: T1 Windows/controller and actual Deck/Proton feasibility review.

Acceptance: Real Deck launch/input/overlay/suspend tested; missing hardware/access means Needs decision, not compatibility success. Source invite/rejoin/Deck checkmarks, flags, rate choices and performance statements are not results here.

Check: Owner reviews evidence and approves continuation or records a blocking decision. Exercise actual adopted revision and platforms; report Context used, justified Deviations and missing evidence.

Requirements: PRD-017, PRD-020, PRD-022.

Context: [Co-op guide](../references/online-coop.txt) §§2, 7–10; architecture §§5–6, 11.

Status: Planned

## Phase 4 — First complete playable vertical slice

### MSC-031 — Build batch classification intake

Depends on: MSC-030

Output: Mixed-batch preview and material hopper routing.

Acceptance: No screw-by-screw sorting requirement; incompatible intake safely returns/retains input.

Check: Solo/guest tests with mixed, empty and full batches.

Requirements: PRD-006, PRD-019.

Status: Planned

### MSC-032 — Build physical compactor state machine

Depends on: MSC-031

Output: Loading/processing/blocked/output states and unique bale output.

Acceptance: Inputs reserve and commit atomically; blocked exit never destroys progress.

Check: Interrupt each machine transition, retry and inspect conservation.

Requirements: PRD-007, PRD-019, PRD-021.

Status: Planned

### MSC-033 — Build sale transaction and feedback

Depends on: MSC-032

Output: Sale preview, host commit and shared-credit update.

Acceptance: Output removal and payment are one transaction; duplicate submission pays once.

Check: Race two sales, disconnect/rejoin and replay event IDs.

Requirements: PRD-007, PRD-010, PRD-019.

Status: Planned

### MSC-034 — Build shared upgrade purchase slice

Depends on: MSC-033

Output: One meaningful tool/container upgrade with permissions.

Acceptance: Debit/grant atomic; host approval flow follows agreed policy; effect is visible.

Check: Concurrent purchase and insufficient-credit tests on host/guest.

Requirements: PRD-009–011, PRD-018–019.

Status: Planned

### MSC-035 — Create starter-yard slice route

Depends on: MSC-034

Output: Short collection-to-upgrade route and first station reveal.

Acceptance: One connected Mars yard communicates campaign promise without full catalog art.

Check: Novice walkthrough identifies next action and visible change.

Requirements: PRD-001–004, PRD-013.

Status: Planned

### MSC-036 — Implement initial durable save and recovery

Depends on: MSC-035

Output: Versioned host save with stable/consumed IDs and backup.

Acceptance: Slice resumes after completed transactions; guests never inherit host campaign. Host-only campaign and explicit divergent-Cloud conflict policy override source localStorage/timestamp-only assumptions; do not import personal stats as campaign carryover.

Check: Terminate around save boundaries and restore last valid revision. Compare source lessons with atomic-save, recovery and conflict fixtures; report policy deviations explicitly.

Requirements: PRD-016, PRD-019–021.

Context: [Co-op guide](../references/online-coop.txt) §§2.1, 4, 6, 8.5; PRD §10 and architecture §§7, 11.

Status: Planned

### MSC-037 — Connect slice UI and controller focus

Depends on: MSC-036

Output: Sparse HUD, material cues and shop/navigation using approved style.

Acceptance: All slice actions use keyboard/mouse and controller with explicit back/focus.

Check: Complete slice without touching mouse, including one error path.

Requirements: PRD-006–007, PRD-022.

Status: Planned

### MSC-038 — Integrate temporary sound and feedback

Depends on: MSC-037

Output: Original placeholder collector/press/sale cues with volume controls.

Acceptance: Placeholders are identified; essential information remains visible when muted.

Check: Mute run and four-player overlap review; no final-audio claim.

Requirements: PRD-002, PRD-022.

Status: Planned

### MSC-039 — Playtest slice with solo and newcomers

Depends on: MSC-038

Output: Observations covering first 15–30 minutes and co-op role switching.

Acceptance: No obligatory classes/two-person locks; confusion and repetitive actions recorded honestly.

Check: Observe independent solo and group routes without coaching beyond script.

Requirements: PRD-002–004, PRD-014, PRD-022.

Status: Planned

### MSC-040 — Approve slice and scope before catalog work

Depends on: MSC-039

Output: T2 decision, revised risks and content budget.

Acceptance: Owner approves feel/readability and requires T1 evidence; unresolved blockers remain closed gates. If useful, propose optional-demo/visibility measurement for explicit owner scope review; this does not create a demo, publish a page or change complete-game requirements.

Check: Read back PRD scope, test findings and proposed revisions. Record whether demo/measurement planning is approved or deferred; do not use source funnel numbers as game-quality or six-hour evidence.

Requirements: PRD-001–022.

Context: [Marketing reference](../references/marketing.txt) demo funnel/action-log sections; PRD §11, visual §10 and architecture §12.

Status: Planned

## Phase 5 — Art/audio pilots and reusable production tools

### MSC-041 — Define pilot asset quality contracts

Depends on: MSC-040

Output: One robot/tool/scrap family/machine specification using approved images.

Acceptance: Rounded same-body robots and grounded station style preserved; concept geometry gaps documented.

Check: Review proportions, palette, hierarchy, pivots and interaction anchors.

Requirements: PRD-001–003, PRD-005–009.

Status: Planned

### MSC-042 — Build procedural bulk-scrap pilot

Depends on: MSC-041

Output: Seeded primitive/instancing recipe and source/export manifest.

Acceptance: Material readable; dormant/active integration does not break identity or budgets.

Check: Compare two views and benchmark in slice lighting.

Requirements: PRD-001, PRD-005–006.

Status: Planned

### MSC-043 — Build hero robot and tool pilot

Depends on: MSC-042

Output: Blender/script or suitable procedural sources with runtime exports.

Acceptance: Two-view silhouette, first-person framing, pivots/colliders and simple animation pass.

Check: Render in slice and inspect attachments, scale and reduced settings.

Requirements: PRD-003, PRD-009, PRD-022.

Status: Planned

### MSC-044 — Build machine/environment modular pilot

Depends on: MSC-043

Output: One compactor/hopper and small station module kit.

Acceptance: Moving pivots/output zones fit gameplay; style matches approved Mars anchor.

Check: Run full slice loop with final-style pilot modules.

Requirements: PRD-001, PRD-007–008.

Status: Planned

### MSC-045 — Render original procedural audio pilot

Depends on: MSC-044

Output: TypeScript synthesis/score recipes using Tone.Offline candidate.

Acceptance: Original small score/SFX set; AudioBuffer output is not mislabeled WAV.

Check: Render deterministic/recorded recipe revisions with known rate/channels.

Requirements: PRD-002, PRD-022.

Status: Planned

### MSC-046 — Validate PCM encoding and audio measurements

Depends on: MSC-045

Output: Separate PCM WAV encoder/tests plus local metadata/signal report.

Acceptance: Header/sample/channel/duration correct; peak/DC/loudness checked without flattening every SFX.

Check: Known-waveform tests and local FFprobe/FFmpeg inspection if available.

Requirements: PRD-002, PRD-022.

Status: Planned

### MSC-047 — Audition pilot sound in gameplay

Depends on: MSC-046

Output: Human-approved loop/mix notes and bounded revision.

Acceptance: No clicks/seam/fatigue problem accepted solely because metrics pass; four-player mix legible.

Check: Listen with headphones/speakers and reduced music/SFX settings.

Requirements: PRD-002, PRD-022.

Status: Planned

### MSC-048 — Create narrow proven asset skill if warranted

Depends on: MSC-047

Output: Planned model-agnostic asset skill/helpers derived from successful pilot.

Acceptance: Reuses installed skills where appropriate; scoped triggers, sources, bounded correction and human gate.

Check: Validate skill structure and exercise one new small asset end to end.

Requirements: PRD-001, PRD-005–009.

Status: Planned

### MSC-049 — Create narrow audio/work-unit skills if warranted

Depends on: MSC-048

Output: Planned audio recipe/export skill; gameplay/co-op skill only for demonstrated repetition.

Acceptance: No giant framework, paid APIs or named-model quality guarantees.

Check: Apply helpers to a second small cue and one bounded co-op work unit.

Requirements: PRD-002, PRD-019–022.

Status: Planned

### MSC-050 — Approve production pilots and manifests

Depends on: MSC-049

Output: T3 approval and catalog production limits.

Acceptance: T1/T2 passed; art and audio human approval recorded; original/license provenance established.

Check: Owner reviews in-engine assets, audition and measured production cost.

Requirements: PRD-001–003, PRD-022.

Status: Planned

## Phase 6 — Full tools, materials, processing and economy

### MSC-051 — Finalize material rules and content data

Depends on: MSC-050

Output: Approved bounded material roster with compatibility/processing schema.

Acceptance: Recognizable and fictional materials differ meaningfully; names/counts explicitly approved now.

Check: Data validation and material-identification playtest.

Requirements: PRD-006–009.

Status: Planned

### MSC-052 — Produce approved scrap families

Depends on: MSC-051

Output: Runtime catalog, source manifests and collision/activation metadata.

Acceptance: Every family covers needed small/medium/assembly forms within calibrated budget.

Check: Two-view art review plus content/physics validation.

Requirements: PRD-001, PRD-005–008.

Status: Planned

### MSC-053 — Complete magnetic tool upgrade branch

Depends on: MSC-052

Output: Reach/control/filter upgrades and matching readable feedback.

Acceptance: Filter selection never grants ordinary magnet universal attraction; early tiers remain useful.

Check: Test every tier/material and controller filter transition.

Requirements: PRD-006, PRD-009–010.

Status: Planned

### MSC-054 — Complete non-ferrous handling upgrade branch

Depends on: MSC-053

Output: Grabber/sheet clamp capabilities and tier effects.

Acceptance: Nonmagnetic collection is satisfying, not a deliberately punishing alternative.

Check: Controller handling test on each supported material shape.

Requirements: PRD-005–006, PRD-009.

Status: Planned

### MSC-055 — Complete cutter and assembly catalog

Depends on: MSC-054

Output: Cutter branch, authored joint definitions and fragment sets.

Acceptance: Cut targets readable; no mandatory arbitrary fracture; valid cut orders preserve traversal.

Check: Permutation/race tests and solo/controller assembly walkthrough.

Requirements: PRD-008–009, PRD-014.

Status: Planned

### MSC-056 — Complete cart and container progression

Depends on: MSC-055

Output: Distinct capacity/control/unload upgrades with visual changes.

Acceptance: Solo transport remains possible; exact capacities/prices tuned rather than copied from mockup.

Check: Loaded route tests and upgrade before/after observations.

Requirements: PRD-005, PRD-009, PRD-014.

Status: Planned

### MSC-057 — Complete base facility upgrades

Depends on: MSC-056

Output: Material hoppers, compactors, unloading aids and bounded conveyors.

Acceptance: Automation reduces base friction without collecting/finishing yard autonomously.

Check: Compare active collection share and output congestion across tiers.

Requirements: PRD-007, PRD-009, PRD-012.

Status: Planned

### MSC-058 — Model and audit finite-resource economy

Depends on: MSC-057

Output: Credit/value/prerequisite graph and reachability/solvency tests.

Acceptance: Required progression affordable after all legal purchase orders or supported refund protection; no infinite respawn assumption.

Check: Solver/fixture audits for depleted sectors, delivery reserves and optional spending.

Requirements: PRD-010–011.

Status: Planned

### MSC-059 — Implement economy safeguards and milestone deliveries

Depends on: MSC-058

Output: Approved refund/respec/recovery policy and occasional colony deliveries.

Acceptance: Credits dominate normal progression; material delivery cannot consume the last required resource.

Check: Adversarial saves and simultaneous delivery/purchase tests.

Requirements: PRD-010–011, PRD-019.

Status: Planned

### MSC-060 — Review complete mechanical progression

Depends on: MSC-059

Output: Tool/facility/economy acceptance record before sector population.

Acceptance: Each tool has a distinct useful branch; no recipe-crafting drift or silent mandatory grind.

Check: Owner plays representative early/middle/late loops.

Requirements: PRD-002, PRD-005–014.

Status: Planned

## Phase 7 — Connected campaign sectors and story

### MSC-061 — Author full yard topology and route graph

Depends on: MSC-060

Output: Connected Mars blockout with seven proposed beats and base links.

Acceptance: No isolated orbital map; station reveal and safe returns work in all progression states.

Check: Solo/cart traversal through complete graybox.

Requirements: PRD-001, PRD-004, PRD-013–014.

Status: Planned

### MSC-062 — Build receiving flats campaign opening

Depends on: MSC-061

Output: Starter sector, onboarding triggers and first visible station marker.

Acceptance: Main route teaches batch processing and useful first upgrade without long exposition.

Check: Fresh-save novice run on both input types.

Requirements: PRD-002, PRD-004–007, PRD-013.

Status: Planned

### MSC-063 — Build rover berm sector

Depends on: MSC-062

Output: Medium chassis/carts, route loops and authored scrap clusters.

Acceptance: Mechanic/spatial change from opening; required parts recoverable solo.

Check: Solo and four-player route/invariant tests.

Requirements: PRD-005, PRD-013–014.

Status: Planned

### MSC-064 — Build solar terraces sector

Depends on: MSC-063

Output: Panel/cable encounters and distinctive pale/teal visual kit.

Acceptance: Non-ferrous tools solve real problems; compatibility remains clear.

Check: Material-recognition and hauling playtest.

Requirements: PRD-006, PRD-009, PRD-013.

Status: Planned

### MSC-065 — Build fabrication ridge sector

Depends on: MSC-064

Output: Large housings, designed cuts and gantry routes.

Acceptance: Cutting adds decisions, not just more hit points; no hazardous survival gate.

Check: Complete representative assemblies in varied valid order.

Requirements: PRD-008–009, PRD-013–014.

Status: Planned

### MSC-066 — Build station crown excavation sector

Depends on: MSC-065

Output: Safe layered reveal with persistent cleared paths.

Acceptance: Station exposure is visible from return viewpoints; no mandatory platforming precision.

Check: Before/after review and dropped-object recovery tests.

Requirements: PRD-001, PRD-008, PRD-013.

Status: Planned

### MSC-067 — Build station service ring sector

Depends on: MSC-066

Output: Integrated material routes and interior/exterior station circulation.

Acceptance: New spatial operation rather than reskinned pile; all remaining assemblies accessible.

Check: Inspect access graph after alternative legal cuts/upgrades.

Requirements: PRD-001, PRD-004, PRD-013–014.

Status: Planned

### MSC-068 — Author concise colony story delivery

Depends on: MSC-067

Output: Notices, environmental changes and localizable narrative strings.

Acceptance: Recycling supports colony survival narratively; no hunger/oxygen countdown introduced.

Check: Read-through plus mute/subtitle and late-join context checks.

Requirements: PRD-004, PRD-013, PRD-022.

Status: Planned

### MSC-069 — Integrate campaign transitions and player-count rules

Depends on: MSC-068

Output: Versioned objective state graph and scaling policy.

Acceptance: Joining/leaving never farms rewards or removes content; quota policy understandable.

Check: Switch one-to-four players at each milestone and reload.

Requirements: PRD-013–014, PRD-019–021.

Status: Planned

### MSC-070 — Review sector variety and pacing budget

Depends on: MSC-069

Output: T4-preparation content review and observed route timings.

Acceptance: Group allocations remain hypotheses until full novice tests; optional tasks excluded.

Check: Owner compares seven beats, useful variation and provisional 390-minute allocation.

Requirements: PRD-001–004, PRD-013–015.

Status: Planned

## Phase 8 — Station finale and complete content assembly

### MSC-071 — Specify finale dismantling dependency graph

Depends on: MSC-070

Output: Authored station stages, safe supports and remaining-object access map.

Acceptance: No surprise flight/combat/timer; final stage uses learned systems.

Check: Tabletop cut/transport/sale orders and solo accessibility.

Requirements: PRD-004, PRD-008, PRD-013–014.

Status: Planned

### MSC-072 — Build station identification and access stage

Depends on: MSC-071

Output: Reveal plaque, entry work and first finale checkpoint.

Acceptance: Late join understands current stage; cleared routes remain valid.

Check: Load checkpoint as solo host and new guest.

Requirements: PRD-001, PRD-004, PRD-020–021.

Status: Planned

### MSC-073 — Build outer utility removal stage

Depends on: MSC-072

Output: Assemblies, material yields and safe work terraces.

Acceptance: All outputs accounted for once; no cut hides required remaining work.

Check: Alternative sequence and fragment-recovery tests.

Requirements: PRD-005–008, PRD-019.

Status: Planned

### MSC-074 — Build service module separation stage

Depends on: MSC-073

Output: Integrated cutter/cart/collector encounters.

Acceptance: Every activity possible solo without exclusive roles or simultaneous locks.

Check: Solo completion plus four-player concurrent interaction.

Requirements: PRD-003, PRD-008–009, PRD-014.

Status: Planned

### MSC-075 — Build structural panel dismantling stage

Depends on: MSC-074

Output: Controlled authored structure changes and final salvage.

Acceptance: No inaccessible required fragment or broken traversal after valid removal.

Check: Access graph and out-of-bounds recovery checks after each stage.

Requirements: PRD-008, PRD-011, PRD-014.

Status: Planned

### MSC-076 — Build final colony delivery and ending

Depends on: MSC-075

Output: Final processing/sale milestone, completion scene and credits.

Acceptance: Ending cannot require all optional upgrades/collectibles; final payment/idempotency safe.

Check: Complete from economical minimal path and repeat completion messages.

Requirements: PRD-004, PRD-007, PRD-010–011, PRD-019.

Status: Planned

### MSC-077 — Produce remaining approved environment and animation content

Depends on: MSC-076

Output: Final-style sectors/station/robot reaction assets with manifests.

Acceptance: Shared art language, no silhouette-exploration drift; all content meets calibrated budgets.

Check: Two-view/source/export review and in-scene comparison.

Requirements: PRD-001–003, PRD-022.

Status: Planned

### MSC-078 — Produce remaining approved music and SFX

Depends on: MSC-077

Output: Reviewed score/ambience/material/tool/UI catalog.

Acceptance: Human-auditioned, original provenance, no copied melodies or unlicensed samples.

Check: Batch technical checks then gameplay mix/loop/fatigue audition.

Requirements: PRD-002, PRD-022.

Status: Planned

### MSC-079 — Integrate full campaign save checkpoints

Depends on: MSC-078

Output: Durable checkpoints and tested restoration across all stages.

Acceptance: Consumed scrap never reappears; stage/structure state stays consistent.

Check: Save/reload at each milestone, partial bale and cut transaction boundary.

Requirements: PRD-004, PRD-019–021.

Status: Planned

### MSC-080 — Review complete main-route content lock candidate

Depends on: MSC-079

Output: Full-game alpha scope and remaining issues register.

Acceptance: Beginning-to-ending exists with no placeholder-critical gaps; quality/time not falsely declared achieved.

Check: Owner solo/co-op guided full-route review.

Requirements: PRD-001–022.

Status: Planned

## Phase 9 — Final UI, input, comfort and localization readiness

### MSC-081 — Implement final title and campaign/session menus

Depends on: MSC-080

Output: Martian Scrap Co. branding, continue/new/host/join/settings flows.

Acceptance: No Working Title branding; save ownership and separate guest campaigns explicit. Join/session menu states reflect actual native availability and host-save ownership, not source screenshots or public-browser assumptions.

Check: Fresh/returning host and guest menu walkthrough. Test open/closed-game invites and recoverable blocked states; report source adaptations.

Requirements: PRD-016–017, PRD-021–022.

Context: [Co-op guide](../references/online-coop.txt) §§2.5, 7; PRD §§6, 10.

Status: Planned

### MSC-082 — Complete store and shared-spending UI

Depends on: MSC-081

Output: Upgrade categories, before/after effects and purchase permissions.

Acceptance: Mock prices/slots replaced intentionally; expensive confirmation always reachable.

Check: Host/guest permission, insufficient funds and concurrent request checks.

Requirements: PRD-009–011, PRD-018–019, PRD-022.

Status: Planned

### MSC-083 — Complete HUD, material cues and crew status

Depends on: MSC-082

Output: Sparse responsive HUD with localizable text/icon vocabulary.

Acceptance: Approved palette and focus states preserved; no color-only material identification. CONDITIONAL voice UI/input subunit only after V0/V1: add truthful enable/permission, mute/PTT and status/remap behavior; no always-on/default binding inferred and no fake available mic.

Check: Inspect each sector/light condition and muted-audio run. When authorized, test permission denied, service unavailable, mute/PTT/remap and expired speaker indicators; otherwise record voice subwork deferred.

Requirements: PRD-006–007, PRD-022.

Context: [Steam Voice guide](../references/steam-voice-steps.md) §§5, 9–10; visual §9 and architecture §11.

Status: Planned

### MSC-084 — Complete keyboard/mouse remapping and comfort

Depends on: MSC-083

Output: Action remaps, sensitivity/inversion and motion controls.

Acceptance: No required action stranded by remap; reset path remains available. CONDITIONAL voice UI/input subunit only after V0/V1: add truthful enable/permission, mute/PTT and status/remap behavior; no always-on/default binding inferred and no fake available mic.

Check: Conflict, restore-default and minimal-motion full loop. When authorized, test permission denied, service unavailable, mute/PTT/remap and expired speaker indicators; otherwise record voice subwork deferred.

Requirements: PRD-022.

Context: [Steam Voice guide](../references/steam-voice-steps.md) §§5, 9–10; visual §9 and architecture §11.

Status: Planned

### MSC-085 — Complete controller focus and action routing

Depends on: MSC-084

Output: Controller navigation, contextual prompts and safe remap flow.

Acceptance: No mouse-required purchase/filter/error/dialog; explicit focus/back survives screen transitions. CONDITIONAL voice UI/input subunit only after V0/V1: add truthful enable/permission, mute/PTT and status/remap behavior; no always-on/default binding inferred and no fake available mic.

Check: Controller-only end-to-end route including errors and pause. When authorized, test permission denied, service unavailable, mute/PTT/remap and expired speaker indicators; otherwise record voice subwork deferred.

Requirements: PRD-022.

Context: [Steam Voice guide](../references/steam-voice-steps.md) §§5, 9–10; visual §9 and architecture §11.

Status: Planned

### MSC-086 — Validate handheld layout and text input

Depends on: MSC-085

Output: Deck-sized layouts, glyph policy and on-screen text entry path.

Acceptance: Actual handheld readable; all required text entry possible without physical keyboard. Source controller/Deck workaround claims require actual validation; conditional mic controls are usable only if V0/V1-approved voice exists.

Check: Real Deck screenshot/interaction review, not desktop zoom inference. Real Deck input/text/focus plus authorized mic-permission/PTT/mute paths; no inherited source checkmarks.

Requirements: PRD-017, PRD-022.

Context: [Co-op guide](../references/online-coop.txt) §§7–8; [Steam Voice guide](../references/steam-voice-steps.md) §§9, 12; visual §9 and architecture §11.

Status: Planned

### MSC-087 — Complete localization-ready content system

Depends on: MSC-086

Output: String catalog, plural/number formatting and pseudo-localization pass.

Acceptance: No final launch-language list inferred; panels tolerate expansion and dynamic values.

Check: Pseudo-locale/controller traversal of every menu and narrative view.

Requirements: PRD-022.

Status: Planned

### MSC-088 — Complete audio accessibility and conditional voice service

Depends on: MSC-087

Output: Separate buses, subtitles/meaningful visual feedback and persistent local settings; V0/V1-approved voice service only if authorized, otherwise an explicit deferred-scope record.

Acceptance: Muted game remains understandable; device-specific settings do not blindly sync. CONDITIONAL voice service subunit only after V0 approval and V1 proof in MSC-025–027: separate capture/transport/codec/per-speaker playback; explicit enable/permission, mute/PTT/status, bounded lobby-authenticated delivery, no recording by default and no voice requirement for campaign completion.

Check: Mute/low-volume and settings reset/save tests. If authorized, implement/test real mic unavailable/denied states, full-block decode/rate handling, stop/drain/discard, per-speaker queues and real two-way playback; do not substitute SFX WAV encoding or injected PCM for end-to-end evidence.

Requirements: PRD-021–022.

Context: [Steam Voice guide](../references/steam-voice-steps.md) §§1–12; PRD §10 and architecture §11 V0/V1.

Status: Planned

### MSC-089 — Review pause, focus loss and session messaging

Depends on: MSC-088

Output: Solo pause, co-op continuing-world notices and error/reconnect copy.

Acceptance: Pause policy clear; overlay/focus does not silently strand sessions. Conditional voice follows approved focus/pause/menu transmission policy and revokes on leave; no stale mic/speaker state or silent capture.

Check: Alt-tab/overlay/controller disconnect and timeout scenarios. When authorized, test focus loss, overlay, permission revocation, PTT release tail, disconnect and suspend; otherwise record voice subwork deferred.

Requirements: PRD-017, PRD-020, PRD-022.

Context: [Co-op guide](../references/online-coop.txt) §§2.5, 7–8; [Steam Voice guide](../references/steam-voice-steps.md) §§5–6, 10, 12; architecture §11.

Status: Planned

### MSC-090 — Approve usability and accessibility baseline

Depends on: MSC-089

Output: Issue dispositions and accepted controller/handheld limitations.

Acceptance: No Deck Verified/accessibility certification claims; blocking navigation/readability issues unresolved means fail.

Check: Owner reviews observed controller/Deck evidence and remaining risks.

Requirements: PRD-022.

Status: Planned

## Phase 10 — Persistence hardening, online lifecycle and optional scope

### MSC-091 — Harden save schemas and migrations

Depends on: MSC-090

Output: Migration chain, unsupported-version behavior and corruption fixtures.

Acceptance: Newer unknown save never overwritten; prior valid backups recover safely. Host-only campaign and explicit divergent-Cloud conflict policy override source localStorage/timestamp-only assumptions; do not import personal stats as campaign carryover.

Check: Migrate every retained fixture; corrupt/truncate/invalid-ID negative tests. Compare source lessons with atomic-save, recovery and conflict fixtures; report policy deviations explicitly.

Requirements: PRD-019–021.

Context: [Co-op guide](../references/online-coop.txt) §§2.1, 4, 6, 8.5; PRD §10 and architecture §§7, 11.

Status: Planned

### MSC-092 — Test disk failures and crash boundaries

Depends on: MSC-091

Output: Atomic write/replacement strategy and durable transaction recovery.

Acceptance: No credited-and-resellable output; full disk/write denial surfaced without data destruction. Host-only campaign and explicit divergent-Cloud conflict policy override source localStorage/timestamp-only assumptions; do not import personal stats as campaign carryover.

Check: Inject failure before/after each critical persistence operation. Compare source lessons with atomic-save, recovery and conflict fixtures; report policy deviations explicitly.

Requirements: PRD-007, PRD-019–021.

Context: [Co-op guide](../references/online-coop.txt) §§2.1, 4, 6, 8.5; PRD §10 and architecture §§7, 11.

Status: Planned

### MSC-093 — Implement approved Steam Cloud policy

Depends on: MSC-092

Output: Conditional cloud adapter, conflict UI and allowlist.

Acceptance: Owner-approved policy only; divergent worlds preserved before replacement; hardware settings local. Host-only campaign and explicit divergent-Cloud conflict policy override source localStorage/timestamp-only assumptions; do not import personal stats as campaign carryover.

Check: Two-device offline divergence, deletion/quota/upload interruption tests. Compare source lessons with atomic-save, recovery and conflict fixtures; report policy deviations explicitly.

Requirements: PRD-021–022.

Context: [Co-op guide](../references/online-coop.txt) §§2.1, 4, 6, 8.5; PRD §10 and architecture §§7, 11.

Status: Planned

### MSC-094 — Harden host/guest leave and reconnect lifecycle

Depends on: MSC-093

Output: Stale claim cleanup, snapshot catch-up and session shutdown.

Acceptance: Host world remains host-owned; no portable campaign or implicit migration. Conditional voice cleanup revokes transmission, drains/discards per policy, clears queues/indicators and invalidates old connection generations; it never authorizes host migration.

Check: Disconnect while holding, cutting, selling, purchasing and receiving snapshot. Repeated teardown/rejoin while transmitting proves no residual audio, open mic or resource growth if voice authorized.

Requirements: PRD-016–021.

Context: [Co-op guide](../references/online-coop.txt) §§2.4–2.5, 8.5; [Steam Voice guide](../references/steam-voice-steps.md) §§4, 6, 10; architecture §11.

Status: Planned

### MSC-095 — Harden untrusted network and lobby input

Depends on: MSC-094

Output: Rate/size/schema/membership limits and safe version refusal.

Acceptance: Malformed/foreign/stale traffic cannot mutate world or exhaust unbounded buffers. Conditional voice validates verified identity/lobby/session/generation/version/length/sequence before decode; cap host-relay aggregate and queues without blocking reliable gameplay.

Check: Fault/fuzz fixtures plus real-lobby rejection checks. When authorized, reject foreign/stale/oversize/malformed voice and invalid fragments, including replay after rejoin; no live conversations saved as fixtures.

Requirements: PRD-017–020.

Context: [Co-op guide](../references/online-coop.txt) §§2.2–2.4; [Steam Voice guide](../references/steam-voice-steps.md) §§4, 7–8; architecture §11.

Status: Planned

### MSC-096 — Complete approved lobby and invite experience

Depends on: MSC-095

Output: Private/friends policy, occupancy, invite routing and host controls.

Acceptance: Closed/open-game join reliable; no unapproved public browser/Discord feature creep. App IDs, source fork/settings, public discovery, leaderboard/Discord scope and account mutations are not transferred.

Check: Full Steam account/device scenario matrix. Report Context used/Deviations and verify only owner-approved new-game configuration/policy.

Requirements: PRD-017–020.

Context: [Co-op guide](../references/online-coop.txt) §§2–4, 6–8; architecture §11.

Status: Planned

### MSC-097 — Implement personal Steam achievements only if approved

Depends on: MSC-096

Output: Approved event definitions/idempotent unlocks or explicit launch omission.

Acceptance: No guest campaign carryover; host does not award guest progress indiscriminately. App IDs, source fork/settings, public discovery, leaderboard/Discord scope and account mutations are not transferred.

Check: Repeat/reconnect event tests and authorized Steam testing when policy permits. Report Context used/Deviations and verify only owner-approved new-game configuration/policy.

Requirements: PRD-016, PRD-019–021.

Context: [Co-op guide](../references/online-coop.txt) §§2–4, 6–8; architecture §11.

Status: Planned

### MSC-098 — Implement approved optional discoveries

Depends on: MSC-097

Output: Clearly optional collectibles/environmental jokes or recorded omission.

Acceptance: No required tool/story/ending gated by collectible completion.

Check: Complete campaign while ignoring all optional markers.

Requirements: PRD-004, PRD-015.

Status: Planned

### MSC-099 — Implement approved postgame cleanup

Depends on: MSC-098

Output: Same-save residual work/convenience continuation or explicit scoped omission.

Acceptance: Ending remains complete; optional work excluded from six-hour target; no endless-world assumption.

Check: Load completed save, continue work and reload without replaying finale reward.

Requirements: PRD-004, PRD-015, PRD-021.

Status: Planned

### MSC-100 — Review feature scope and persistence readiness

Depends on: MSC-099

Output: Feature-complete candidate and explicit deferred/non-goal list.

Acceptance: All approved requirements have evidence owner; optional omissions transparent. Record any separately approved/deferred demo and measurement scope explicitly; no inherited demo app, dashboard/service or marketing promise.

Check: Trace PRD IDs to tests/content and review unresolved defects. Review approved-scope list against source adaptations and zero-spend constraint; no missing marketing data fabricates a feature requirement.

Requirements: PRD-001–022.

Context: [Marketing reference](../references/marketing.txt) data/demo/limits sections; PRD §11, visual §10 and architecture §12.

Status: Planned

## Phase 11 — Optimization, complete playtests and real-device QA

### MSC-101 — Profile representative full-game worst cases

Depends on: MSC-100

Output: Windows/Deck frame-time, physics, memory, bandwidth and snapshot report.

Acceptance: Identified hardware/build/scene; no average-FPS-only signoff or arbitrary object-count guarantee.

Check: Repeat dense active yard, station interior/finale and four-player join scenarios.

Requirements: PRD-001, PRD-019–022.

Status: Planned

### MSC-102 — Apply measured rendering and simulation optimization

Depends on: MSC-101

Output: Bounded changes to instancing/culling/activation/pooling/quality settings.

Acceptance: Gameplay/material cues and conservation unchanged; budgets improve in recorded scene.

Check: Before/after benchmark plus domain/save/network regressions.

Requirements: PRD-005–008, PRD-019–022.

Status: Planned

### MSC-103 — Optimize audio and replication load

Depends on: MSC-102

Output: SFX/music playback-source caps, interest updates and bounded snapshots; conditional voice-chat budgets only if approved.

Acceptance: Important feedback/events retained; no dropped reliable economy state. Separate SFX/music playback-source caps from conditional voice-chat budgets; measure multi-speaker relay, decode/copies/queues against gameplay load if approved.

Check: Four-player overlapping activity with loss/latency and audio audition. Authorized voice tests measure actual latency/cuts/memory/bandwidth/frame cost with four players; source polling/jitter/rate examples are not guarantees.

Requirements: PRD-002, PRD-019–022.

Context: [Co-op guide](../references/online-coop.txt) §§2, 8; [Steam Voice guide](../references/steam-voice-steps.md) §§7–8, 12; architecture §11.

Status: Planned

### MSC-104 — Run first-time four-player campaign pacing tests

Depends on: MSC-103

Output: Recorded main-route elapsed times, novelty/idle/confusion observations.

Acceptance: Minimum six-hour target evaluated excluding optional content; no claim from solo time or person-hours.

Check: Use agreed novice protocol, record breaks separately and flag coaching.

Requirements: PRD-013.

Status: Planned

### MSC-105 — Run independent full solo completion tests

Depends on: MSC-104

Output: Solo route, accessibility and progression evidence.

Acceptance: Same core content/finale completable with no multiplayer-only lock.

Check: Complete using realistic legal upgrade paths and controller option.

Requirements: PRD-003–004, PRD-011, PRD-014.

Status: Planned

### MSC-106 — Revise pacing and solvency from evidence

Depends on: MSC-105

Output: Meaningful route/content/upgrade tuning and rerun evidence.

Acceptance: No mandatory waiting/grind added to hit six hours; finite-world no-softlock proof refreshed.

Check: Compare prior observations; rerun affected campaign routes and economy solver.

Requirements: PRD-010–014.

Status: Planned

### MSC-107 — Run full Windows native/controller/network matrix

Depends on: MSC-106

Output: Clean Steam install, invitations, four-player load, updates and offline solo evidence.

Acceptance: Required PC/input/co-op behaviors pass on agreed hardware; failures remain explicit. Conditional voice QA covers real mic/speaker devices, denied/absent/changing input, max speakers, loss/duplicates/rejoin/focus/suspend and packaged platforms, not source checkmarks.

Check: Real accounts/devices across networks plus controller-only run. If voice authorized, run real two-way and four-player/Deck mic/privacy/cleanup evidence; injection-only tests or inherited platform flags cannot pass it.

Requirements: PRD-016–022.

Context: [Co-op guide](../references/online-coop.txt) §§7–10; [Steam Voice guide](../references/steam-voice-steps.md) §12; architecture §11.

Status: Planned

### MSC-108 — Run full real Deck and Proton matrix

Depends on: MSC-107

Output: Game/desktop-mode evidence, controls/text, performance, cloud and suspend/rejoin.

Acceptance: No untested compatibility assertion; missing device evidence blocks goal signoff. Conditional voice QA covers real mic/speaker devices, denied/absent/changing input, max speakers, loss/duplicates/rejoin/focus/suspend and packaged platforms, not source checkmarks.

Check: Record exact tested runtime/build and end-to-end handheld scenarios. If voice authorized, run real two-way and four-player/Deck mic/privacy/cleanup evidence; injection-only tests or inherited platform flags cannot pass it.

Requirements: PRD-020–022.

Context: [Co-op guide](../references/online-coop.txt) §§7–10; [Steam Voice guide](../references/steam-voice-steps.md) §12; architecture §11.

Status: Planned

### MSC-109 — Run soak, recovery and content-completeness QA

Depends on: MSC-108

Output: Long-session/save-growth/leak checks and complete issue inventory.

Acceptance: No severe data-loss, duplication or progression blocker; residual known issues triaged. Conditional voice QA covers real mic/speaker devices, denied/absent/changing input, max speakers, loss/duplicates/rejoin/focus/suspend and packaged platforms, not source checkmarks.

Check: Repeated sessions, leave/rejoin cycles, save/migration and full-route regression. If voice authorized, run real two-way and four-player/Deck mic/privacy/cleanup evidence; injection-only tests or inherited platform flags cannot pass it.

Requirements: PRD-004, PRD-011, PRD-019–022.

Context: [Co-op guide](../references/online-coop.txt) §§7–10; [Steam Voice guide](../references/steam-voice-steps.md) §12; architecture §11.

Status: Planned

### MSC-110 — Approve campaign and release-candidate gates

Depends on: MSC-109

Output: T4/T5 evidence review and owner decision.

Acceptance: Six-hour four-newcomer and solo evidence present; performance/handheld claims bounded to tests. Marketing metrics cannot certify six-hour/co-op/Deck quality or replace observed release evidence; unavailable metrics do not become fabricated results.

Check: Read requirement evidence matrix and disposition every blocking finding. Separate measured quality gates from optional marketing observations and any approved-demo funnel; report confounds and unknowns.

Requirements: PRD-001–022.

Context: [Marketing reference](../references/marketing.txt) interpretation/noise/demo limitations; PRD §11, visual §10 and architecture §12.

Status: Planned

## Phase 12 — Packaging, truthful store preparation and release handoff

### MSC-111 — Audit adopted dependencies and asset provenance

Depends on: MSC-110

Output: Revision-specific licenses/notices/native SDK and original-asset manifest.

Acceptance: No unlicensed content, private reference IDs or unintended FFmpeg/runtime redistribution.

Check: Inspect exact package contents against source/license manifest.

Requirements: PRD-001, PRD-021–022.

Status: Planned

### MSC-112 — Audit packaged security and offline behavior

Depends on: MSC-111

Output: Release security readback and startup/offline diagnostics.

Acceptance: Sandbox/bridge/CSP policies intact; no dev server, secret, generic shell/file API or silent native failure. If voice authorized, packaged IPC is bounded, native capture permission enforced, unavailable/denied service honest and teardown idempotent; no mic recording by default.

Check: Inspect package, run malformed IPC probes and Steam-unavailable solo launch. Inspect native revision/binaries and exercise unavailable mic/Steam and renderer-loss capture revocation without recording people.

Requirements: PRD-016–022.

Context: [Co-op guide](../references/online-coop.txt) §3; [Steam Voice guide](../references/steam-voice-steps.md) §§3, 5, 10, 12; architecture §11.

Status: Planned

### MSC-113 — Produce reproducible candidate package

Depends on: MSC-112

Output: Versioned Windows artifact, hashes and build instructions.

Acceptance: One packaging pipeline; native libraries/load paths verified on clean system. Verify authorized voice dependencies only if approved; candidate is the identified real packaged build used by later capture, not a dev mock.

Check: Independent clean rebuild/install/startup and content allowlist comparison. Record build/hash/runtime/capture-relevant settings; clean Steam launch and native/mic availability are observed, never inferred from source.

Requirements: PRD-021–022.

Context: [Co-op guide](../references/online-coop.txt) §3; [Steam Voice guide](../references/steam-voice-steps.md) §§3, 12; [Capture guide](../references/TRAILER_CAPTURE_INSTRUCTIONS.md) format/review guidance; architecture §11.

Status: Planned

### MSC-114 — Validate update, uninstall and recovery policy

Depends on: MSC-113

Output: Upgrade/save preservation, backup/export guidance and rollback boundaries.

Acceptance: Updates do not wipe world; unsupported schema recovery clear; no destructive uninstall surprise. Host-only campaign and explicit divergent-Cloud conflict policy override source localStorage/timestamp-only assumptions; do not import personal stats as campaign carryover.

Check: Install previous fixture then update, recover and inspect retained saves. Compare source lessons with atomic-save, recovery and conflict fixtures; report policy deviations explicitly.

Requirements: PRD-021.

Context: [Co-op guide](../references/online-coop.txt) §§2.1, 4, 6, 8.5; PRD §10 and architecture §§7, 11.

Status: Planned

### MSC-115 — Prepare actual gameplay capture assets

Depends on: MSC-114

Output: Runtime screenshots/trailer/capsule production brief and approvals.

Acceptance: Concepts not misrepresented as screenshots; approved brand/art and real co-op represented truthfully. Use actual implemented gameplay; obtain separate user authorization for bounded HUD/camera/input capture helpers and recording; do not import HeadArrow branding, fixed clip quotas or settings. Exclude local/remote human voice unless separately consented and permissioned. Prepare owner-reviewed capsule/asset variants and dated revision/action notes only if requested; retain approved art/UI and no concept-as-gameplay claims, without publication or paid campaigns.

Check: Owner reviews captures against shipped candidate and provenance. Review every real clip for continuous action/result, smooth camera, actual native resolution/FPS/audio/HUD, build and useful ranges; document selection priority and validate any requested archive rather than invent files. Associate actual build/asset revision with proposed comparison windows; source CTR thresholds/results are hypotheses, not success criteria; use existing capture guide for footage.

Requirements: PRD-001–004, PRD-016, PRD-022.

Context: [Capture guide](../references/TRAILER_CAPTURE_INSTRUCTIONS.md) full guide; [Co-op guide](../references/online-coop.txt) §2 for real crew staging; visual §9 and architecture §11. [Marketing reference](../references/marketing.txt) capsule CTR/action log/attribution limits; PRD §11, visual §10 and architecture §12.

Status: Planned

### MSC-116 — Prepare store copy and platform disclosures

Depends on: MSC-115

Output: Draft description, supported inputs/languages, hardware evidence and required disclosures.

Acceptance: No Deck Verified, sales-success, six-hour achieved or compatibility claim without supporting evidence. Footage/disclosures match approved implemented features; no voice claim if deferred/unproven, no concepts presented as runtime and no unconsented human voice. Store-copy/visibility iteration uses truthful feature evidence and qualified observations, not promised wishlists/conversion/sales or inferred target-audience approval; price remains deferred until full game is developed.

Check: Compare every store claim to T4/T5 records; review current Steam requirements. Compare clip manifest/build/settings and all feature/platform claims to evidence; note conversions/staging/limitations and owner permissions. Audit any metric/cause/audience assertion against source/window/sample/partial status and genuine evidence; separate correlation from causation and retain capture/voice consent rules.

Requirements: PRD-013, PRD-022.

Context: [Capture guide](../references/TRAILER_CAPTURE_INSTRUCTIONS.md) objective/format/selection guidance; [Steam Voice guide](../references/steam-voice-steps.md) only for authorized voice claims; PRD §10, visual §9 and architecture §11. [Marketing reference](../references/marketing.txt) interpretation/UTM/noise/case-study boundaries; PRD §11, visual §10 and architecture §12.

Status: Planned

### MSC-117 — Decide final price after full-game development

Depends on: MSC-116

Output: Owner price decision with full-game quality/scope context.

Acceptance: EUR 5 treated only as symbolic earlier reference; no invented revenue/discount forecast.

Check: Owner explicitly approves price after inspecting complete release candidate.

Requirements: PRD-004, PRD-013.

Status: Planned

### MSC-118 — Review Steam configuration and release checklist

Depends on: MSC-117

Output: Prepared app/depot/controller/cloud/achievement checklist using legitimate new-game IDs.

Acceptance: No reference app ID or unapproved account mutation; signing/disclosure/access blockers explicit. App IDs, source fork/settings, public discovery, leaderboard/Discord scope and account mutations are not transferred. Any requested reporting access uses legitimate new-game identity and separately authorized current supported/permitted routes; source IDs/cookie paths/API claims/services are not adopted.

Check: Owner compares prepared settings with current official Steam documentation. Report Context used/Deviations and verify only owner-approved new-game configuration/policy. Verify current primary documentation/permissions and source formats before integration; do not read credentials or fetch live partner data merely to follow this plan.

Requirements: PRD-016–022.

Context: [Co-op guide](../references/online-coop.txt) §§2–4, 6–8; architecture §11. [Marketing reference](../references/marketing.txt) data sources/session-expiry/pitfalls; PRD §11 and architecture §12.

Status: Planned

### MSC-119 — Perform authorized beta and final release rehearsal

Depends on: MSC-118

Output: Conditional owner-authorized upload/install review and final go/no-go record.

Acceptance: Upload/account changes occur only with separate explicit authorization; otherwise remain blocked/prepared. Release rehearsal rechecks actual Steam-installed footage/features after separate authorization; guide upload/capture/archive commands grant no execution authority. Prepare optional owner-approved launch/demo measurement notes without outbound publication, contacts, ticket replies or recurring services; no source dates, prices or growth guarantees imported.

Check: Steam-installed candidate acceptance matrix and owner review of known issues. Compare candidate hash and footage claim/version; confirm recording/voice consents and preserve truthful unavailable outcomes. Where separately authorized data exists, distinguish genuine zero, partial day and unread/expired-login states; correlate dated actions cautiously and retain no secrets.

Requirements: PRD-001–022.

Context: [Co-op guide](../references/online-coop.txt) §10; [Capture guide](../references/TRAILER_CAPTURE_INSTRUCTIONS.md) format/review guidance; architecture §11. [Marketing reference](../references/marketing.txt) daily snapshots/actions/demo/automatic-outbound restrictions; PRD §11, visual §10 and architecture §12.

Status: Planned

### MSC-120 — Hand off complete game and bounded support plan

Depends on: MSC-119

Output: Owner-approved release handoff, evidence archive and post-release triage procedure.

Acceptance: Publication separately authorized; no promise all future bugs are known or solved; no extra service spend. Optional zero-extra-cost measurement/support handoff is read-only/manual or uses existing authorized tools, not a new dashboard mandate; unknown metrics stay unknown and no conversion/revenue promise or outbound action.

Check: Final checklist traces approved scope, candidate hash, test evidence and recovery instructions. Document source/time-window/partial status, action/asset history, UTM/attribution limits and any approved-demo/ticket segmentation; provide owner review boundaries without contacting anyone.

Requirements: PRD-001–022.

Context: [Marketing reference](../references/marketing.txt) snapshot/calculations/pitfalls/no-automatic-outbound sections; PRD §11, visual §10 and architecture §12.

Status: Planned

## Execution handoff

Start only after explicit implementation authorization. At each gate, present the measured result, unresolved risks and proposed changes; approval of this document alone does not approve every untested design choice. Future defects become new bounded work units with a reproducible failure and regression check. Do not pretend this first pass exhausts all testing or production iteration.

The six-hour campaign target is specifically **elapsed main-campaign time for four first-time players**, excluding optional discoveries, side missions and extra upgrades. Solo is independently fully completable. No artificial timers, waiting or mandatory grind may be introduced to satisfy duration. Final commercial price remains deferred until the full game is developed.

