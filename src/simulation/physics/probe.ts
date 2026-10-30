import type { PhysicsWorldPort } from './physicsPort';

export interface PhysicsProbeResult {
  readonly engine: string;
  readonly steps: number;
  /** Resting heights of the dropped boxes, rounded to 0.1 mm. */
  readonly restingHeights: readonly number[];
  /** Downward ray from 10 m above the stack: distance to the first hit, rounded to 0.1 mm. */
  readonly rayDistance: number | null;
  readonly bodyCount: number;
  readonly awakeAfterSettling: number;
}

const round = (value: number): number => Math.round(value * 10_000) / 10_000;

/**
 * Identical basic bodies and queries used to compare runtimes (Vitest/Node, browser dev and
 * packaged Electron). Same engine build and inputs must give the same summary.
 */
export function runPhysicsProbe(world: PhysicsWorldPort, steps = 600): PhysicsProbeResult {
  world.addBox({ kind: 'fixed', position: { x: 0, y: -0.5, z: 0 }, halfExtents: { x: 10, y: 0.5, z: 10 } });
  const boxes = [
    world.addBox({
      kind: 'dynamic',
      position: { x: 0, y: 2, z: 0 },
      halfExtents: { x: 0.5, y: 0.5, z: 0.5 },
      massKg: 20,
    }),
    world.addBox({
      kind: 'dynamic',
      position: { x: 2, y: 4, z: 0 },
      halfExtents: { x: 0.25, y: 0.25, z: 0.25 },
      massKg: 5,
    }),
    world.addBox({
      kind: 'dynamic',
      position: { x: -2, y: 6, z: 1 },
      halfExtents: { x: 0.4, y: 0.2, z: 0.6 },
      massKg: 8,
    }),
  ];
  for (let i = 0; i < steps; i += 1) world.step();
  const hit = world.castRay({ x: 0, y: 10, z: 0 }, { x: 0, y: -1, z: 0 }, 50);
  return {
    engine: world.engine,
    steps,
    restingHeights: boxes.map((box) => round(world.bodyPosition(box).y)),
    rayDistance: hit ? round(hit.distance) : null,
    bodyCount: world.bodyCount(),
    awakeAfterSettling: world.awakeBodyCount(),
  };
}
