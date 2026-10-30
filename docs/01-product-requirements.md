# Martian Scrap Co. — Product Requirements

**Version:** 1.2 planning baseline · **Date:** 2026-10-29 · **State:** marketing-context alignment, not new product approval or implementation authorization.

Martian Scrap Co. is a complete premium first-person recycling game for one to four online players. An enormous connected Martian scrapyard becomes a visible record of the crew's work: collect, classify, compact and sell scrap, buy better equipment, reveal a buried surface station, and finally dismantle it to support the colony.

**Read next:** [Visual art direction](02-visual-art-direction.md) · [Technical architecture](03-technical-stack-architecture.md) · [Phased task plan](04-phased-agent-task-plan.md).

## 1. Decision status and product boundaries

| Label | Meaning |
|---|---|
| **Approved** | Explicit user decision; do not silently replace it during implementation. |
| **Proposed** | Recommended first design to test; approval and tuning remain outstanding. |
| **Validation required** | A target or feasibility claim that needs measured evidence; no success is implied. |

Unlabelled implementation examples below are **Proposed**, not new approved commitments. Requirement IDs preserve traceability even where their detailed solution remains proposed.

| Decision | Status | Boundary |
|---|---|---|
| Martian Scrap Co. name | Approved | Preliminary indexed Steam/itch/general search only; not trademark or commercial-availability clearance. |
| Complete premium Steam release | Approved | No early-access dependency, paid backend or monetization system assumed. |
| First-person 3D; solo and up to four online players | Approved | Not split-screen; every required activity must work solo. |
| Connected Mars scrapyard and buried station finale | Approved | Documented surface-station interpretation, not an orbital map or space-flight expansion. |
| Relaxing play; no enemies, mandatory timers or harsh penalties | Approved | Colony survival is narrative motivation, not oxygen/hunger management. |
| Shared credits and credit-led purchases | Approved | Material deliveries are occasional major milestones, not normal recipe crafting. |
| Host-owned campaign; guests help that world only | Approved | Independent play starts another campaign; no guest world carryover. |
| Colorful industrial low-poly art; rounded robot variants; illustrated UI direction | Approved | Silhouette alternatives retained as exploration; mockup numbers/text are placeholders. |
| Three.js + Electron, empty-project start | Approved | Mature free libraries recommended; no reused game source. |
| Windows keyboard/mouse and controller; Deck compatibility goal | Approved / Validation required | No Deck Verified, hardware minimum or proven performance claim. |
| Minimum six-hour first-time four-player campaign | Approved target / Validation required | Excludes optional content; never pad with waiting or divide solo time by four. |
| Launch languages: English and Spanish | Approved (2026-10-30, MSC-020 review) | Every player-facing string and content name ships in both; player can switch at any time. Further languages need a separate decision. |
| EUR 5 reference | Deferred | Symbolic starting reference only; decide actual price after the full game is developed. |

The financial constraint is **zero additional spending** on tools, assets, plugins, APIs, services, hosting or subscriptions. Existing AI subscriptions may assist production; Steam publication fee is already covered. This plan authorizes no purchases, account mutations, commits or publication.

## 2. Experience pillars and player journey

**PRD-001 — Tangible transformation (Approved).** The player can identify what changed after each work session: an exposed pathway, a recognizable machine, a new station section or cleaner skyline. Progress must not be represented solely by a currency counter.

**PRD-002 — Enjoyable physical recycling (Approved).** Each loop contains useful choices and readable physical feedback. A small magnetic sweep, a loaded cart, a material-specific compacted bale and a completed sale should feel different, without demanding individually sorting every screw.

**PRD-003 — Calm cooperation (Approved).** Players choose activities freely and switch whenever useful. Robots are not classes. There are no exclusive skills, required simultaneous switches or compulsory two-person lifts. Cooperation adds options and social delight, not access to otherwise missing content.

**PRD-004 — Complete campaign (Approved).** The route begins at a basic processing base and ends with dismantling the revealed station. The ending must be reachable without collectibles, side missions or purchasing every optional upgrade.

### First 15–30 minutes — proposed onboarding

