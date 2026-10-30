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
| F1 | The 3D art is nowhere near the reference images. | Correct: the yard uses placeholder boxes. Final art is planned for the MSC-041–050 pilots after the slice (T2). Whether to bring a style pass forward is an open owner decision. |
| F2 | Cutting was not discoverable. | The rover is to the left of the spawn; the small orange cubes are the joints. Discoverability (visible cutter, larger markers, on-screen guidance) to be improved. |
| F3 | "Collector" was unclear. | It means the magnetic collector (the magnet tool). UI now uses "Imán colector" in Spanish. |
| F4 | All answers and the game must be understandable in Spanish. | **Approved: English and Spanish launch languages.** Implemented: every HUD/prompt string and content name in both languages, system-language default, L switches at any time, choice remembered per device. |

## Owner decision

**Feel:** _pending_

**Budgets:** _pending_
