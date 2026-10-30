import { afterEach, describe, expect, it } from 'vitest';
import type { PhysicsWorldPort } from '../../src/simulation/physics/physicsPort';
import { createRapierWorld } from '../../src/simulation/physics/rapierWorld';
import {
  SCRAP_MOUNTAIN,
  WORLD_HALF_SIZE,
  addBackdropColliders,
  createBackdropLayout,
  mountainHeight,
} from '../../src/simulation/yard/backdrop';

const worlds: PhysicsWorldPort[] = [];
afterEach(() => {
  for (const world of worlds.splice(0)) world.dispose();
});

async function backdropWorld(): Promise<PhysicsWorldPort> {
  const world = await createRapierWorld();
  worlds.push(world);
  addBackdropColliders(world, createBackdropLayout());
  // Scene queries see new colliders after the first step.
  world.step();
  return world;
}

const down = { x: 0, y: -1, z: 0 };

describe('backdrop colliders', () => {
  it('has solid ground everywhere inside the world boundary (no holes)', async () => {
    const world = await backdropWorld();
    for (let x = -WORLD_HALF_SIZE + 5; x < WORLD_HALF_SIZE; x += 13) {
      for (let z = -WORLD_HALF_SIZE + 5; z < WORLD_HALF_SIZE; z += 13) {
        expect(world.castRay({ x, y: 60, z }, down, 200), `${x},${z}`).not.toBeNull();
      }
    }
  });

  it('gives the scrap mountain a solid surface that follows its shape', async () => {
    const world = await backdropWorld();
    for (const [x, z] of [
      [SCRAP_MOUNTAIN.center.x, SCRAP_MOUNTAIN.center.z],
      [SCRAP_MOUNTAIN.center.x + 15, SCRAP_MOUNTAIN.center.z + 6],
      [SCRAP_MOUNTAIN.center.x - 25, SCRAP_MOUNTAIN.center.z - 3],
    ] as const) {
      const hit = world.castRay({ x, y: 60, z }, down, 200);
      const expected = mountainHeight(x, z) * SCRAP_MOUNTAIN.colliderScale;
      expect(hit).not.toBeNull();
      expect(Math.abs(60 - (hit?.distance ?? 0) - expected), `${x},${z}`).toBeLessThan(0.6);
    }
  });

  it('blocks walking out of the world', async () => {
    const world = await backdropWorld();
    const hit = world.castRay({ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, WORLD_HALF_SIZE + 5);
    expect(hit).not.toBeNull();
  });
});
