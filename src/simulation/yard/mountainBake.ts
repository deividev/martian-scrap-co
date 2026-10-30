import { mulberry32 } from '../benchmark/denseYardFixture';
import type { PhysicsBodyHandle, PhysicsWorldPort, Quat, Vec3 } from '../physics/physicsPort';
import { SCRAP_MOUNTAIN } from './backdrop';
import { mountainFootZ } from './testYard';

/**
 * Offline settling of the scrap mountain (owner check 2026-10-30: pieces must not overlap, float or fall when
 * approached). Pieces are dropped wave by wave onto the mountain core and simulated with the game's own physics
 * until they sleep: large parts first, then medium parts, then heaps of small pieces poured over the parts. Every
 * settled wave is frozen as fixed colliders, exactly as the game holds a dormant pile, so the next wave lands on
 * the same surface the player will meet. Only pieces that came to rest on the mountain are kept.
 *
 * Run with `npm run bake:mountain`; the result is committed as data, so every machine (host or guest) loads the
 * same mountain.
 */

/** 0 small, 1 medium, 2 large. */
export type BakedSize = 0 | 1 | 2;

export interface BakedPiece {
  /** Index into `materials`. */
  readonly m: number;
  readonly s: BakedSize;
  /** Silhouette variant (large parts; medium and small pieces derive theirs from the id). */
  readonly v: number;
  readonly p: readonly [number, number, number];
  readonly q: readonly [number, number, number, number];
  readonly h: readonly [number, number, number];
  /** Mass in kilograms. */
  readonly k: number;
}

export interface BakedMountain {
  readonly format: 1;
  readonly seed: number;
  readonly materials: readonly string[];
  readonly pieces: readonly BakedPiece[];
}

/** Material mix of the mountain (placeholder): iron dominates, every material is present. */
export const MOUNTAIN_MATERIALS: readonly (readonly [string, number])[] = [
  ['ferrous', 0.38],
  ['aluminum', 0.16],
  ['copper', 0.11],
  ['polymer', 0.15],
  ['heliofoil', 0.1],
  ['regolith-ceramic', 0.1],
];

/** First-pass bake tuning; counts are placeholders checked against the MSC-019 budgets. */
export const MOUNTAIN_BAKE = Object.freeze({
  seed: 11,
  large: 140,
  medium: 550,
  /** Share of medium/large parts that get a heap of small pieces poured over them. */
  heapShare: 0.9,
  /** Small pieces per square meter of a part's footprint in its heap (scaled by 0.6–1.2). */
  heapDensity: 11,
  /** Share of a heap poured over the part's own footprint. */
  heapOnTop: 0.7,
  /** Extra heap radius around a part's footprint, meters. */
  heapSpread: 0.45,
  /** Small pieces scattered over the whole mountain. */
  scattered: 300,
  /** Small pieces simulated together. */
  smallWave: 900,
  /** Pieces spawn inside this share of the mound radius and are kept inside `keepLimit`. */
  spawnLimit: 0.92,
  keepLimit: 1,
  /** Clear ring around the buried station so it stays readable. */
  stationClearance: 9.5,
  maxSettleSeconds: 40,
  /** Small pieces per starter spill at the mountain foot (six spills). */
  footPerSpill: 36,
  footKeepLimit: 1.25,
  /** A piece is at rest below this speed, m/s. */
  restSpeed: 0.03,
  /** Passes settling all small pieces together as dynamic bodies. */
  jointPasses: 3,
  /** Kilograms per cubic meter of collider box (hollow, stylized scrap). */
  density: 140,
});

type Tuning = typeof MOUNTAIN_BAKE;

interface Pending {
  readonly handle: PhysicsBodyHandle;
  readonly m: number;
  readonly s: BakedSize;
  readonly v: number;
  readonly h: Vec3;
  readonly k: number;
}

const round = (value: number, digits: number): number => Number(value.toFixed(digits));

function randomQuat(random: () => number): Quat {
  // Uniform random rotation (Shoemake).
  const u1 = random();
  const u2 = random() * Math.PI * 2;
  const u3 = random() * Math.PI * 2;
  const a = Math.sqrt(1 - u1);
  const b = Math.sqrt(u1);
  return { x: a * Math.sin(u2), y: a * Math.cos(u2), z: b * Math.sin(u3), w: b * Math.cos(u3) };
}

