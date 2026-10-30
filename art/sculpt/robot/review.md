# Robot sculpt review (img2threejs via sculpt-3d)

**Date:** 2026-10-30 · **Factory:** [createRobotModel.ts](../../../src/models/generated/createRobotModel.ts) · **Style anchor:** approved [character concept sheet](../../../references/scrap-magnet-mars-character-concepts.png) (orange front/side crops in this folder)

| Pass | Renders | Comparison | AI-vision fidelity | Decision | Main findings |
|---|---|---|---|---|---|
| 1 | `pass1-front.png`, `pass1-side.png` | `cmp-pass1-*.png` | 0.55 | refine-code | Identity right (screen face, happy eyes, ear discs, beacon, hexagon, palette). Torso too narrow/short, arms and claws too thin, eyes/emblem too thin, HUD leaked into the viewer. |
| 2 | `pass2-front.png`, `pass2-tq.png` | `cmp-pass2-*.png` | 0.70 | refine-code | Torso/arm proportions now close. Claws still stick-like, beacon too flat, legs thin. |
| 3 | `pass3-tq.png`, `pass3-back-teal.png` | `cmp-pass3-tq.png` | 0.76 | continue (stop: bounded loop) | C-shaped claws, lighthouse beacon, wider crescent eyes; palette swap (teal) holds from the back. |

**Per-feature (pass 3):** silhouette/proportion 0.78 · face screen + eyes 0.80 · beacon 0.80 · chest emblem 0.75 · arms/claws 0.65 · feet/legs 0.75.

**Runtime hierarchy:** pivots `hips, neck, head, shoulderL/R, elbowL/R, legL/R`; sockets `handL/R, carry, beacon, firstPersonTool`; capsule collider matching the player; `setExpression(happy|neutral|surprised|focused)`. Exposed as `root.userData.sculptRuntime`.

**Deviations from the img2threejs pipeline:** intake probe, reference admission and the pre-spec assessment (measured proportions, 9-detail inventory) were run; `--strict-quality` spec validation was not satisfied because it demands a much deeper JSON spec than this stylized hero needs, so the factory was hand-authored from the assessment instead of generated. Reviews used real renders, comparison sheets and AI-vision scoring as the pipeline requires. Result is a **stylized approximation**; hidden back details are inferred from the side view.
