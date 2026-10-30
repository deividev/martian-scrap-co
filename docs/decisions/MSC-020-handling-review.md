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

**Feel:** _pending_

**Budgets:** _pending_
