import { contentId, type ContentId, type EntityId, type EntityIdAllocator } from '../../domain/ids';
import { mulberry32 } from '../benchmark/denseYardFixture';
import type { TargetCandidate } from '../collection/targeting';
import type { PhysicsBodyHandle, PhysicsWorldPort, Quat, Vec3 } from '../physics/physicsPort';
import type { ScrapClusterSpec } from '../scrap/scrapField';
import { SCRAP_MOUNTAIN, mountainHeight } from './backdrop';

/**
 * The giant scrap mountain built from real material pieces (owner follow-up R4, 2026-10-30): large and medium
 * parts stacked on the mountain core with small pieces scattered over them, every piece with its own
 * collider. Layout is deterministic from a seed, so a save only needs the ids that changed.
 *
 * - Large parts are fixed until cut into small pieces; medium parts are fixed until grabbed, broken or cut,
 *   when they become ordinary props. A part can only be worked while no large part rests on it (`exposed`);
 *   medium parts resting on it are freed as falling props when it leaves (owner check 2026-10-30: parts on top
 *   of a large part are out of reach from the ground), so nothing is ever left floating.
 * - Small pieces are solid scrap clusters: fixed while dormant, dynamic and collectable when the player is near.
 */

export type MountainSize = 'medium' | 'large';

export interface MountainPieceSpec {
  readonly id: EntityId;
  readonly materialId: ContentId;
  readonly size: MountainSize;
  readonly variant: number;
  readonly position: Vec3;
  readonly rotation: Quat;
  readonly halfExtents: Vec3;
  readonly massKg: number;
  /** Pieces (medium or large) this one rests on. */
  readonly restsOn: readonly EntityId[];
}

export interface ScrapMountainLayout {
  readonly pieces: readonly MountainPieceSpec[];
  readonly smallClusters: readonly ScrapClusterSpec[];
}

/** Material mix of the mountain (placeholder): iron dominates, every material is present. */
const MATERIAL_MIX: readonly (readonly [string, number])[] = [
  ['ferrous', 0.38],
  ['aluminum', 0.16],
  ['copper', 0.11],
  ['polymer', 0.15],
  ['heliofoil', 0.1],
  ['regolith-ceramic', 0.1],
];

/** First-pass mountain tuning; counts and sizes are placeholders checked against the MSC-019 budgets. */
export const SCRAP_MOUNTAIN_TUNING = Object.freeze({
  largeSpacing: 2.3,
  mediumSpacing: 1.9,
  smallSpacing: 1.9,
  /** Kilograms per cubic meter of collider box (hollow, stylized scrap). */
  density: 140,
  /** Grid cell for small-piece clusters (activation by distance). */
  clusterCell: 9,
  /** Keep a clear ring around the buried station so it stays readable. */
  stationClearance: 9.5,
});

const CELL = 0.5;
/** Spatial bucket size for aim queries. */
const BUCKET = 4;

function pickMaterial(random: () => number): ContentId {
  let roll = random();
  for (const [id, weight] of MATERIAL_MIX) {
    roll -= weight;
    if (roll <= 0) return contentId(id);
  }
  return contentId('ferrous');
}

function yawQuat(yaw: number, tilt = 0): Quat {
  // Yaw about Y followed by a small tilt about X.
  const cy = Math.cos(yaw / 2);
  const sy = Math.sin(yaw / 2);
  const cx = Math.cos(tilt / 2);
  const sx = Math.sin(tilt / 2);
  return { x: cy * sx, y: sy * cx, z: -sy * sx, w: cy * cx };
}

/** Height grid over the mountain footprint: current top surface and which piece forms it. */
class SurfaceGrid {
  readonly #cols: number;
  readonly #rows: number;
  readonly #minX: number;
  readonly #minZ: number;
  readonly #top: Float32Array;
  readonly #owner: (EntityId | null)[];

  constructor(station: { x: number; z: number; radius: number } | null) {
    this.#minX = SCRAP_MOUNTAIN.center.x - SCRAP_MOUNTAIN.radiusX;
    this.#minZ = SCRAP_MOUNTAIN.center.z - SCRAP_MOUNTAIN.radiusZ;
    this.#cols = Math.ceil((SCRAP_MOUNTAIN.radiusX * 2) / CELL);
    this.#rows = Math.ceil((SCRAP_MOUNTAIN.radiusZ * 2) / CELL);
    this.#top = new Float32Array(this.#cols * this.#rows);
    this.#owner = new Array<EntityId | null>(this.#cols * this.#rows).fill(null);
    for (let r = 0; r < this.#rows; r += 1) {
      for (let c = 0; c < this.#cols; c += 1) {
        const x = this.#minX + (c + 0.5) * CELL;
        const z = this.#minZ + (r + 0.5) * CELL;
        const core = mountainHeight(x, z) * SCRAP_MOUNTAIN.colliderScale;
        const nearStation = station && Math.hypot(x - station.x, z - station.z) < station.radius;
        this.#top[r * this.#cols + c] = nearStation ? Number.NaN : core;
      }
    }
  }