| Window | Player experience | Observable learning |
|---|---|---|
| 0–5 minutes | Arrive beside base, see colony on the horizon, learn looking/moving and inspect nearby scrap. | Understand why recycling matters and recognize the first collection target without a long briefing. |
| 5–10 minutes | Sweep a compatible small pile into the portable container; carry incompatible pieces using the appropriate basic action. | Learn material compatibility and capacity feedback, not a universal magnet fiction. |
| 10–15 minutes | Return to a broad base intake, unload a batch and classify into material hoppers. | Understand sorting by batch rather than repeatedly placing individual screws. |
| 15–20 minutes | Operate the first compactor, move its output and make a clearly previewed sale. | Connect physical processing to credits. |
| 20–30 minutes | Buy a meaningful first upgrade, move a medium prop by cart and expose the first station marker. | Experience changed capability and choose the next work area. |

These windows are hypotheses, not measured completion times. Late-joining players receive a short contextual introduction without resetting the host's world. Tutorials remain replayable and skippable; instruction text does not prevent another player from working.

### Middle and ending

The player alternates collection routes, processing improvements and newly exposed assemblies. A colony notice explains each major delivery's purpose through concise text and visible background changes. New equipment changes the action or route, not merely collection speed. The final station combines familiar actions at larger scale, then offers a clear completion scene and permission to continue optional cleanup.

## 3. Collection and processing rules

**PRD-005 — Three handling scales (Approved).** Small scrap accumulates in an upgradeable portable container. Medium objects occupy the world and use carts or other transport tools. Large assemblies must be separated before ordinary transport. Exact dimensions, carrying weights and capacities are not approved.

**Proposed feel contract:** aim gives a stable target cue; compatible pieces accelerate toward the collector with restrained sound and animation; collection confirms only when ownership transfers. A full container stops intake with a clear signal, never destroys overflow. Unsupported material stays visible with an intelligible reason. A short reach assist can reduce precision demands; it must not collect through walls or steal another player's held object.

**PRD-006 — Batch classification (Approved).** Early mixed collection is classified at base hoppers in batches. Proposed unloading previews the materials present, then routes a selected batch into the matching hopper. Wrong intake attempts return the batch or leave it in its source, rather than charge fines. Distinct icon, shape and text supplement color. Later selectable collection filters operate only on compatible materials.

**PRD-007 — Physical compaction and sale (Approved).** Each material compacts separately. Proposed machine states are idle, loading, processing, output-ready and blocked-output. Processing is an observable short action, not a mandatory campaign waiting period; players can collect while it runs. Reserve input atomically, show motion and a distinctive output, and commit the output once. Obstructed output pauses safely with retrieval guidance. Selling previews material, quantity and credits; the host commits removal and payment together. Duplicate button presses or retransmissions never duplicate payment.

**PRD-008 — Legible dismantling (Approved intent; Proposed implementation).** Large assemblies expose designed separation points after inspection. A cutter removes predefined joints; it does not require arbitrary mesh fracture. Fragments retain material identity and safe pickup anchors. No valuable object should disappear below terrain; retrieval can return inaccessible scrap to a recovery bay without a penalty. Temporary settling and mild slapstick are acceptable; crushing, permanent loss and punishment are not.

### Proposed bounded material roster

Names, count, prices and yield rates are unapproved. Start with these six behavior families and validate whether each earns its complexity; do not grow the roster merely to extend duration.

| Candidate | Readable appearance | Collection compatibility | Separation / compaction rule |
|---|---|---|---|
| Ferrous scrap | Cool gray brackets, bolts, ribbed plates | Ordinary magnetic collector | Ferrous-only hopper and dense block. |
| Aluminum | Pale broad panels, light frames, stamped triangle | Hand/cart or compatible grip tool, not ordinary magnet | Separate light-metal hopper; folded panel bale. |
| Copper | Warm coils and exposed bundled cable | Grip/cable tool; not ordinary magnet | Cut cable mounts, then coil bale. |
| Polymer | Saturated housings and molded ribs | Hand/cart or compatible grip tool (suction collector removed at MSC-002) | Plastic-only press, rounded compressed bundle. |
| Heliofoil — fictional | Teal-edged layered solar sheeting | Proposed sheet clamp | Release frame first; laminated bale, no magic magnet attraction. |
| Regolith ceramic — fictional technology | Cream ribbed heat shields, dotted stamp | Hand/cart or pad gripper | Predefined panel separation; contained ceramic compact, stylized not hazardous dust. |

Materials may share economic processing infrastructure where that keeps decisions readable. Fictional materials must have explicit compatibility definitions, not unexplained exceptions. Mixed assemblies list their separable families. Icons remain stable across world decals, hoppers, inventory and store.

## 4. Tools, upgrades and the economy