function yawTilt(yaw: number, tilt: number): Quat {
  const cy = Math.cos(yaw / 2);
  const sy = Math.sin(yaw / 2);
  const cx = Math.cos(tilt / 2);
  const sx = Math.sin(tilt / 2);
  return { x: cy * sx, y: sy * cx, z: -sy * sx, w: cy * cx };
}

function moundRadius(x: number, z: number): number {
  return Math.hypot(
    (x - SCRAP_MOUNTAIN.center.x) / SCRAP_MOUNTAIN.radiusX,
    (z - SCRAP_MOUNTAIN.center.z) / SCRAP_MOUNTAIN.radiusZ,
  );
}

/** Spawn heights of one wave, so pieces dropped together never start inside each other. */
class SpawnColumns {
  readonly #top = new Map<string, number>();
  static readonly CELL = 0.4;

  #keys(x: number, z: number, radius: number): string[] {
    const c = SpawnColumns.CELL;
    const keys: string[] = [];
    for (let cz = Math.floor((z - radius) / c); cz <= Math.floor((z + radius) / c); cz += 1) {
      for (let cx = Math.floor((x - radius) / c); cx <= Math.floor((x + radius) / c); cx += 1) keys.push(`${cx}:${cz}`);
    }
    return keys;
  }

  /** Center height for a piece of bounding `radius` above `floor`, then reserves its space. */
  place(x: number, z: number, radius: number, floor: number): number {
    const keys = this.#keys(x, z, radius);
    let base = floor;
    for (const key of keys) base = Math.max(base, this.#top.get(key) ?? -Infinity);
    const y = base + radius + 0.03;
    for (const key of keys) this.#top.set(key, y + radius);
    return y;
  }
}

export interface BakeProgress {
  readonly wave: string;
  readonly spawned: number;
  readonly kept: number;
  readonly steps: number;
  /** Largest distance a kept piece moved from where it started this wave, meters. */
  readonly worstMove: number;
}

/**
 * Settles the mountain in `physics`, which must already hold the backdrop colliders (ground, mountain core,
 * station, rocks). Pieces are left in the world as fixed colliders.
 */
