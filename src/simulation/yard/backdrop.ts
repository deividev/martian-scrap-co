import { mulberry32 } from '../benchmark/denseYardFixture';
import type { PhysicsWorldPort, Vec3 } from '../physics/physicsPort';

/**
 * Shared layout of the yard backdrop, used by both physics and presentation so that everything the
 * player can see and reach also has collision (owner feedback 2026-10-30): the scrap mountain, rocks,
 * mesas, the station ring, colony domes and a world boundary. No holes to fall through.
 */
export const SCRAP_MOUNTAIN = Object.freeze({
  center: { x: 0, z: -42 },
  radiusX: 47.6,
  radiusZ: 27.2,
  /** Visual peak; the collider surface sits a little lower so pieces show on top of it. */
  peak: 16,
  colliderScale: 0.8,
});

/** Mountain envelope height at a ground position (0 outside the mound). */
export function mountainHeight(x: number, z: number): number {
  const dx = (x - SCRAP_MOUNTAIN.center.x) / SCRAP_MOUNTAIN.radiusX;
  const dz = (z - SCRAP_MOUNTAIN.center.z) / SCRAP_MOUNTAIN.radiusZ;
  const r = Math.hypot(dx, dz);
  return r >= 1 ? 0 : SCRAP_MOUNTAIN.peak * (1 - r) ** 1.4;
}

/** Half-size of the walkable world; invisible walls keep the player on solid ground. */
export const WORLD_HALF_SIZE = 200;

export interface BackdropBlock {
  readonly position: Vec3;
  readonly halfExtents: Vec3;
}

export interface BackdropLayout {
  readonly rocks: readonly {
    readonly position: Vec3;
    readonly scale: number;
    readonly yaw: number;
    readonly seed: number;
  }[];
  readonly mesas: readonly {
    readonly position: Vec3;
    readonly radiusTop: number;
    readonly radiusBottom: number;
    readonly height: number;
  }[];
  readonly station: { readonly position: Vec3; readonly radius: number };
  readonly colonies: readonly { readonly position: Vec3; readonly radius: number }[];
}

export function createBackdropLayout(seed = 42): BackdropLayout {
  const random = mulberry32(seed);
  const rocks = Array.from({ length: 60 }, (_, index) => {
    const angle = random() * Math.PI * 2;
    const distance = 26 + random() * 60;
    return {
      position: { x: Math.cos(angle) * distance, y: 0, z: Math.sin(angle) * distance },
      scale: 0.4 + random() * 1.6,
      yaw: random() * Math.PI,
      seed: index,
    };
  }).filter((rock) => mountainHeight(rock.position.x, rock.position.z) === 0);
  const mesas = Array.from({ length: 14 }, (_, index) => {
    const angle = (index / 14) * Math.PI * 2 + random() * 0.2;
    const distance = 150 + random() * 40;
    const height = 12 + random() * 18;
    return {
      position: { x: Math.cos(angle) * distance, y: height / 2, z: Math.sin(angle) * distance },
      radiusTop: 8 + random() * 14,
      radiusBottom: 14 + random() * 16,
      height,
    };
  });
  const colonies = Array.from({ length: 5 }, (_, index) => ({
    position: { x: 70 + index * 9, y: 0, z: -120 + random() * 10 },
    radius: 4 + random() * 4,
  }));
  return { rocks, mesas, station: { position: { x: -6, y: -2.5, z: -46 }, radius: 9 }, colonies };
}

/** Adds every backdrop collider: ground, mountain heightfield, rocks, mesas, station, domes, boundary. */
export function addBackdropColliders(physics: PhysicsWorldPort, layout: BackdropLayout): void {
  physics.addBox({
    kind: 'fixed',
    position: { x: 0, y: -0.5, z: 0 },
    halfExtents: { x: WORLD_HALF_SIZE + 10, y: 0.5, z: WORLD_HALF_SIZE + 10 },
  });
  physics.addHeightfield({
    center: { x: SCRAP_MOUNTAIN.center.x, y: 0, z: SCRAP_MOUNTAIN.center.z },
    sizeX: SCRAP_MOUNTAIN.radiusX * 2,
    sizeZ: SCRAP_MOUNTAIN.radiusZ * 2,
    rows: 48,
    cols: 48,
    height: (x, z) => mountainHeight(x, z) * SCRAP_MOUNTAIN.colliderScale,
  });
  for (const rock of layout.rocks) {
    physics.addBox({
      kind: 'fixed',
      position: { x: rock.position.x, y: rock.scale * 0.35, z: rock.position.z },
      halfExtents: { x: rock.scale * 0.8, y: rock.scale * 0.6, z: rock.scale * 0.8 },
    });
  }
  for (const mesa of layout.mesas) {
    const half = (mesa.radiusTop + mesa.radiusBottom) / 2 / Math.SQRT2;
    physics.addBox({ kind: 'fixed', position: mesa.position, halfExtents: { x: half, y: mesa.height / 2, z: half } });
  }
  const { station } = layout;
  physics.addBox({
    kind: 'fixed',
    position: { x: station.position.x, y: station.radius * 0.15, z: station.position.z },
    halfExtents: { x: station.radius * 0.8, y: station.radius * 0.45, z: station.radius * 0.8 },
  });
  for (const colony of layout.colonies) {
    physics.addBox({
      kind: 'fixed',
      position: { x: colony.position.x, y: colony.radius * 0.4, z: colony.position.z },
      halfExtents: { x: colony.radius * 0.8, y: colony.radius * 0.4, z: colony.radius * 0.8 },
    });
  }
  for (const [x, z, hx, hz] of [
    [WORLD_HALF_SIZE, 0, 1, WORLD_HALF_SIZE],
    [-WORLD_HALF_SIZE, 0, 1, WORLD_HALF_SIZE],
    [0, WORLD_HALF_SIZE, WORLD_HALF_SIZE, 1],
    [0, -WORLD_HALF_SIZE, WORLD_HALF_SIZE, 1],
  ] as const) {
    physics.addBox({ kind: 'fixed', position: { x, y: 10, z }, halfExtents: { x: hx, y: 10, z: hz } });
  }
}