**PRD-009 — Multiple useful tools (Approved).** Proposed families below are a starting content budget, not an approved catalog. Every family needs its own upgrade branch and a useful niche after another tool unlocks.

| Proposed family | Initial purpose | Separate credit-purchased upgrade examples |
|---|---|---|
| Magnetic collector | Small ferrous sweeps | Controlled reach; intake stability; compatible-material filter selection. |
| Grabber / sheet clamp | Non-ferrous pieces and awkward panels | Grip width; rotation control; assisted placement. |
| Cutter | Predefined assembly joints | Joint visibility; reach; improved separation control. |
| Cart | Medium loads and compacted output | Capacity; turning assistance; unloading convenience. |
| Portable container | Carry small collected batches | Capacity; unload control; clearer material readout. |
| Base facilities | Sorting, compaction and local transport | Hopper capacity; compactor throughput; short conveyors and unloading aids. |

A purchased upgrade must alter an observable limit or affordance. Do not sell multiple numerically different upgrades with no felt benefit. Exact prices and tier counts follow measured loop times. Character color does not lock equipment access. Proposed loadout presentation should avoid copying the concept's four illustrative slots as a fixed rule.

**PRD-010 — Credits dominate progression (Approved).** Sell sorted/compacted resources, receive credits, then buy equipment and facility improvements. Material deliveries may celebrate major colony milestones but should not become a parallel recipe economy. Proposed shop shows shared balance, prerequisites, before/after effect and a confirmation target. Essential purchases are clearly distinguished from optional comfort purchases.

**PRD-011 — Finite-world solvency (Proposed safeguards; Validation required).** Audit each progression frontier for sufficient accessible sale value to afford required unlocks. Proposed protection reserves access to a basic collector, cart, intake and sale method for free; tools do not permanently break. A mistakenly chosen optional purchase must not strand the campaign: support a clearly disclosed refundable/respec path for progression-critical spending, or guarantee enough remaining reachable value. Do not assume infinite respawning scrap. Milestone delivery reserves must not consume the last resource needed elsewhere. A numerical solver and adversarial saves must test depleted sectors, partial bales, interrupted sales and all legal purchase orders before content lock.

**PRD-012 — Support automation (Approved boundary).** Conveyors, unloading aids and improved compactors reduce repetitive base friction. They do not harvest the entire mountain, select all routes or finish the campaign unattended. Test that late-game players still spend meaningful time manipulating and collecting scrap.

## 5. Campaign structure and pacing hypothesis

**PRD-013 — Four-player duration (Approved target; Validation required).** Minimum six hours for four first-time players following the main campaign, excluding optional collectibles, side missions and extra upgrades. The proposed allocation below totals **390 minutes / 6.5 hours**, providing a design hypothesis rather than a guarantee. It describes group elapsed time with parallel work, not aggregate person-hours. No artificial gates, idle timers or repetitive grind are permitted to make the clock reach six hours.

| Proposed sector / main beat | Group minutes | Mechanical and visual variation |
|---|---:|---|
| Receiving flats and starter bay | 35 | Small mixed piles, base loop, broad red ground and painted intake landmarks. |
| Rover berm | 55 | Carts, medium chassis, looped routes and chunky wheel silhouettes. |
| Solar terraces | 60 | Nonmagnetic panels, sheet handling, copper runs, pale/turquoise arrays. |
| Fabrication ridge | 65 | Cutting joints and large housings; orange gantries and dark machine cavities. |
| Station crown excavation | 65 | Vertical reveal through designed safe terraces, coordinated routes and growing station facade. |
| Station service ring | 55 | Interior/exterior circulation, integrated material streams, shorter return logistics. |
| Station dismantling finale | 55 | Deliberate staged assembly removal, colony delivery and visible finished skyline. |
| **Main campaign total** | **390** | **Optional content contributes zero to this target.** |

All sectors occupy one evolving connected yard; labels are production units, not separate planets. Returning to base should become more convenient without erasing travel decisions. Existing cleared terrain stays cleared. New sectors introduce a distinct operation, spatial arrangement or assembly problem rather than simply another larger mound.

**PRD-014 — Solo parity (Approved; Proposed tuning).** Solo reaches the same station, tools, story and ending. Tune material quotas, route assistance or handling tolerances when appropriate; do not require four simultaneous interactions. Purchased handling aids replace any need for another human. Player-count changes cannot regenerate sold scrap or repeatedly lower/reward objectives. Freeze objective scaling rules per milestone and explain them. Measure solo duration separately; six hours is not a solo target divided by four.