  #cells(x: number, z: number, hx: number, hz: number): number[] {
    const c0 = Math.max(0, Math.floor((x - hx - this.#minX) / CELL));
    const c1 = Math.min(this.#cols - 1, Math.floor((x + hx - this.#minX) / CELL));
    const r0 = Math.max(0, Math.floor((z - hz - this.#minZ) / CELL));
    const r1 = Math.min(this.#rows - 1, Math.floor((z + hz - this.#minZ) / CELL));
    const cells: number[] = [];
    for (let r = r0; r <= r1; r += 1) for (let c = c0; c <= c1; c += 1) cells.push(r * this.#cols + c);
    return cells;
  }

  /** Base height under a footprint and the pieces forming it; null over the station clearance. */
  base(x: number, z: number, hx: number, hz: number): { height: number; owners: EntityId[] } | null {
    const cells = this.#cells(x, z, hx, hz);
    if (cells.length === 0) return null;
    let height = -Infinity;
    for (const cell of cells) {
      const top = this.#top[cell] ?? Number.NaN;
      if (Number.isNaN(top)) return null;
      height = Math.max(height, top);
    }
    const owners = new Set<EntityId>();
    for (const cell of cells) {
      const owner = this.#owner[cell];
      if (owner && (this.#top[cell] ?? 0) > height - 0.15) owners.add(owner);
    }
    return { height, owners: [...owners] };
  }

  raise(x: number, z: number, hx: number, hz: number, top: number, owner: EntityId | null): void {
    for (const cell of this.#cells(x, z, hx * 0.9, hz * 0.9)) {
      if ((this.#top[cell] ?? 0) < top) {
        this.#top[cell] = top;
        this.#owner[cell] = owner;
      }
    }
  }
}

function insideMound(x: number, z: number, limit: number): boolean {
  const dx = (x - SCRAP_MOUNTAIN.center.x) / SCRAP_MOUNTAIN.radiusX;
  const dz = (z - SCRAP_MOUNTAIN.center.z) / SCRAP_MOUNTAIN.radiusZ;
  return Math.hypot(dx, dz) < limit;
}

/** Builds the deterministic mountain layout: large, then medium parts, then small pieces on top. */
export function createScrapMountainLayout(
  allocator: EntityIdAllocator,
  station: { x: number; z: number; radius: number } | null,
  seed = 5,
): ScrapMountainLayout {
  const random = mulberry32(seed);
  const tuning = SCRAP_MOUNTAIN_TUNING;
  const grid = new SurfaceGrid(station ? { ...station, radius: tuning.stationClearance } : null);
  const pieces: MountainPieceSpec[] = [];
  const minX = SCRAP_MOUNTAIN.center.x - SCRAP_MOUNTAIN.radiusX;
  const maxX = SCRAP_MOUNTAIN.center.x + SCRAP_MOUNTAIN.radiusX;
  const minZ = SCRAP_MOUNTAIN.center.z - SCRAP_MOUNTAIN.radiusZ;
  const maxZ = SCRAP_MOUNTAIN.center.z + SCRAP_MOUNTAIN.radiusZ;

  /**
   * `maxRise` caps how far above the core a part may sit, so parts never pile into walls: the slope follows the
   * mountain shape and the rim stays low enough to work from the ground.
   */
  const layer = (
    size: MountainSize,
    spacing: number,
    half: (r: () => number) => Vec3,
    limit: number,
    maxRise: number,
  ): void => {
    for (let z = minZ; z <= maxZ; z += spacing) {
      for (let x = minX; x <= maxX; x += spacing) {
        const px = x + (random() - 0.5) * spacing * 0.8;
        const pz = z + (random() - 0.5) * spacing * 0.8;
        if (!insideMound(px, pz, limit)) continue;
        const h = half(random);
        const yaw = random() * Math.PI;
        // Footprint of the yawed box, conservatively as its bounding square.
        const reach = Math.max(h.x, h.z);
        // Parts may interlock at their edges like a real pile: support is read under the inner footprint.
        const base = grid.base(px, pz, reach * 0.55, reach * 0.55);
        if (!base) continue;
        const core = mountainHeight(px, pz) * SCRAP_MOUNTAIN.colliderScale;
        if (base.height - core > maxRise) continue;
        const embed = h.y * 0.25;
        const id = allocator.allocate();
        const materialId = pickMaterial(random);
        pieces.push({
          id,
          materialId,
          size,
          variant: Math.floor(random() * 8),
          position: { x: px, y: base.height + h.y - embed, z: pz },
          rotation: yawQuat(yaw, (random() - 0.5) * 0.24),
          halfExtents: h,
          massKg: Math.round(8 * h.x * h.y * h.z * tuning.density),
          restsOn: base.owners,
        });
        grid.raise(px, pz, reach * 0.7, reach * 0.7, base.height + h.y * 2 - embed, id);
      }
    }
  };

  layer(
    'large',
    tuning.largeSpacing,
    (r) => ({ x: 1.0 + r() * 0.8, y: 0.55 + r() * 0.5, z: 0.8 + r() * 0.6 }),
    0.92,
    0.5,
  );
  layer(
    'medium',
    tuning.mediumSpacing,
    (r) => ({ x: 0.35 + r() * 0.35, y: 0.22 + r() * 0.2, z: 0.3 + r() * 0.3 }),
    0.98,
    2.3,
  );

  // Small pieces resting on top, grouped in grid cells so they wake by area.
  const clusters = new Map<string, ScrapClusterSpec['pieces'][number][]>();
  for (let z = minZ; z <= maxZ; z += tuning.smallSpacing) {
    for (let x = minX; x <= maxX; x += tuning.smallSpacing) {
      const px = x + (random() - 0.5) * tuning.smallSpacing;
      const pz = z + (random() - 0.5) * tuning.smallSpacing;
      if (!insideMound(px, pz, 0.99)) continue;
      const h = { x: 0.08 + random() * 0.07, y: 0.05 + random() * 0.05, z: 0.08 + random() * 0.07 };
      const base = grid.base(px, pz, h.x, h.z);
      if (!base) continue;
      const key = `${Math.floor(px / tuning.clusterCell)}:${Math.floor(pz / tuning.clusterCell)}`;
      const list = clusters.get(key) ?? [];
      list.push({
        id: allocator.allocate(),
        materialId: pickMaterial(random),
        position: { x: px, y: base.height + h.y + 0.02, z: pz },
        halfExtents: h,
        massKg: Math.round((0.8 + random() * 1.4) * 10) / 10,
      });
      clusters.set(key, list);
    }
  }
  const smallClusters: ScrapClusterSpec[] = [...clusters].map(([key, list]) => ({
    id: `pile-${key}`,
    pieces: list,
    decorativeInstances: 0,
    solid: true,
  }));
  return { pieces, smallClusters };
}

export type MountainPieceState = 'embedded' | 'released' | 'removed';

/** A part leaving the pile and the medium parts that were resting on it (now free to fall). */
export interface MountainLeave {
  readonly piece: MountainPieceSpec;
  readonly freed: readonly MountainPieceSpec[];
}

/**
 * Medium and large mountain parts while they are still part of the pile: fixed colliders, exposure rules and
 * hand-off to the prop/breakable systems when the player works them.
 */
export class ScrapMountain {
  readonly #physics: PhysicsWorldPort;
  readonly #specs = new Map<EntityId, MountainPieceSpec>();
  readonly #state = new Map<EntityId, MountainPieceState>();
  readonly #bodies = new Map<EntityId, PhysicsBodyHandle>();
  readonly #restingOn = new Map<EntityId, EntityId[]>();
  readonly #buckets = new Map<string, EntityId[]>();
  #version = 0;

  constructor(physics: PhysicsWorldPort, pieces: readonly MountainPieceSpec[]) {
    this.#physics = physics;
    for (const piece of pieces) {
      this.#specs.set(piece.id, piece);
      this.#state.set(piece.id, 'embedded');
      this.#bodies.set(
        piece.id,
        physics.addBox({
          kind: 'fixed',
          position: piece.position,
          halfExtents: piece.halfExtents,
          rotation: piece.rotation,
        }),
      );
      for (const below of piece.restsOn) {
        const list = this.#restingOn.get(below) ?? [];
        list.push(piece.id);
        this.#restingOn.set(below, list);
      }
      const key = this.#bucket(piece.position.x, piece.position.z);
      const bucket = this.#buckets.get(key) ?? [];
      bucket.push(piece.id);
      this.#buckets.set(key, bucket);
    }
  }

  /** Changes whenever a piece leaves the pile (views rebuild their instances). */
  get version(): number {
    return this.#version;
  }

  pieces(): readonly MountainPieceSpec[] {
    return [...this.#specs.values()];
  }

  piece(id: EntityId): MountainPieceSpec | undefined {
    return this.#specs.get(id);
  }

  state(id: EntityId): MountainPieceState | undefined {
    return this.#state.get(id);
  }

  isMountainPiece(id: EntityId): boolean {
    return this.#state.get(id) === 'embedded';
  }

  /** True when no embedded large part rests on this one (medium parts on top just fall when it leaves). */
  exposed(id: EntityId): boolean {
    return this.blockers(id).length === 0;
  }

  /** Embedded large parts that block this one. */
  blockers(id: EntityId): EntityId[] {
    return (this.#restingOn.get(id) ?? []).filter(
      (above) => this.#state.get(above) === 'embedded' && this.#specs.get(above)?.size === 'large',
    );
  }

  /** Embedded parts near a point, as aim candidates. */
  targetsNear(point: Vec3, radius: number): TargetCandidate[] {
    const out: TargetCandidate[] = [];
    const span = Math.ceil(radius / BUCKET) + 1;
    const bx = Math.floor(point.x / BUCKET);
    const bz = Math.floor(point.z / BUCKET);
    for (let dz = -span; dz <= span; dz += 1) {
      for (let dx = -span; dx <= span; dx += 1) {
        for (const id of this.#buckets.get(`${bx + dx}:${bz + dz}`) ?? []) {
          const spec = this.#specs.get(id);
          const body = this.#bodies.get(id);
          if (!spec || body === undefined || this.#state.get(id) !== 'embedded') continue;
          const distance = Math.hypot(spec.position.x - point.x, spec.position.y - point.y, spec.position.z - point.z);
          if (distance - Math.max(spec.halfExtents.x, spec.halfExtents.z) <= radius) {
            // Aim at the point of the (unrotated) box nearest the viewer, so big parts are in reach.
            const clamp = (value: number, center: number, half: number): number =>
              Math.min(center + half * 0.8, Math.max(center - half * 0.8, value));
            out.push({
              id,
              body,
              position: {
                x: clamp(point.x, spec.position.x, spec.halfExtents.x),
                y: clamp(point.y, spec.position.y, spec.halfExtents.y),
                z: clamp(point.z, spec.position.z, spec.halfExtents.z),
              },
            });
          }
        }
      }
    }
    return out;
  }

  /**
   * Takes an exposed part out of the pile (to become a prop). `freed` lists the medium parts that rested on it,
   * directly or through each other; they leave the pile too and must become falling props.
   */
  release(id: EntityId): MountainLeave | null {
    return this.#leave(id, 'released');
  }

  /** Removes an exposed part for good (cut into small pieces); `freed` as for `release`. */
  remove(id: EntityId): MountainLeave | null {
    return this.#leave(id, 'removed');
  }

  /** Ids that left the pile, for a save (the layout itself is regenerated from its seed). */
  changed(): { readonly released: EntityId[]; readonly removed: EntityId[] } {
    const released: EntityId[] = [];
    const removed: EntityId[] = [];
    for (const [id, state] of this.#state) {
      if (state === 'released') released.push(id);
      else if (state === 'removed') removed.push(id);
    }
    return { released, removed };
  }

  #leave(id: EntityId, next: Exclude<MountainPieceState, 'embedded'>): MountainLeave | null {
    const piece = this.#specs.get(id);
    if (!piece || this.#state.get(id) !== 'embedded' || !this.exposed(id)) return null;
    this.#take(id, next);
    const freed: MountainPieceSpec[] = [];
    const queue = [id];
    while (queue.length > 0) {
      const below = queue.shift();
      for (const above of below === undefined ? [] : (this.#restingOn.get(below) ?? [])) {
        const spec = this.#specs.get(above);
        if (!spec || spec.size !== 'medium' || this.#state.get(above) !== 'embedded') continue;
        this.#take(above, 'released');
        freed.push(spec);
        queue.push(above);
      }
    }
    this.#version += 1;
    return { piece, freed };
  }

  #take(id: EntityId, next: Exclude<MountainPieceState, 'embedded'>): void {
    const body = this.#bodies.get(id);
    if (body !== undefined) this.#physics.removeBody(body);
    this.#bodies.delete(id);
    this.#state.set(id, next);
  }

  #bucket(x: number, z: number): string {
    return `${Math.floor(x / BUCKET)}:${Math.floor(z / BUCKET)}`;
  }
}
