import { describe, expect, it } from 'vitest';
import { PHYSICS_CONVENTIONS } from '../../src/simulation/physics/conventions';
import { runPhysicsProbe } from '../../src/simulation/physics/probe';
import { createRapierWorld } from '../../src/simulation/physics/rapierWorld';

describe('Rapier physics probe', () => {
  it('settles boxes on the ground under Mars gravity and answers ray queries', async () => {
    const world = await createRapierWorld();
    const result = runPhysicsProbe(world);
    world.dispose();

    expect(result.engine).toMatch(/^rapier3d-compat 0\.21\.0$/);
    // Boxes rest at their half height above the ground plane (y = 0), within 2 cm.
    const halfHeights = [0.5, 0.25, 0.2];
    result.restingHeights.forEach((height, index) => {
      expect(Math.abs(height - (halfHeights[index] ?? 0))).toBeLessThan(0.02);
    });
    // The ray from y = 10 hits the top of the 1 m box at the origin.
    expect(result.rayDistance).not.toBeNull();
    expect(Math.abs((result.rayDistance ?? 0) - 9)).toBeLessThan(0.02);
    expect(result.bodyCount).toBe(4);
    expect(result.awakeAfterSettling).toBe(0);
  });

  it('is repeatable for identical inputs', async () => {
    const first = await createRapierWorld();
    const second = await createRapierWorld();
    expect(runPhysicsProbe(first)).toEqual(runPhysicsProbe(second));
    first.dispose();
    second.dispose();
  });

  it('uses the documented conventions', async () => {
    const world = await createRapierWorld();
    expect(world.fixedStepSeconds).toBeCloseTo(1 / 60);
    expect(PHYSICS_CONVENTIONS.marsGravity).toBeCloseTo(3.721);
    world.dispose();
  });

  it('rejects non-finite or degenerate inputs', async () => {
    const world = await createRapierWorld();
    const base = { kind: 'dynamic', position: { x: 0, y: 1, z: 0 }, halfExtents: { x: 1, y: 1, z: 1 } } as const;
    expect(() => world.addBox({ ...base, position: { x: Number.NaN, y: 0, z: 0 } })).toThrow(RangeError);
    expect(() => world.addBox({ ...base, halfExtents: { x: 0, y: 1, z: 1 } })).toThrow(RangeError);
    expect(() => world.addBox({ ...base, massKg: -1 })).toThrow(RangeError);
    expect(() => world.castRay({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 5)).toThrow(RangeError);
    world.dispose();
  });
});
