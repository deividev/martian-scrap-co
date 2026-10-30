# Martian Scrap Co. — Technical Stack and Architecture

**Version:** 1.2 · **Date:** 2026-10-29 · **State:** marketing-context alignment of recommendations; no new product approval, project or integration implemented.

**Decision:** build from an empty project with **Three.js + Electron**, as approved. Everything else here is a **Proposed** implementation choice or **Validation required** gate unless explicitly identified as an approved product constraint. Prove native Steam co-op, secure packaging and representative physics early; do not produce the full asset catalog before those gates.

**Related:** [Product requirements](01-product-requirements.md) · [Visual direction and existing images](02-visual-art-direction.md) · [Sequential work plan](04-phased-agent-task-plan.md).

## 1. Recommended stack, with adoption gates

Three.js is a renderer/3D library, **not a complete game engine**; input, physics, persistence, gameplay and networking need explicit owners. Do not reimplement a physics solver or build a general-purpose engine before the game. [Three.js game manual](https://threejs.org/manual/pages/game.html).

| Layer | Proposed choice | Reason and gate |
|---|---|---|
| Language/build | Strict TypeScript, Vite, lockfile | Shared typed domain/protocol, fast iteration; verify actual packaged paths. [Vite guide](https://vite.dev/guide/). |
| Rendering | Three.js, initially WebGLRenderer | Approved library; keep render adapters separate from state. WebGPU is not a launch dependency. |
| Physics | Rapier JS/WASM candidate | Mature rigid bodies, queries and joints; benchmark async WASM loading and target packaging. [Rapier getting started](https://rapier.rs/docs/user_guides/javascript/getting_started_js/). |
| Desktop | Electron main + narrow preload | Approved runtime; native Steam/save capability stays outside renderer. |
| UI | DOM/CSS with a small view/state layer initially | Reuse layout/accessibility behavior; no approved React/no-React decision. Add framework only for demonstrated complexity. |
| Input | Action abstraction over keyboard, pointer and Gamepad API | One action vocabulary; real Steam Input/controller/Deck testing remains necessary. |
| Networking | Host authority, transport-independent protocol; modern Steam candidate | Avoid dedicated infrastructure and transport-specific gameplay. Native binding feasibility is unresolved. |
| Save validation | Versioned schemas and typed runtime validators | Reject malformed files/network payloads; choose a small maintained free validator after spike. |
| Audio runtime | Native Web Audio playback of exported assets | Runtime mixes/loops pre-rendered files; no paid API or live generative service. |
| Audio authoring | Tone.Offline recipes + validated PCM encoder | Zero-additional-cost candidate; pilot and human audition first. |
| 3D production | Primitive/code generation plus Blender Python/GLB | Bulk repetition is procedural; hero assets gain authored pivots/animation. |
| Tests | Vitest domain/integration; Playwright UI; manual native/device matrix | Electron Playwright support is experimental, not a substitute for Steam tests. |
| Packaging | **electron-builder**, one packaging pipeline | Native files, allowlisted content and repeatable Windows artifacts; no second packager assumed. |

Pin exact library/native SDK versions only after the early compatibility test. Record adopted revision, license obligations, native build inputs and update procedure; no current version strings or blanket legal guarantees are invented here. Review dependency vulnerabilities without adding paid services. Existing AI subscriptions may assist coding/content; no extra tool, asset, API, hosting or subscription spending is authorized.

## 2. Boundaries and planned structure

The following are **planned paths**; they are created by their tasks (`src/presentation/` since MSC-005, `src/platform/` and `electron/` since MSC-006, `src/domain/` and `src/content/` since MSC-009, `src/simulation/physics/` since MSC-011, `src/simulation/scrap/` since MSC-012, `src/input/` and `src/simulation/player/` since MSC-013, `src/simulation/collection/` since MSC-014, `src/simulation/handling/` since MSC-016, `src/simulation/benchmark/` since MSC-019; see each task Outcome):

| Planned area | Responsibility | Forbidden dependency |
|---|---|---|
| `src/domain/` | Materials, inventory, credits, upgrades, transactions, campaign rules | Three.js, Electron, Steam or DOM. |
| `src/simulation/` | Host command handling, physics integration, object lifetime, fixed-step orchestration | UI authority over world state. |
| `src/presentation/` | Three.js views, animation, effects, interpolation | Creating authoritative credits/material. |
| `src/input/`, `src/ui/` | Actions, focus/navigation, localizable views | Direct native filesystem or generic IPC. |
| `src/net/` | Schemas, protocol, transport ports, replication/snapshots | Hard-coded Steam SDK calls in gameplay. |
| `src/content/` | Validated data definitions for tools, materials and sectors | Embedded unversioned economy logic in meshes. |
| `electron/` | Main lifecycle, save service, Steam adapter, preload | Unbounded renderer-requested native operations. |
| `native/steam/` | Conditional bounded native transport extension | Shipping private app IDs or unrelated reference binaries. |
| `tools/`, `tests/`, `assets-source/` | Proven production helpers, test fixtures and editable sources | Treating scratch outputs as approved runtime assets. |

Use composition and explicit service ownership rather than a speculative ECS or plugin framework. A lightweight entity registry with stable IDs is enough until measured needs justify more. Entity data maps to render objects and physics handles through adapters; those handles never become persistent identity. Content definitions separate authored intent from save deltas.

Proposed frame flow: sample actions; queue validated intents; advance authoritative fixed simulation steps with a bounded catch-up policy; emit committed domain events; update replication; interpolate presentation; render. Rate and catch-up limits require profiling. Start host simulation in a renderer-owned runtime behind interfaces; move expensive work to a worker only if evidence justifies serialization/coordination complexity. Electron main owns native I/O, not arbitrary high-frequency game logic. Guests render remote physics rather than independently deciding shared outcomes.

## 3. Dense yard, bounded simulation

The mountain is a visual design, not a promise to simulate millions of screws. Separate decorative aggregate masses, dormant recoverable scrap and active interactables. Activate nearby authored clusters as work exposes them; track their stable identities across activation so saves cannot refill cleared regions. Use simple compound/proxy colliders, sleeping bodies, pooled effects and spatial queries. Cutting uses authored joints/fragments first; arbitrary runtime mesh fracture is outside the proposed scope.

Instancing can reduce draw calls for repeated geometry/material, but it does **not** solve physics cost or networking. Maintain independently measured render, active-body and replication budgets. [InstancedMesh documentation](https://threejs.org/docs/pages/InstancedMesh.html); [Three.js physics integration](https://threejs.org/manual/pages/physics.html).

The benchmark must include four simultaneous collectors/carts, active cutting, blocked compactor output, representative station geometry and a late-join snapshot. Record frame-time percentiles, simulation time, awake bodies, draw calls, memory, bandwidth and snapshot duration, not average FPS alone. **Proposed calibration targets:** 60 FPS at 1080p on an agreed Windows reference PC and stable 30 FPS at 1280×800 on actual Steam Deck. These are targets, not approved minimum specifications or demonstrated results. Identify hardware, quality preset, build hash and worst scene for each result. Calibrate safe asset/body/network budgets from evidence; publish no safe object count before profiling.

## 4. Secure Electron and build lifecycle

Keep `contextIsolation: true`, `nodeIntegration: false` and renderer sandboxing enabled. Expose narrowly typed preload methods; validate sender, payload type, size and allowed values. Deny unexpected navigation/new windows; use a restrictive content-security policy. Never expose generic shell, arbitrary filesystem paths, raw `ipcRenderer` or unrestricted remote code. Official guidance takes precedence over insecure samples; do not copy `--no-sandbox` development snippets into this game's design. [Electron security](https://www.electronjs.org/docs/latest/tutorial/security).

Main owns approved save locations, native Steam handles and app/window lifecycle. Preload transports only bounded requests/events. Renderer depends on one typed platform adapter; browser development uses explicit test adapters rather than pretending a missing native capability succeeded. [Electron process model](https://www.electronjs.org/docs/latest/tutorial/process-model).

Proposed Vite setup uses relative production asset URLs for local packaged loading and a loopback-only `127.0.0.1` development server with a fixed port. Prefer imported asset URLs or a tested resolver; root-absolute `'/assets/...'` references can break when loading packaged local files. Production must not depend on a running development server. Use explicit ESM/CJS boundaries appropriate to adopted tooling, not an accidental package-mode mix. A secure custom application protocol may replace local-file loading if the early spike demonstrates a concrete need.

Native binaries must match Electron/runtime architecture and load from tested unpacked locations. Package only the required distribution files and notices; exclude source art, screenshots, secrets, tests and saves. Do not infer successful native initialization from an executable opening. Inspect a clean packaged launch and report missing Steam capability explicitly. Signing may require a cost or existing credential; neither is assumed available. Surface that as a release decision within the zero-spend constraint, not permission to buy a certificate.

## 5. Steam transport: early feasibility, not a solved dependency

**Observed research boundary:** inspected current-main steamworks.js types/source expose legacy `sendP2PPacket`, read and accept APIs; the inspected files do not expose modern Messages/Sockets transport. This is source inspection, not a guarantee about every fork or future release. Valve marks legacy networking deprecated. [Binding types](https://github.com/ceifa/steamworks.js/blob/main/client.d.ts), [binding networking source](https://github.com/ceifa/steamworks.js/blob/main/src/api/networking.rs), [Valve networking overview](https://partner.steamgames.com/doc/features/multiplayer/networking).

**Proposed candidate:** a bounded Rust/N-API extension around SteamNetworkingMessages, contingent on the binding's supported underlying Steam wrapper; otherwise a minimal SDK addon. Reuse mature binding support for appropriate lobby/native functions where verified. This extension is real engineering and maintenance risk, not “install a package and co-op works.” Recheck adopted revision, SDK access/terms, callback lifecycle, packaging and transport semantics before committing architecture details. No private identifier or binary from Toy Keeper is transferable.

### Gate T1 — mandatory before full content production

1. Confirm legitimate access to the new game's Steam app/testing branch, SDK and two distinct licensed test accounts/devices; availability is not established by this plan.
2. Run the packaged Windows build **launched from Steam**, not just a browser loopback demonstration.
3. Connect two devices on different networks without port forwarding. Exercise reliable and disposable messages, identity/lobby membership checks and transport teardown.
4. Accept invitations with the game open and closed; test late join, leave/rejoin, incompatible versions, host departure and repeated transactions without duplicates.
5. Follow with four-player representative load and real Deck/Proton launch/input/overlay/suspend checks. Capture build/runtime versions and evidence, not inherited flags from another game.

Local test transport is valuable for deterministic development but does not satisfy T1. Failure means **Needs decision** with preserved evidence. It does not authorize dropping confirmed online co-op, adding a paid relay/backend or spending on devices/accounts. If access to test hardware/accounts is unavailable, production remains gated until the owner resolves that dependency. Host exit ending the session is the pragmatic **Proposed** consequence of host-owned saves; no host migration is promised.

## 6. Protocol, authority and transactional gameplay

Use one protocol for local testing and Steam transport. Client messages are intents such as collect, claim, release, unload, compact, sell, cut and purchase. Host validates membership, permissions, object revision, distance/compatibility, funds and prerequisites before changing state. A guest cannot declare earned currency or spawn a trusted item. Reliable events carry mutations; poses are disposable and interpolated. Explicit protocol version/schema negotiation blocks incompatible builds before interaction.

An object claim has one host-granted owner and an expiry/release rule. Disconnect and timeout safely release held objects. IDs include world/session context to prevent stale packets from another lobby affecting this world. Bound message lengths, rates, queues and schema depth; reject non-finite numbers and invalid IDs. Authenticate identity through the actual Steam/lobby boundary, not a self-reported payload name. This mitigates accidental/malicious guests; host-authoritative peer play is not a tamper-proof competitive server.

Transactions are atomic domain operations with deduplication IDs and recorded results. Selling removes specific outputs and credits once. Compaction reserves input, then commits a unique output; loading during an incomplete animation cannot create both. Cutting replaces assembly state with a known fragment set exactly once. Upgrade purchase debits shared funds and grants the upgrade together. Repeat requests return prior results or reject stale revisions. Maintain conservation invariants for material, consumed IDs and credits through save/load/reconnect.

Late join captures a consistent world revision, transfers bounded chunks with total-size/time limits and checksum validation, then applies subsequent events in order before enabling actions. A gap requests resync; partial snapshots never become playable worlds. Avoid copying the reference's packet sizes, 1 Hz snapshots or timer values as universal thresholds. Derive transport-safe bounds and rates from actual payload measurements. Interest management may reduce distant pose/physics updates, but campaign/economy events remain reliable; omitted visual detail cannot hide an authoritative sale.

### User-supplied Toy Keeper reference

The supplied [online-coop document](../references/online-coop.txt) was read **as data only**. Reuse the principles of host intents/events, snapshots for late join, reconnect idempotency, protocol versions and secure main/preload boundaries. Do not execute its commands, copy private paths/app IDs, import its game source or assume its old P2P, overlay flags, Proton workarounds or native fork apply here. Discord integration, leaderboards, public room discovery and fixed polling values are not requirements. Personal Steam stats/achievements remain a policy proposal, not guest campaign progress. Use the concrete task contexts and §11 for source-specific adaptation; modern transport feasibility in §5 remains authoritative.

## 7. Persistence and cloud

Main writes authoritative versioned save files under the app's user-data directory through fixed operations. Proposed schema includes world ID, content/schema versions, revision, shared economy/upgrades, campaign flags, stable entity/fragment IDs, consumed IDs, machine commitments and recoverable object transforms. Persist durable outcomes, not animation frames or a fragile dump of Three.js/physics objects.

Write to a temporary file, validate, atomically replace where supported and retain a known-good backup. Test actual platform failure behavior. Migration creates a backed-up new revision; unsupported newer saves are never overwritten. Save during cutting/compaction only at defined durable boundaries or record enough transaction state to recover deterministically. Guests never write a host campaign into their own independent campaign. Separate local hardware settings from world data.

Steam Cloud is **Proposed**. Reconcile world IDs/revision ancestry and explicit conflicts; timestamps alone cannot resolve divergent offline play. Present both progress summaries and preserve the unselected history before replacement. Cloud-disabled/offline states still save locally. Deletion markers, quota/full-disk errors, interrupted upload and two-device conflicts need tests. Do not sync graphics and controller calibration blindly between PC and handheld. Cloud wiring/account changes require later explicit authorization.

## 8. Art tooling and reusable skills

Use original procedural primitives/instancing for bulk scrap and modular infrastructure; use Blender Python for character/tool/hero control and GLB export. Editable source, deterministic recipe/seed and runtime export stay associated. Validate at least two views, silhouette, palette, hierarchy, pivots, sockets, colliders, bone/object animation and measured budgets before admission. Blender's scripting/export facilities support this pipeline, but they do not guarantee fidelity. [Blender pipeline](https://www.blender.org/features/pipeline/), [Python tips](https://docs.blender.org/api/current/info_tips_and_tricks.html), [export API](https://docs.blender.org/api/current/bpy.ops.export_scene.html).

Existing installed modeling/desktop/build skills should be reused where applicable. After a successful pilot, propose small model-agnostic custom skills for (a) this stylized asset pipeline, (b) procedural audio, and (c) gameplay/co-op work-unit implementation/verification if repeated work demonstrates a need. Each skill needs scoped triggers, inputs/outputs, deterministic helpers, bounded correction and human review. Do not create a giant framework or tie quality promises to a named AI model. No skill files or production tools are created by this planning package.

## 9. Zero-additional-cost music and SFX candidate

Propose original TypeScript composition/synthesis recipes using **Tone.Offline**. Its offline rendering produces an AudioBuffer, **not a WAV file**; add a separately validated PCM WAV encoder with known sample rate, channels, sample format and duration. Fix recipe revision/seed where relevant. Avoid copied melodies, external samples of unclear origin and paid generation APIs. [Tone offline example](https://github.com/Tonejs/Tone.js/blob/dev/examples/offline.html), [Tone license](https://github.com/Tonejs/Tone.js/blob/dev/LICENSE.md).

Pilot one short looping score cue and a small SFX set covering collector, material impacts, press motion, sale and UI focus. Inspect exported metadata through local FFprobe; analyze peak/DC and loudness with local FFmpeg filters where available. Encoder tests include a known waveform, header lengths and stereo channels. Do not normalize every SFX to the same loudness: transients, ambience and UI need intentional relative level. [FFprobe documentation](https://ffmpeg.org/ffprobe.html), [FFmpeg audio filters](https://ffmpeg.org/ffmpeg-filters.html).

Human audition is a hard quality gate: loop seam, clicks, repetition fatigue, tool intelligibility and mix under four-player activity. Approve the pilot before a full catalog; a mathematically valid file can still sound unpleasant. Maintain per-asset origin, recipe/source revision, license/attribution and approval. FFmpeg is a **local production tool**, not an assumed shipped runtime dependency; redistribution obligations depend on the exact build and require review. [FFmpeg legal information](https://ffmpeg.org/legal.html). Professional sound is a target, not a synthesis guarantee.

Runtime audio uses playback-voice caps (simultaneous SFX/music sources, not chat), pooled playback, spatial attenuation and separate master/music/SFX/UI buses. Provide mute/volume and motion-independent feedback. Proposed music changes gently with work/sector progression rather than escalating pressure. **Voice chat is conditional/not yet approved**: load the [Steam Voice context](../references/steam-voice-steps.md) if that implementation is authorized and pass V0/V1 in §11. It is separate from the offline music/SFX WAV pipeline. No licensed soundtrack or cloud music service is assumed launch scope.

## 10. Verification, release and unresolved decisions

[Vitest](https://vitest.dev/guide/) tests domain invariants, save migrations and transactions; integration fixtures exercise simulation and transport faults. [Playwright Electron support](https://playwright.dev/docs/api/class-electron) is experimental: use it for suitable startup/UI checks, supplemented by manual packaged Steam/native tests. Browser automation cannot establish real invitations, native relay behavior, controller comfort or six-hour pacing.

Proposed local CI-equivalent checks are formatting/lint, strict typecheck, domain/protocol/save tests, browser UI smoke, production build and package smoke. Exact script names are future work, not executed commands. Prefer local runners or already-available free capacity; no new paid CI or telemetry backend. Maintain sanitized opt-in test logs and manually recorded playtest observations without collecting unnecessary personal data.

| Gate | Evidence required before continuing |
|---|---|
| T0 — product/tech baseline | Proposed roster, privacy/spending rules, pacing protocol and cost constraint reviewed. |
| T1 — native feasibility | Real Steam packaged two-device different-network path, then representative four-player and Deck evidence. |
| T2 — first vertical slice | Collection → batch sort → compact → sell → buy → save/rejoin, in solo and co-op with controller. |
| T3 — production pilots | In-engine art approval and human-auditioned audio approval; reproducible exports/provenance. |
| T4 — complete campaign | All sectors/finale, economy no-softlock proof, six-hour four-newcomer target and separate solo completion. |
| T5 — release candidate | Real-device performance/input/network/save/cloud matrix, package/license/security audit, known-issue disposition. |

Full launch includes Windows keyboard/mouse and controller; Deck/controller compatibility is a validation goal, not a Verified claim. Proposed first deployment is Windows build through Proton on Deck, conditional on tests; native Linux is not silently added. Access to Deck, multiple accounts/devices and Steam partner permissions is an unresolved evidence dependency.

After the full game is developed, evaluate price using actual quality/scope and owner decision; EUR 5 is not binding. Prepare truthful store copy, actual runtime screenshots/trailer, content disclosures and controller claims; concepts are not runtime evidence. Test clean installation, update preserving saves, offline solo, uninstall behavior and recovery documentation. Publication, branch/account changes, uploads and release require explicit owner authorization. No sales forecast, guaranteed revenue or market-success claim follows from this stack.

## 11. Supplied implementation context and conditional voice

The raw [co-op guide](../references/online-coop.txt), [Steam Voice guide](../references/steam-voice-steps.md) and [capture guide](../references/TRAILER_CAPTURE_INSTRUCTIONS.md) are preserved as supplied, not translated policies or runnable setup. Load the relevant guide in full for authorized associated work. Reports include **Context used** (guide/sections), the adopted native/tool revisions, **Deviations** and evidence. No guide authorizes installs, payments, recording, publication or edits to its source project.

### Conditional voice gates and implementation allocation

**V0 — product/privacy approval, MSC-003 and MSC-010.** Voice is **CONDITIONAL / NOT YET APPROVED**. Record explicit approval or deferral and decide proposed listening/transmission topology, enable/permission defaults, PTT/mute/status policy, menu/focus behavior and permission retention. Always-on, proximity/global routing, a default key/button and exact rates/codecs are not automatically selected. MSC-004 records legitimate mic/device/account access. A deferred decision skips voice-specific subwork explicitly; it neither blocks base co-op nor authorizes a fake chat UI.

**V1 — adopted-native feasibility, MSC-025–027, only after V0 approval.** Reuse the one initialized Steam client/lifecycle, inspect exact SDK/binding exports and build availability, and prove real bidirectional mic capture/receive/playback through a packaged Steam path. Source guidance describes compressed blocks and decoded PCM, but exact format, return states, sample rate, framing and buffer ownership must be verified against the adopted revision. SDK capability is not proof that a third-party fork exports it, native export presence is not a working mic, and injected PCM is not end-to-end evidence. No local fork or extra server is mandated; existing zero-cost constraint and modern networking warning remain intact. Failure blocks voice-dependent work for a decision, not a silent co-op scope reduction.

**Service subwork, MSC-088, only after V0/V1.** Implement distinct capture, transport, decode and per-speaker playback adapters with bounded validated IPC; native capture permission is checked by its owning process, not merely a renderer button. Define stopped/capturing/draining states; on revocation/leave discard pending audio and prevent old generations reaching new sessions. Source polling/jitter values are examples requiring measurement, not copied guarantees. Preserve full compressed blocks; do not treat arbitrary fragments as independent codec frames, label compressed data WAV or reuse the offline music encoder as the live voice protocol. Verify rate/channel/sample interpretation and resampling explicitly.

Proposed safety contract: explicit enable/microphone permission, recoverable absence/denial, mute/PTT plus truthful capture/transmit/receive status; verified sender identity and lobby membership; session/generation/version/length/sequence validation before decode; bounded queues, bytes and packet budgets including host relay aggregate; no recording by default; teardown/rejoin cleanup. Do not persist voice buffers/session generations with campaign saves. Source host-change advice does not authorize host migration here. MSC-083–086/MSC-089 cover controller/mic/status and focus rules; MSC-094–095 cover cleanup/invalid traffic; MSC-103 and MSC-107–109 cover real multi-speaker, adverse-network, device/focus/suspend and four-player/Deck load evidence. MSC-112–113 verify safe packaged availability and dependency inclusion. Latency/memory/bandwidth/frame cost are measured, never inherited from the guide.

### Debug and trailer capture allocation

MSC-019 may prepare bounded, authorized debug-evidence capture; MSC-113 provides the actual packaged candidate. MSC-115 owns a shot plan plus only the camera/HUD/input helpers justified by capture needs, then actual source-footage review when recording is separately authorized. Do not add a general editor/photo mode merely to copy examples. Use a verified build, clean state and smooth camera; hide debug overlays while retaining HUD where mechanics need it. Confirm real co-op/session staging using the co-op guide rather than fabricate teammates/features.

Adapt the capture guide's HeadArrow names, example shot count/durations, encoding preference and archive names. Record actual native resolution/FPS/audio and any conversion; a 1080p/60 preference is not a performance result. Proposed deliverables are useful nonduplicate continuous clips, ordered selection notes/top choices, per-clip build/settings/HUD/audio/useful ranges and a validated archive if requested, not automatic execution of the historical ZIP instructions. Keep game SFX; separate music if feasible. Exclude player mic/received voice by default, including conditional chat. Any human voice needs explicit recording/use permission and consent. Debug capture also respects privacy and contains no credentials/private account data.

MSC-116 checks footage and store claims against implemented/tested features and approved art/UX, including whether voice actually exists; MSC-119 rechecks the Steam-installed candidate after authorized release rehearsal. Reproduce neither source-project debug flags/paths nor overlay/Deck success claims without validation. Missing capture tooling is an honest blocker, not permission to purchase tools or invent video files. See visual §9 and PRD §10 for associated experience/consent criteria.

## 12. Marketing measurement context: no automatic service adoption

Read the raw [marketing reference](../references/marketing.txt) for authorized Steam measurement, capsule/store iteration, optional-demo visibility planning and launch/support measurement. It is a historical HeadArrow/Winky reporting-integration brief, not a requirement to build that panel or part of the game's runtime architecture. It discusses wishlist/traffic/action evidence, UTM limits, demo funnels, news/video observations and tickets, **not** a validated target-audience or positioning brief. Keep Context used/Deviations in reports and cross-check PRD §11, visual §10 and the [capture guide](../references/TRAILER_CAPTURE_INSTRUCTIONS.md) for actual footage.

**Plan early, execute only when separately authorized.** MSC-010 defines questions, evidence ownership, legitimate access and a zero-extra-cost/manual reporting option. MSC-040 reviews a potential demo/visibility proposal without creating or publishing it; MSC-100 records whether a demo is separately approved/deferred. MSC-110 keeps release quality/real-device/campaign evidence separate from marketing outcomes. Full premium-game scope, existing gates and V0/V1 conditional voice are unchanged. No analytics dashboard/backend, telemetry SDK, scheduler, paid API/tool, ads budget or subscription is added by this reference.

The source describes authenticated partner HTML/CSV and cookie storage plus public news/video/ticket sources. **Those are historical descriptions, not verified current API availability or permission to scrape.** Before any integration, MSC-118 verifies currently supported/permitted data access, terms, actual formats, new-game identity and least-privilege authorization against primary documentation. Prefer owner-supplied exports/manual snapshots when suitable. Do not copy source cookie paths, read/store cookies or tokens in project files/logs, reuse its app/demo IDs, assume existing HeadArrow services or automate login. Expired login, changed parsing, inaccessible data and missing exports return explicit unavailable/unread states, never zero metrics or fake success. Collection/account access needs separate permission; no live data is fetched by this update.

Proposed reporting contract, if requested: dated snapshot/source/timezone/window; wishlist additions/removals/net and totals where available; annotated owner action/asset-revision log; multi-day trends; clear partial-day handling; store-source/UTM coverage limits; and optional demo funnel/ticket status only for legitimately approved available data. Keep genuine zero distinct from unknown. Source spike thresholds and lookback periods are starting hypotheses, not configured universal alerts. Referrer/video coincidence can motivate investigation but cannot prove causation, demographics or sales. External search results need the full current game name and verification; no creator contact is authorized. Never substitute demo median duration for campaign pacing tests.

MSC-115–116 associate capsule/footage/copy revisions and truthful claims with any later observation, following capture/build/consent rules. MSC-119/MSC-120 prepare an owner-authorized launch/measurement/support handoff with manual or existing legitimate zero-cost tools if requested; no external posts, emails/DMs, ticket replies, cross-promotion, publication or recurring monitoring is triggered. Source project-specific outreach decisions do not become this game's permanent marketing policy. Preserve no-extra-spend and price deferral until full-game completion; no promised wishlist/conversion/revenue result or imported launch calendar.
