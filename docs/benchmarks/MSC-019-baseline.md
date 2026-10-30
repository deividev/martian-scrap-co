# MSC-019 — Dense-Yard Benchmark Baseline

**Task:** [MSC-019](../04-phased-agent-task-plan.md#msc-019--build-representative-benchmark-fixture) · **Date:** 2026-10-29 · **Build:** `0286085` (clean tree, packaged with `npm run package`) · **Raw reports:** [baseline](msc-019-baseline-0286085.json), [dense](msc-019-dense-0286085.json)

These are first measurements of a synthetic fixture on one machine. They are **not** performance targets, minimum specifications or safe object counts.

## Hardware and runtime

| Item | Value |
|---|---|
| CPU | AMD Ryzen 7 3700X (8 cores / 16 threads) |
| RAM | 31.9 GB |
| GPU | NVIDIA GeForce RTX 2060 (ANGLE / Direct3D 11) |
| Display | 120 Hz refresh; window canvas 1264×735, device pixel ratio 1 |
| Runtime | Packaged Electron 44.10.0 (Chromium 152), rapier3d-compat 0.21.0, Windows 10 Home 10.0.19045 |
| Run | `Martian Scrap Co.exe --benchmark=<preset> --benchmark-seconds=20`; 2 s warm-up, 20 s measured; report read through the DevTools protocol |

## What the fixture runs

Seeded yard with separate categories: decorative mound (InstancedMesh, never simulated), dormant clusters (identity only), active clusters (physics bodies), medium props, a cuttable rover and ring of station blocks. During measurement four scripted collectors pull ferrous pieces with the real `MagneticCollector`, four carts are pushed in a circle and a rover joint is cut every 2 s. Camera: slow smooth orbit.

## Results

| Metric | baseline | dense |
|---|---:|---:|
| Decorative visual instances | 5,000 | 40,000 |
| Active pieces (bodies) at end | 132 | 620 |
| Dormant pieces (no bodies) | 800 | 4,800 |
| Physics bodies at end | 178 | 750 |
| Awake bodies p50 / p95 / max | 14 / 63 / 82 | 94 / 453 / 552 |
| Simulation ms per frame p50 / p95 / p99 / max | 0.3 / 1.0 / 1.2 / 1.6 | 0.7 / 4.2 / 5.2 / 7.6 |
| Frame ms p50 / p95 / p99 / max | 8.3 / 8.4 / 8.5 / 8.7 | 8.3 / 8.4 / 8.5 / 8.6 |
| Draw calls p50 | 53 | 132 |
| Triangles p50 | 62 k | 489 k |
| Pieces collected / cuts / cart meters | 28 / 5 / 291 | 100 / 5 / 291 |
| Late-join snapshot (scrap + rover JSON) | 293 KB, 0.9 ms | 1.67 MB, 3.7 ms |
| JS heap start → end | 16 → 16 MB | 30 → 30 MB |

## Reading the numbers

- **Frame time is capped by the 120 Hz display (v-sync)**, so 8.3 ms means "kept up with refresh", not the real cost. Headroom must be judged from simulation time and, later, uncapped GPU timing.
- **Simulation cost scales with awake bodies, not with visual density**: 40,000 decorative instances added draw calls/triangles but no physics cost. The dense p99 of 5.2 ms (max 7.6 ms) is the main signal to watch as active clusters grow.
- **Late-join snapshot size** reaches 1.67 MB in the dense fixture. MSC-024 must chunk and bound it; it is not a payload to send in one message.
- Missing from this fixture until their tasks exist: blocked compactor output (MSC-032), networking/bandwidth (MSC-021+), real art assets and Steam Deck hardware (MSC-030).

## Context used

- [Capture guide](../../references/TRAILER_CAPTURE_INSTRUCTIONS.md): smooth, purposeful camera movement and recording the real native resolution/refresh instead of claiming a preferred format.

## Deviations

- No video, screenshots or audio were captured: recording needs separate authorization (MSC-115). No player voice exists (voice deferred).
- The guide's 1080p/60 preference is not a benchmark result; the actual canvas was 1264×735 on a 120 Hz display.
- No debug camera or HUD helper was added beyond the benchmark's fixed orbit.