### Finale — proposed sequence

First expose the station access and its identity plaque. Next remove outer utility assemblies and make safe, readable work terraces. Then separate service modules and structural panels in an authored order, preserving traversal to remaining work. Finally compact/sell the recovered output and complete a major colony delivery. The station is a grounded surface structure throughout. A final view contrasts the opening mountain with the recovered site; a colony message closes the simple story. Save between stages, support late join, and recover orphaned fragments. No last-minute combat, evacuation timer, spaceship launch or irreversible surprise expense.

**PRD-015 — Optional continuation (Proposed).** After credits, allow residual cleanup, decorative discoveries and additional convenience upgrades in the same save. Optional side deliveries and collectibles must be visibly optional and excluded from campaign-duration acceptance. Endless procedural yards, pressure modes and post-launch expansions are outside the first launch plan unless separately approved.

## 6. Cooperative product contract

**PRD-016 — Session ownership (Approved).** One host owns the world, currency, equipment and upgrades; guests contribute only to that campaign. Solo can reopen the host's campaign. A guest starting independently creates a separate world, never a copy of the host's progress. Personal cosmetics, settings and achievement persistence follow the **policy approved at MSC-004** ([record](decisions/MSC-004-personal-progression-test-access.md)): robot color and Steam achievements are personal, settings stay local per device, no leaderboards or personal gameplay unlocks; none of it is campaign carryover.

**PRD-017 — Joining and privacy (Approved policy at MSC-003; Validation required).** Detailed rules: [MSC-003 policy](decisions/MSC-003-session-privacy-spending.md). Start with private/friends-invite sessions using Steam invitations; public browsing or short codes are not assumed launch requirements. Show host identity, current occupancy and host-save ownership before joining. Handle invitations while open and when launched from closed state. Full lobbies, denied access and incompatible protocol versions return clear recoverable messages. No custom account or paid server is proposed.

**PRD-018 — Shared spending and permissions (Approved policy at MSC-003).** Everyone may collect, sort, cut and sell. The host buys directly; guests send purchase requests the host approves or declines; the host may mark trusted guests "Can spend" for the session. Show purchase requests to prevent silent credit depletion. Host removal of a disruptive guest and private lobbies mitigate griefing. No guest may delete/reset the campaign, change world permissions or overwrite saves.

**PRD-019 — Concurrent integrity (Required behavior; Proposed design).** The host arbitrates object claims; two requests cannot both acquire the same item. All sales, compactions, cuts and purchases have idempotent transaction IDs. Rejected actions restore the authoritative state with concise feedback. Brief guest visual prediction must not create spendable items or credits. Held objects release safely on disconnect. Humor comes from expressive reactions, silly scrap and gentle cart mishaps, not player imprisonment, stolen progress or destructive friendly fire.

**PRD-020 — Leave, rejoin and late join (Required behavior; host-exit policy Approved at MSC-003).** A joining player receives the current processed world, upgraded facilities and campaign phase before acting. Reconnection cannot resurrect consumed material or retain stale claims. Host departure ends the session gracefully after a safe save; guests are told whose world remains available. No host migration or portable campaign is promised. Host crash can recover only the last valid committed save; disclose that boundary.

## 7. Persistence, controls and accessibility

**PRD-021 — Safe progress (Required; Proposed implementation).** Version saves, keep a previous valid backup, write atomically and recover from interrupted processing. Loading a save never duplicates fragment or bale identities. Steam Cloud is a proposed convenience: conflicting histories require explicit choice with progress summaries and backup, not timestamp-only automatic overwrite. Device-specific graphics/input settings stay local. Never overwrite a newer unsupported schema; offer recovery guidance.

**PRD-022 — Input and readable UI (Approved direction; Validation required).** Every required action is reachable through keyboard/mouse and controller, including join, settings, shop, material filters, confirmations and returning from errors. Explicit focus, correct prompts and a safe reset prevent controller traps. Proposed comfort options include look sensitivity, inversion, remapping, toggle/hold choices, camera shake/head bob reduction, subtitles and separate audio buses. Text scaling, reduced motion and non-color material cues require inspection at handheld size. English and Spanish are the approved launch languages (2026-10-30); every player-facing string exists in both and the language can be switched in game. This does not imply further languages or certified accessibility.

Menus must state whether a multiplayer world continues running; proposed solo pause genuinely pauses simulation. Important instructions remain readable when the player cannot hear audio. Caption narrative messages and meaningful machine states without flooding the HUD. Avoid flashing success effects, compulsory rapid repeated presses and precision-only cutting targets.

