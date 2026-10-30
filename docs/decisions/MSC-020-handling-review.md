# MSC-020 — Core Handling and Simulation Feasibility Review

**Task:** [MSC-020](../04-phased-agent-task-plan.md#msc-020--review-core-handling-and-simulation-feasibility) · **Date:** 2026-10-29 · **Gate:** Handling · **Build:** `develop` after Phase 2 (`phase/02-local-simulation`)

The owner plays the test yard with keyboard/mouse and with the Xbox-compatible controller and decides whether collector, grip, cart and cutting feel are good enough to build the vertical slice on. Unresolved performance failures block scale-up.

## How to run

```powershell
npm install
npm run electron:start
```

Click the window to capture the mouse. Esc releases it.

| Action | Keyboard / mouse | Controller |
|---|---|---|
| Move / look | WASD / mouse | Left stick / right stick |
| Use: collect, grab, place, load, push, cut | E or left click | X |
| Unload cart | F | Y |
| Rotate held object | Q / R | LB / RB |
| Jump | Space | A |

## Walkthrough checklist

| # | Try | Expected |
|---|---|---|
| W1 | Walk up the orange 15° and 30° ramps; try the dark 50° ramp | Climb the first two; the steep one blocks you |
| W2 | Walk onto the low gray step and against the taller dark step | Step up 20 cm automatically; 50 cm blocks |
| W3 | Walk into the dark inside corner (left, behind spawn) | No jitter, no passing through |
| W4 | Jump; walk off the edge into the pit (right side) | Calm Mars hop (~0.9 m); returned to the last safe ground |
| C1 | Aim at the mixed pile in front and use on gray pieces | Gray (Fe) pieces fly in and the container count rises |
| C2 | Aim at colored pieces | "isn't magnetic. Collect with: Hands, Grabber." and they stay |
| C3 | Fill the container (20) | Compatible pieces show "Container full", nothing is deleted |
| G1 | Grab a panel/housing/spool box (right of spawn), rotate, place | Object stays readable in front; rotates in 45° steps; places |
| G2 | Push the held object into a wall or yourself, then place | "Cannot place here" and you keep holding it |
| K1 | Hold a prop over the orange cart and use | "load into cart"; it rides on the bed |
| K2 | Aim at the cart and use; walk and turn; use again; press unload | Cart follows and turns; let go; loads line up beside it |
| X1 | Go to the rover (left front); aim at orange joint markers | "Cut …"; the coil joint says "Blocked: cut cover left and cover right first" |
| X2 | Cut the side bolt, then grab the released piece | "Side panel + Bracket" chunk can be grabbed and carted |
| P1 | Repeat W1–X2 with the controller | Same actions and prompts switch to controller wording |

## Known observations to judge

- **Grip push strength:** a held object at full follow speed can shove lighter props hard (seen in tests).
- **Jump and fall** use real Mars gravity (3.72 m/s²); it may feel floaty.
- **Walk speed** 4.2 m/s; **cart** follows at up to 5 m/s; **collector** pulls at 6 m/s within 3.5 m.
- Visuals are placeholder boxes; art comes from the MSC-041–050 pilots.

## Provisional measured budgets (proposal)

From the [MSC-019 baseline](../benchmarks/MSC-019-baseline.md) on the reference PC (Ryzen 7 3700X / RTX 2060). Provisional until Steam Deck evidence (MSC-030) and networking (MSC-021+).

| Budget | Proposal | Evidence |
|---|---|---|
| Awake bodies, sustained | ≤ 300 | Dense fixture: p95 453 awake → simulation p95 4.2 ms |
| Simulation time per frame (reference PC) | p95 ≤ 3 ms, p99 ≤ 5 ms | Leaves frame budget for replication and a much weaker Deck |
| Active (non-sleeping-capable) pieces per worked area | ≤ 300 | Dense fixture used 620 |
| Draw calls | ≤ 150 | Dense fixture p50 132 with instancing |
| Decorative density | No physics limit; bounded by draw calls/triangles | 40,000 instances cost no simulation time |
| Late-join snapshot | Must be chunked and bounded (MSC-024) | Dense snapshot 1.67 MB |

These are not minimum specifications or safe counts.

## Owner feedback (2026-10-30, first play session)

| # | Feedback | Response |
|---|---|---|
| F1 | The 3D art is nowhere near the reference images. | Correct: the yard used placeholder boxes. **Owner chose to bring an early style pass forward (2026-10-30).** Done: procedural rounded crew robot from the approved character sheet (3 reviewed passes, [review](../../art/sculpt/robot/review.md)), material-specific scrap silhouettes (nuts, brackets, pipes, ribbed plates, stamped panels, coils, housings, foil, ceramic tiles), yellow cart, rover with tires, first-person magnet/cutter, peach sky, mesas, rocks, a huge colorful scrap mountain hiding a white station ring, dish antenna and colony domes. The MSC-041–050 pilots remain the formal art approval gate. |
| F2 | Cutting was not discoverable. | Improved: joints are glowing, pulsing orange rings facing the player; the view switches to a cutter tool while a joint is targeted; contextual tips appear near the pile, the cart and the rover (in Spanish and English). |
| F3 | "Collector" was unclear. | It means the magnetic collector (the magnet tool). UI now uses "Imán colector" in Spanish. |
| F4 | All answers and the game must be understandable in Spanish. | **Approved: English and Spanish launch languages.** Implemented: every HUD/prompt string and content name in both languages, system-language default, L switches at any time, choice remembered per device. |
| F5 | The floor had holes you could fall through. | Fixed: one continuous floor under the whole visible world (the test pit is gone; walking off the old yard edge no longer drops into the void) plus invisible walls at ±200 m. A test casts rays every 13 m across the world and all hit ground. The fall safety net stays only as a fallback. |
| F6 | Every piece of scrap, any size, must have collision. | Fixed: the scrap mountain has a heightfield collider matching its shape (you climb it instead of walking through), and rocks, mesas, the station ring, colony domes, the hopper and the crew robots have colliders. Small and medium pieces already had bodies. Visual and physics share one backdrop layout. |
| F7 | The collector should work like a vacuum; right click unloads everything at the base for compaction. | Implemented: holding left click / E / RT sucks every compatible piece in a 22° cone (4 m, up to 8 at once, never more than fits); releasing stops it. Right click / F / Y at the base intake hopper unloads the whole container there (tallied per material, ready for compaction in MSC-031/032); elsewhere it explains where to go. Compatibility is unchanged: the ordinary magnet still pulls ferrous only (see open question). |
| F8 | Many small pieces at the foot of the mountain for the start; medium pieces that break into small pieces of several materials for the early-mid game. | Implemented: six clusters (216 small mixed pieces) along the mountain foot, woken when the player is within 16 m and put to sleep beyond 22 m; five breakable medium objects (old machine housing, cable junction box, broken solar panel, heat shield block, rover door) that break with right click / F / Y into 6–9 small pieces of 2–3 materials each, exactly once. |

**Open question (F7), resolved 2026-10-30:** the owner chose upgrades with a material selector instead of a vacuum that takes everything.

| # | Owner request | Result |
|---|---|---|
| F9 | When upgraded, the collector gets a selector: pick one material and collect only that until the container is full; switching is only possible once it is emptied. At the start it collects iron only. | Approved ladder, implemented as content data (`upgradeTiers` on the collector): level 1 iron; level 2 adds aluminum and copper (eddy current); level 3 adds polymer and heliofoil (suction); regolith ceramic never goes through the collector so the grabber and cart keep a role. `MaterialSelector` locks the choice while the container holds anything or a pull is in flight; unloading at the intake unlocks it. Controls: mouse wheel or Z/C (D-pad left/right) cycle; U (D-pad up) is a **test-yard stand-in** for buying an upgrade until the shared-credit store exists. Refusals explain why: needs level N, not selected (switch with wheel/Z/C), container holds another material, or never collected. |
| F10 | Large parts must be cut to make smaller pieces of their material, then vacuumed; otherwise the magnet does nothing with them. | Implemented: the collector only ever takes small scrap. A chunk released from the rover can be cut with right click / F / Y into small pieces of its own materials (about one per 3 kg, 2–12 per part, placeholder); once every joint is cut, the bare rover frame can be cut the same way (80 kg iron → 12 iron pieces). Holding use now vacuums even when the aim prefers a nearby prop or the cart, as long as nothing is held. |
| F11 | Is the tool for cutting large pieces implemented? Make it a real tool. | Implemented as an equippable tool: `ToolLoadout` keeps numbered slots (1 collector, 2 cutter; D-pad down cycles) and only equips owned tools (the content pack marks the cutter as not free; the test yard grants it up front as a store stand-in). Cutting is now held, not instant: a joint takes 0.8 s and a part 0.5 s + 0.03 s/kg, capped at 3.5 s (`CutProgress`, placeholders); releasing or looking away restarts it, and the prompt shows the percentage. With the collector in hand, joints, rover parts and breakable junk only explain that the cutter is needed, and grabbing still works; with the cutter in hand, holding use cuts or breaks and vacuuming is off. U upgrades the tool in hand: cutter levels 1/1.6/2.4× speed (placeholder ladder, prices unapproved). Right click no longer breaks or cuts; it only unloads. |
| F12 | Each material needs an identifying color, and pieces of different materials must differ in both color and shape. | Implemented: one color per material (gunmetal Fe, silver-white Al, bright copper Cu, blue Pl, teal Hf, lilac Rc; placeholder palette) on loose pieces, props and the decorative mountain, with a faint self-light on loose pieces so they stand out from the ground; each material keeps its own silhouette family (Fe nuts/brackets/pipes/ribbed plates, Al stamped panels, Cu coils, Pl housings, Hf layered sheets, Rc ribbed tiles). Aim highlight restores the material glow afterwards. |
| F13 | Switch the collector material only with the mouse wheel; show the selected material in a UI based on the references. | Z/C removed; the wheel (D-pad left/right) works only while the collector is in hand. New DOM HUD in the approved UI style: container panel with fill bar tinted by the loaded material, tool slots 1–2 with orange focus and level badges, collector filter panel (selected material swatch, lock icon, unlocked/locked material chips with their level, wheel or unload hint), cutter panel when it is in hand, crew panel 1/4. |
| F14 | Small pieces at the hopper compact into a bale; a new machine sells bales for near-instant money; large parts later go to a machine that processes and packs them. | Recorded in the PRD. Compactor and sale machine are MSC-031–033, brought forward by the owner as local single-player work; the large-part machine stays a proposed later facility (MSC-057). |

In-app check (Electron, Spanish UI): the HUD showed `Colector Nv1: Fe Chatarra férrica`; switching at level 1 explained only iron is available; vacuuming took 8 iron pieces and locked the selection; U upgraded to level 2 and switching was refused until the container was unloaded at the hopper; then Z/C and the wheel cycled iron → aluminum → copper. Cutting the side bolt released "Panel lateral + Escuadra", which right click cut into 5 small pieces; after the cover and coil joints, "Chasis del rover" was cut into 12 iron pieces and holding left click vacuumed 8 of them. Equippable cutter check (Electron, Spanish UI): with the collector in hand the side bolt read "Para cortar perno lateral, equipa el cortador" and holding did nothing; 2 equipped it ("En mano: Cortador", HUD `▶ 2 Cortador Nv1`); a 0.4 s hold showed "Cortando perno lateral… 51%" and cut nothing, a full hold cut the joint; holding on "Panel lateral + Escuadra" cut it into 5 pieces (18→23); U raised the cutter to level 2 (1.6×); the frame was cut into 12 pieces in a 2.2 s hold (23→35); 1 went back to the collector, which vacuumed 7 iron pieces. Not yet persisted: an isolated anchor that was cut up is not part of the assembly snapshot (save work in MSC-023/024).

## Owner decision

**Feel:** Approved by the owner on 2026-10-30 ("Aprobar y fusionar"): collector with locked material selector and upgrade tiers, equippable hold-to-cut cutter, grip/cart handling, breakable medium junk and the intake unload.

**Budgets:** The provisional measured budgets above are accepted as working limits until Steam Deck evidence (MSC-030) and networking (MSC-021+) revise them. They are not minimum specifications.

## Required follow-ups before continuing with the next tasks

Raised by the owner with the approval (2026-10-30). They must be done before MSC-034 and the rest of the roadmap continue.

| # | Follow-up | Notes |
|---|---|---|
| R1 | Improve every machine model: intake hopper, compactor, output pad and sale machine. | Closer to the approved gameplay and UI concepts (chunky rounded industrial shapes, readable states). |
| R2 | Improve the cart model. | Same style reference; keep the collider and handling unchanged unless a change is reviewed. |
| R3 | Improve the scenery around the yard and base. | Ground, rocks, mesas, station and base area. |
| R4 | Build the giant scrap mountain from real material pieces, mixed small, medium and large, each with real collision. | Replaces the decorative instances plus heightfield. Must respect the MSC-019 budgets (≤ 300 awake bodies, draw calls ≤ 150): pieces stay asleep or static until disturbed, are activated by area, and the dense benchmark is re-run as evidence. Small pieces stay collectable, medium ones breakable, large ones cuttable. |

### Follow-up results (2026-10-30)

| # | Result |
|---|---|
| R1 | New machine models anchored on the gameplay concept and the stylized press: sorting bay (one bay per material, cream sign with the material icon, pile that follows the bin count), intake hopper with conveyor, yellow/blue compactor press with control box and beacon, grated output deck, pressed-piece bales on yellow pallets, navy/yellow sale machine. The base is laid out in flow order facing the yard: compactor, sorting bay, hopper, sale machine. [Review](../../art/sculpt/base/review.md). |
| R2 | Cart rebuilt like the concept (yellow tub, dark rim and bumpers, hub wheels, push handle); collider and handling unchanged. |
| R3 | Layered rocks, stepped mesas, ribbed shipping containers and floodlights (all with colliders), ground tone patches, grated base floor, sun moved so machine fronts are lit. |
| R4 | The mountain is now real pieces: about 1,200 large and medium parts plus about 1,000 small pieces in solid clusters, every one with a collider, stacked on a visible core; the slope follows the mountain shape (stacking is capped) so the rim can be worked from the ground. Small pieces wake near the player and are vacuumed as usual; medium parts are grabbed or broken/cut; large parts are cut into small pieces of their material. A part is blocked only while a large part rests on it; medium parts resting on a part that leaves become falling props, so nothing floats. The layout is deterministic from a seed (a save only needs changed ids). |

**In-app evidence (Electron, reference PC):** a medium aluminum part was grabbed and placed; a large iron part with medium parts on top was cut in a held 4 s cut into 12 iron pieces and the parts on top fell as props; a buried part shows "tiene piezas encima, retíralas primero". Simulation stayed at p95 0.8–1.2 ms, p99 ≤ 1.8 ms, 0 awake bodies at rest (19 briefly after a cut), active pieces 236–293 at the mountain foot (≤ 300).

**Draw-call budget:** the first R1–R4 pass reached 186–233 draw calls (from about 1,100), above the accepted ≤ 150. The owner chose to keep reducing rather than raise the budget (2026-10-30). Second pass:

- Static batching now bakes each plain material's color, roughness/metalness and emissive light into vertex attributes (flat-shaded parts get face normals), so a batched subtree is one mesh per face side instead of one per finish. Crew robots went from 12 to 4 meshes each, the compactor from 10 to 4, the held tools and rover fragments to one each.
- Every scrap silhouette of a material (small/medium shapes and large parts) shares one multi-draw `BatchedMesh` with per-piece culling: one batch per material for the mountain and one for active scrap, instead of one instanced mesh per material and shape.

Measured in Electron on the test yard: **99 draw calls at spawn, 82 at the mountain** after cutting a large part (293 active pieces), triangles about 0.62–0.79 M, simulation p95 1.2–1.3 ms, p99 ≤ 2.2 ms. The look is unchanged in side-by-side captures, and the economy loop (bale grab, sale +40 C, no double payment), the mountain cut and the spawn view were re-run. Within the ≤ 150 budget; no shadow-distance change was needed.

## Mountain physics follow-up (owner check 2026-10-30)

**Owner report:** mountain pieces behaved strangely: some fell when the player approached, some floated, some passed through each other. The mountain must be pieces burying each other, never passing through the player or each other, with real physics and collisions at every size, and medium and large parts buried under heaps of small pieces.

**Cause:** the first layout stacked pieces on a height grid instead of simulating them. Parts were embedded 25% into each other on purpose, small pieces sat over gaps, and whole areas switched to dynamic bodies when the player came within 12 m. Overlapping pieces were pushed apart violently ("flying") and unsupported ones dropped ("falling when approached").

**Changes:**

- **Settled offline with the game's physics** (`npm run bake:mountain`, `src/simulation/yard/mountainBake.ts`, data in `scrapMountain.baked.json`). Large parts drop first, then medium parts, then heaps of small pieces poured mostly over the parts (70% on the part's footprint), then the starter spill at the foot. Each wave is simulated without engine sleep until every piece stays under 3 cm/s, then frozen as fixed colliders exactly as the game holds a dormant pile. Pieces that never rested or left the mound are discarded. Three joint passes then re-settle all small pieces together as dynamic bodies, because the game can wake any of them. The mountain core collider has friction 1.0 (packed scrap), so pieces hold on its steepest slopes (about 33°).
- **Pieces only move when disturbed.** Small mountain pieces stay fixed until the collector pulls them, the player walks into them (touch reach 0.65 m, while fewer than 260 pieces are active), or what they rest on moves away. Waking cascades to everything resting on a moving, collected, cut or released piece, so nothing is left floating. Pieces that come to rest farther than 7 m from the player become fixed again where they lie. The collector can aim at and pull dormant pieces directly.
- **Physics streaming.** Each fixed collider costs simulation time even at rest (measured with Rapier: 7,000 idle fixed bodies cost 2.3 ms per step). Small-piece clusters therefore hold colliders only within 16 m of a player (dropped beyond 22 m); nothing can touch a dormant piece farther away.
- **Aim.** What the crosshair touches now wins over the aim cone, so a nearby small piece never steals the target from the part in front of the player.