export function bakeScrapMountain(
  physics: PhysicsWorldPort,
  station: { readonly x: number; readonly z: number },
  tuning: Tuning = MOUNTAIN_BAKE,
  onProgress?: (progress: BakeProgress) => void,
): BakedMountain {
  const random = mulberry32(tuning.seed);
  const materials = MOUNTAIN_MATERIALS.map(([id]) => id);
  const pickMaterial = (): number => {
    let roll = random();
    for (let i = 0; i < MOUNTAIN_MATERIALS.length; i += 1) {
      roll -= MOUNTAIN_MATERIALS[i]?.[1] ?? 0;
      if (roll <= 0) return i;
    }
    return 0;
  };
  const kept: BakedPiece[] = [];
  /** Fixed colliders of settled small pieces, for the joint pass. */
  const frozenSmall: { handle: PhysicsBodyHandle; piece: Pending; record: BakedPiece }[] = [];
  const parts: { readonly x: number; readonly z: number; readonly h: Vec3 }[] = [];

  /** Highest surface under a disc (center and four rim points), from rays cast straight down. */
  const surface = (x: number, z: number, radius: number): number => {
    let top = 0;
    for (const [dx, dz] of [
      [0, 0],
      [radius, 0],
      [-radius, 0],
      [0, radius],
      [0, -radius],
    ] as const) {
      const hit = physics.castRay({ x: x + dx, y: 80, z: z + dz }, { x: 0, y: -1, z: 0 }, 120);
      if (hit) top = Math.max(top, 80 - hit.distance);
    }
    return top;
  };
  const inMound = (x: number, z: number): boolean =>
    moundRadius(x, z) < tuning.spawnLimit && Math.hypot(x - station.x, z - station.z) > tuning.stationClearance;
  const randomSpot = (): { x: number; z: number } => {
    for (;;) {
      const angle = random() * Math.PI * 2;
      const r = Math.sqrt(random()) * tuning.spawnLimit;
      const x = SCRAP_MOUNTAIN.center.x + Math.cos(angle) * r * SCRAP_MOUNTAIN.radiusX;
      const z = SCRAP_MOUNTAIN.center.z + Math.sin(angle) * r * SCRAP_MOUNTAIN.radiusZ;
      if (inMound(x, z)) return { x, z };
    }
  };

  const spawn = (
    columns: SpawnColumns,
    x: number,
    z: number,
    s: BakedSize,
    h: Vec3,
    rotation: Quat,
    k: number,
  ): Pending => {
    const radius = Math.hypot(h.x, h.y, h.z);
    const y = columns.place(x, z, radius, surface(x, z, radius));
    const handle = physics.addBox({
      kind: 'dynamic',
      position: { x, y, z },
      halfExtents: h,
      rotation,
      massKg: k,
      canSleep: false,
    });
    return { handle, m: pickMaterial(), s, v: s === 2 ? Math.floor(random() * 8) : 0, h, k };
  };

  /** Simulates until the wave sleeps, drops pieces that never rested or left the mound, then freezes the rest. */
  const settle = (wave: string, pending: Pending[], keepLimit: number = tuning.keepLimit): void => {
    const starts = new Map(pending.map((piece) => [piece, physics.bodyPosition(piece.handle)]));
    const maxSteps = Math.round(tuning.maxSettleSeconds / physics.fixedStepSeconds);
    let live = pending;
    let steps = 0;
    // Rest means really still: the engine's sleep would stop slow slides, so the wave never sleeps here and is
    // done once every piece stays under the rest speed for two checks in a row.
    const moving = (piece: Pending): boolean => {
      const v = physics.bodyLinearVelocity(piece.handle);
      return Math.hypot(v.x, v.y, v.z) > tuning.restSpeed;
    };
    for (let pass = 0; pass < 4; pass += 1) {
      let calm = 0;
      for (let i = 0; i < maxSteps && calm < 2; i += 1) {
        physics.step();
        steps += 1;
        if (i % 30 === 29) calm = live.some(moving) ? 0 : calm + 1;
      }
      const drop = live.filter((piece) => {
        const p = physics.bodyPosition(piece.handle);
        return moving(piece) || moundRadius(p.x, p.z) > keepLimit;
      });
      if (drop.length === 0) break;
      for (const piece of drop) physics.removeBody(piece.handle);
      live = live.filter((piece) => !drop.includes(piece));
      // Whatever rested on a dropped piece must settle again.
      for (const piece of live) physics.setLinearVelocity(piece.handle, { x: 0, y: 0, z: 0 });
    }
    for (const piece of live) {
      const p = physics.bodyPosition(piece.handle);
      const q = physics.bodyRotation(piece.handle);
      physics.removeBody(piece.handle);
      const position = { x: round(p.x, 4), y: round(p.y, 4), z: round(p.z, 4) };
      const norm = Math.hypot(q.x, q.y, q.z, q.w);
      const rotation = { x: q.x / norm, y: q.y / norm, z: q.z / norm, w: q.w / norm };
      const handle = physics.addBox({ kind: 'fixed', position, halfExtents: piece.h, rotation });
      const record: BakedPiece = {
        m: piece.m,
        s: piece.s,
        v: piece.v,
        p: [position.x, position.y, position.z],
        q: [round(rotation.x, 5), round(rotation.y, 5), round(rotation.z, 5), round(rotation.w, 5)],
        h: [piece.h.x, piece.h.y, piece.h.z],
        k: piece.k,
      };
      kept.push(record);
      if (piece.s > 0) parts.push({ x: position.x, z: position.z, h: piece.h });
      else frozenSmall.push({ handle, piece, record });
    }
    let worstMove = 0;
    for (const piece of live) {
      const start = starts.get(piece);
      const record = kept[kept.length - live.length + live.indexOf(piece)];
      if (!start || !record) continue;
      worstMove = Math.max(worstMove, Math.hypot(record.p[0] - start.x, record.p[1] - start.y, record.p[2] - start.z));
    }
    onProgress?.({ wave, spawned: pending.length, kept: live.length, steps, worstMove });
  };

  const box = (x: [number, number], y: [number, number], z: [number, number]): Vec3 => ({
    x: round(x[0] + random() * (x[1] - x[0]), 3),
    y: round(y[0] + random() * (y[1] - y[0]), 3),
    z: round(z[0] + random() * (z[1] - z[0]), 3),
  });
  const massOf = (h: Vec3): number => Math.round(8 * h.x * h.y * h.z * tuning.density);

  // Large parts lie roughly flat; medium parts land any way up.
  let columns = new SpawnColumns();
  const large: Pending[] = [];
  for (let i = 0; i < tuning.large; i += 1) {
    const { x, z } = randomSpot();
    const h = box([1, 1.8], [0.55, 1.05], [0.8, 1.4]);
    large.push(spawn(columns, x, z, 2, h, yawTilt(random() * Math.PI, (random() - 0.5) * 0.3), massOf(h)));
  }
  settle('large', large);

  columns = new SpawnColumns();
  const medium: Pending[] = [];
  for (let i = 0; i < tuning.medium; i += 1) {
    const { x, z } = randomSpot();
    const h = box([0.35, 0.7], [0.22, 0.42], [0.3, 0.6]);
    medium.push(spawn(columns, x, z, 1, h, randomQuat(random), massOf(h)));
  }
  settle('medium', medium);

  // Heaps of small pieces poured over most parts, then a light scatter everywhere.
  const spots: { x: number; z: number }[] = [];
  for (const part of parts) {
    if (random() > tuning.heapShare) continue;
    const reach = Math.max(part.h.x, part.h.z);
    const count = Math.round(4 * part.h.x * part.h.z * tuning.heapDensity * (0.6 + random() * 0.6));
    for (let i = 0; i < count; i += 1) {
      // Most of the heap lands on the part itself, the rest spills around it.
      const radius = random() < tuning.heapOnTop ? reach * 0.85 : reach + tuning.heapSpread;
      const angle = random() * Math.PI * 2;
      const r = Math.sqrt(random()) * radius;
      const x = part.x + Math.cos(angle) * r;
      const z = part.z + Math.sin(angle) * r;
      if (inMound(x, z)) spots.push({ x, z });
    }
  }
  for (let i = 0; i < tuning.scattered; i += 1) spots.push(randomSpot());
  for (let start = 0; start < spots.length; start += tuning.smallWave) {
    columns = new SpawnColumns();
    const wave = spots.slice(start, start + tuning.smallWave).map(({ x, z }) => {
      const h = box([0.08, 0.15], [0.05, 0.1], [0.08, 0.15]);
      return spawn(columns, x, z, 0, h, randomQuat(random), round(0.8 + random() * 1.4, 1));
    });
    settle(`small ${start / tuning.smallWave + 1}`, wave);
  }

  // Starter spill at the foot of the mountain, toward the yard (owner feedback 2026-10-30).
  columns = new SpawnColumns();
  const foot: Pending[] = [];
  for (const cx of [-15, -9, -3, 3, 9, 15]) {
    const cz = mountainFootZ(cx, 2.2);
    for (let i = 0; i < tuning.footPerSpill; i += 1) {
      const x = cx + (random() - 0.5) * 4.5;
      const z = cz + (random() - 0.5) * 2.5;
      const h = box([0.08, 0.14], [0.05, 0.1], [0.08, 0.14]);
      foot.push(spawn(columns, x, z, 0, h, randomQuat(random), round(0.8 + random() * 1.4, 1)));
    }
  }
  settle('foot', foot, tuning.footKeepLimit);

  // Joint passes: every small piece settles again together, as dynamic bodies. Waves froze earlier pieces as fixed
  // supports; once woken in the game those supports can give, so the layout must hold with all of them dynamic.
  // The last pass should barely move anything (its worst move is reported as the bake's stability evidence).
  for (let pass = 1; pass <= tuning.jointPasses; pass += 1) {
    const smalls = frozenSmall.splice(0);
    const records = new Set(smalls.map(({ record }) => record));
    const others = kept.filter((record) => !records.has(record));
    kept.length = 0;
    kept.push(...others);
    const pending = smalls.map(({ handle, piece, record }) => {
      physics.removeBody(handle);
      return {
        ...piece,
        handle: physics.addBox({
          kind: 'dynamic',
          position: { x: record.p[0], y: record.p[1], z: record.p[2] },
          rotation: { x: record.q[0], y: record.q[1], z: record.q[2], w: record.q[3] },
          halfExtents: piece.h,
          massKg: piece.k,
          canSleep: false,
        }),
      };
    });
    settle(`joint ${pass}`, pending, tuning.footKeepLimit);
  }

  return { format: 1, seed: tuning.seed, materials, pieces: kept };
}