## 8. Acceptance, risks and release decisions

| Requirement group | Release evidence / acceptance |
|---|---|
| PRD-001–004, 013–015 | Recorded main-route first-time four-player tests reach the finale in at least six hours without optional content or padding; separate complete solo run has no cooperative locks. |
| PRD-005–009 | Novices distinguish all handling scales, complete a batch loop and identify incompatible collection; cutting remains readable with controller. |
| PRD-010–012 | Economy audit finds no required-unlock softlock; all legal transactions preserve material/credit invariants; automation leaves active collection relevant. |
| PRD-016–020 | Real Steam two-account/network gate, then four-player load: invites, late join, leave/rejoin, duplicate requests, version rejection and host exit behave as specified. |
| PRD-021 | Crash/save/migration/cloud-conflict matrix demonstrates recovery with no duplicate sale, item resurrection or unannounced overwrite. |
| PRD-022 | End-to-end Windows controller run and real Deck evidence, including text input and suspend/rejoin; no compatibility label until demonstrated. |

Proposed test success thresholds and test sample size must be agreed before formal pacing signoff. If the main route is too short, add meaningful authored work and interactions, not mandatory waits. If it is tedious, improve tool choice, route design and feedback before adding volume. A failing networking, performance, audio or art gate is a **Needs decision** result, not permission to drop confirmed co-op, spend money or claim completion.

Main risks are the four-player content workload, visually dense physics/replication, native Steam integration, handheld usability and zero-cost production quality. Gates in the task plan deliberately precede expensive catalogs. Minimum hardware and final price remain deferred until measured full-game evidence is available.

## 9. Reference boundaries

These primary pages inform mechanics or visual discussion, not sales forecasts or proof of commercial success. Our recommendations are independent design proposals, not copied game content.