**Evidence:**

- The current bake has 10,082 pieces: 100 large, 494 medium and 9,488 small. More than 70% of the medium and large parts have small pieces resting on them.
- Unit test: four mountain areas and the foot spill were simulated as dynamic bodies, with medium and large parts fixed as in the game. No piece moved 5 cm in 1.5 s. With all 9,488 small pieces woken at once, 1 piece moved more than 5 cm (5.4 cm).
- Measured in Electron:
  - Approaching the foot woke nothing (18 active pieces, the starter pile).
  - The collector pulled dormant iron pieces from the heap.
  - Walking into a heap woke 36 pieces, which settled (2 awake after 3 s).
  - Cutting an exposed large aluminum part produced 12 pieces, and the small pieces and medium parts on it fell.
  - The economy loop still sells a bale for +40 C.
  - Simulation p95 was 1.1–2.1 ms and p99 ≤ 2.4 ms. Draw calls were 73–105 and triangles about 1.0–1.1 M (small pieces beyond 45 m are not drawn and cast no shadows).

**Open:** at this scale, small pieces (about 0.2–0.3 m) cover medium parts but only partly bury large ones (2–3.6 m), and much of the dark core still shows between heaps. Fuller burial needs either several times more small pieces (simulation, triangle and load-size budgets) or a different size mix. This is an owner decision.
