# MSC-011 — Rapier Feasibility and Physics Conventions

**Task:** [MSC-011](../04-phased-agent-task-plan.md#msc-011--integrate-rapier-feasibility-scene) · **Date:** 2026-10-29 · **Phase:** 2 · **Adopted revision:** `@dimforge/rapier3d-compat` 0.21.0

## Simulation adapter

| File | Role |
|---|---|
| `src/simulation/physics/physicsPort.ts` | Engine-neutral `PhysicsWorldPort` (boxes, step, pose, ray cast, body/awake counts). Gameplay depends on this, not on Rapier. |
| `src/simulation/physics/rapierWorld.ts` | Rapier implementation; loads WASM once; validates finite/positive inputs. |
| `src/simulation/physics/conventions.ts` | Shared conventions below. |
| `src/simulation/physics/probe.ts` | Identical bodies and queries used to compare runtimes. |
| `src/presentation/smokeScene.ts` | Small sandbox: four textured crates fall and settle with fixed-step simulation and bounded catch-up. |

## Conventions

| Convention | Value |
|---|---|
| Up axis | +Y (same as Three.js) |
| Units | meters, kilograms, seconds |
| Gravity | Mars surface, **3.721 m/s²** down (tunable at the MSC-020 feel review) |
| Fixed step | 1/60 s; rendering reads poses after stepping; catch-up capped at 5 steps per frame |
| Ground | Fixed box whose top face is y = 0 |
| Colliders | Cuboids first; compound/proxy colliders for scrap come in MSC-012+ |
| Defaults | friction 0.7, restitution 0.05 (low bounce, calm feel) |
| Identity | `PhysicsBodyHandle` is a numeric engine handle; it is never persisted and is incompatible with domain `EntityId` strings |

## Runtime comparison (Check)

The probe drops three boxes (1 m, 0.5 m, 0.4×0.2×1.2 m) on the ground, steps 600 times and casts a ray down from y = 10.

| Runtime | Result |
|---|---|
| Vitest / Node 22.12.0 | `restingHeights [0.5, 0.25, 0.2]`, `rayDistance 9`, `bodyCount 4`, `awakeAfterSettling 0` |
| Browser, Vite dev server | identical |
| Packaged Electron 44.10.0, copied to a clean temp folder | identical |

All three report `rapier3d-compat 0.21.0`. The packaged run shows no console errors and the crates render settled on the ground.

## Security note

Rapier compiles its WebAssembly at runtime, so the production and dev CSP add `'wasm-unsafe-eval'` to `script-src`. This permits WebAssembly compilation only; JavaScript `eval` and inline scripts remain blocked (verified again in the packaged run).

## Deviations

- The `-compat` build embeds the WASM as base64 instead of a separate `.wasm` file. It needs no bundler plugin and loads identically everywhere; the trade-off is a larger JS bundle. Revisit if bundle size matters.