| Reference | Relevant inspiration | Explicit boundary |
|---|---|---|
| [Moon Sweepers](https://store.steampowered.com/app/5335510/Moon_Sweepers/) | Collection, sale, upgrades, vehicle cleanup and cooperation. | No assumption that its pacing or production scope transfers. |
| [Leaf it Alone](https://store.steampowered.com/app/3981100/Leaf_it_Alone/) | Satisfying incremental clearing. | Not a mandate for idle progression. |
| [One Man's Trash](https://store.steampowered.com/app/3692070/One_Mans_Trash/) | Landfill vacuum/sell/upgrade and discovery; a direct loop comparator. | Do not copy its mystery, humor or infer market performance. |
| [Recycled](https://store.steampowered.com/app/5310130/Recycled/) | Physical processing as part of the reward. | Our batch rules and materials remain proposed. |
| [Hardspace: Shipbreaker](https://www.blackbirdinteractive.com/shipbreaker) | Readable cutting and manipulation. | No zero gravity, hazards or survival pressure imported. |
| [R.E.P.O.](https://store.steampowered.com/app/3241660/REPO/) | Expressive physical character humor. | No horror or copied robot designs. |
| [Winky](https://store.steampowered.com/app/5364230/Winky_Find_the_Golden_Ticket/) / [Gamble With Your Friends](https://store.steampowered.com/app/3892270/Gamble_With_Your_Friends/) | User-requested visual reference discussion. | No unverified mechanics or promises inferred. |

## 10. Implementation context and conditional voice gate

For session ownership, joining, replication, saves and recovery (PRD-016–021), read the packaged [co-op reference](../references/online-coop.txt) with architecture §§4–7 and task contexts. Its Toy Keeper paths, app ID, fork, legacy networking, timers, timestamp-only Cloud behavior, platform workarounds and completed checkboxes are historical source behavior, not verified Martian Scrap Co. features. Our approved host ownership and modern-Steam feasibility warning take precedence.

**V0 outcome (MSC-003, 2026-10-29): voice chat DEFERRED for launch scope.** Voice subwork is deferred/inapplicable; the game captures no microphone audio and makes no voice claim. Reconsideration needs a new owner decision after MSC-030. The conditional rules below apply only if voice is later approved.

**Voice scope: CONDITIONAL / NOT YET APPROVED.** The [Steam Voice guide](../references/steam-voice-steps.md) is context if associated implementation is authorized, not a new launch commitment. **V0** (MSC-003, reviewed at MSC-010) must record explicit owner approval or deferral, proposed privacy/enable/permission policy, listening/transmission modes and zero-cost scope. No proximity/global/always-on mode, exact keybinding or codec/rate is adopted automatically. If deferred, record voice subwork as inapplicable while completing base tasks; do not show fake working mic controls or claim chat support. Voice cannot be required to finish the campaign.

If authorized, **V1** (MSC-025–027) must verify actual adopted SDK/binding support, format/framing and real two-way microphone capture/playback in a packaged Steam path before the conditional MSC-088 service work. Proposed acceptance criteria are explicit enable/microphone permission; mute/PTT and truthful availability/capture/transmit states; identity/lobby-scoped bounded delivery; no recording by default; and teardown/rejoin cleanup with no stale audio. Microphone absence/denial must be recoverable without breaking play. These are proposed implementation criteria, not claims of approved voice behavior. Controller/Deck/multiple-speaker tests remain required if voice enters approved scope (MSC-083–089, MSC-094–095, MSC-103, MSC-107–109).

For debug evidence or actual trailer/store footage, read the [capture guide](../references/TRAILER_CAPTURE_INSTRUCTIONS.md), visual §9 and architecture §11 (MSC-019, MSC-113, MSC-115–116, MSC-119). Show real collect/sort/compact/sell/progression/co-op and station transformation, not combat or invented cinematics. Concepts are not runtime footage. HeadArrow labels, example clip quota/duration/resolution and archive names are guidance to adapt, not requirements or proof. Recording requires its own authorization; exclude player voices unless separately consented and cleared. Store claims must match the actual tested build, including whether voice is approved and implemented.

Every associated future work-unit report names **Context used**, relevant guide sections, justified **Deviations**, and observed checks/blocked evidence. Reading these guides does not authorize their embedded commands, downloads, source-project edits, account changes, capture or publication.

## 11. Marketing-measurement context and claim boundaries

Read the raw [marketing reference](../references/marketing.txt) before authorized measurement/visibility planning or asset/store iteration. It describes a HeadArrow/Winky case: Steam wishlist/traffic snapshots, dated action logs, capsule CTR, UTM attribution limits, optional-demo funnel observations, public-video discovery and support-ticket context. It is **not** target-audience research, an approved positioning strategy or proof that the same tactics work for this game. Its historical figures, names/app IDs, dates, spike heuristics and conclusions remain source data, not targets or forecasts.

MSC-010 can plan questions, evidence ownership and zero-extra-cost access limits early; MSC-040 can review whether a demo/visibility-measurement proposal is useful. Neither creates/publishes a demo or store page. Any demo remains separately scoped/approved (MSC-100); demo playtime/funnel observations never replace PRD-013's four-newcomer campaign evidence. At MSC-110, quality gates remain independent of marketing numbers. Use actual evidence for co-op, six-hour duration and Deck claims; approved art/UI and concept/runtime distinctions do not change.

Proposed marketing criteria: distinguish additions, removals and net wishlists where available; date actions and asset revisions; identify source and time window; mark today as partial and login/parser/unavailable data as unknown, never a fabricated zero. Small samples, UTM-only coverage and ambiguous referrers limit attribution; a coincident video or search spike is a hypothesis, not proof of causation or audience demographics. Metrics can inform capsule/store iterations (MSC-115–116) without automatically approving new art or unsupported copy. The [capture guide](../references/TRAILER_CAPTURE_INSTRUCTIONS.md) and visual §9 govern honest actual footage.

Source dashboard/cookie/API assertions require current verification before any authorized integration (architecture §12; MSC-118). No credential access, new analytics backend, paid marketing tool, outreach, posts, ticket replies or publication is authorized here. Zero extra spend remains binding; Steam fee is covered. Actual price is decided only after the complete game exists, not from EUR 5 or source campaign results. MSC-119/MSC-120 prepare owner-authorized launch evidence and optional manual measurement/support handoff, not a promised conversion, wishlist or sales outcome. Reports retain Context used/Deviations and limitations.

## Review checkpoint

Approve or revise the proposed roster, tool families, sector sequence, spending/privacy policy and acceptance protocol before full production. **MSC-002 (2026-10-29):** the owner approved the six material families, six tool families and seven-sector/390-minute sequence as the **provisional first-pass set** to build and test, removing the polymer suction collector; names, counts, prices, yields and minutes remain unapproved until measured ([decision log](decisions/MSC-002-content-hypotheses.md)). This document is a first complete design hypothesis, not a claim that these systems, test results or future bug fixes already exist.
