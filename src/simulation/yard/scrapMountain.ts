import { contentId, type ContentId, type EntityId, type EntityIdAllocator } from '../../domain/ids';
import type { TargetCandidate } from '../collection/targeting';
import { BoundsGrid, boxBounds, mayRestOn, type Bounds } from '../physics/boxSupport';
import type { PhysicsBodyHandle, PhysicsWorldPort, Quat, Vec3 } from '../physics/physicsPort';
import type { ScrapClusterSpec, ScrapPieceSpec } from '../scrap/scrapField';
import type { BakedMountain } from './mountainBake';
import bakedMountainText from './scrapMountain.baked.json?raw';

/**
 * The giant scrap mountain built from real material pieces (owner follow-up R4, 2026-10-30): large and medium
 * parts buried under heaps of small pieces, every piece with its own collider. The layout is settled offline
 * with the game's physics (`mountainBake.ts`, owner check 2026-10-30: nothing may overlap, float or fall when
 * approached) and committed as data, so a save only needs the ids that changed.
 *
 * - Large parts are fixed until cut into small pieces; medium parts are fixed until grabbed, broken or cut,
 *   when they become ordinary props. A part can only be worked while no large part rests on it (`exposed`);
 *   medium parts resting on it are freed as falling props when it leaves, and small pieces resting on it wake.
 * - Small pieces are solid scrap: fixed while dormant, dynamic only once something disturbs them.
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
  /** Medium or large parts this one rests on. */
  readonly restsOn: readonly EntityId[];
}

export interface ScrapMountainLayout {
  readonly pieces: readonly MountainPieceSpec[];
  readonly smallClusters: readonly ScrapClusterSpec[];
}

export const SCRAP_MOUNTAIN_TUNING = Object.freeze({
  /**
   * Grid cell grouping small pieces into clusters (save structure and collider streaming). Small enough that loading
   * one cluster's colliders stays a few hundred bodies on the dense mountain.
   */
  clusterCell: 6,
});

/** Spatial bucket size for aim queries. */
const BUCKET = 4;

/** Reads the committed bake (`npm run bake:mountain`). */
export function parseBakedMountain(text: string): BakedMountain {
  const data = JSON.parse(text) as BakedMountain;
  if (data.format !== 1 || !Array.isArray(data.pieces)) throw new Error('Unsupported scrap mountain data');
  return data;
}

let defaultBake: BakedMountain | null = null;

/** Builds the mountain from the settled bake; ids are allocated in data order, so they are stable. */
export function createScrapMountainLayout(
  allocator: EntityIdAllocator,
  baked: BakedMountain = (defaultBake ??= parseBakedMountain(bakedMountainText)),
): ScrapMountainLayout {
  const pieces: MountainPieceSpec[] = [];
  const clusters = new Map<string, ScrapPieceSpec[]>();
  const parts = new BoundsGrid<number>();
  const bounds: Bounds[] = [];
  for (const piece of baked.pieces) {
    const id = allocator.allocate();
    const materialId = contentId(baked.materials[piece.m] ?? 'ferrous');
    const position = { x: piece.p[0], y: piece.p[1], z: piece.p[2] };
    const rotation = { x: piece.q[0], y: piece.q[1], z: piece.q[2], w: piece.q[3] };
    const halfExtents = { x: piece.h[0], y: piece.h[1], z: piece.h[2] };
    if (piece.s === 0) {
      const cell = SCRAP_MOUNTAIN_TUNING.clusterCell;
      const key = `${Math.floor(position.x / cell)}:${Math.floor(position.z / cell)}`;
      const list = clusters.get(key) ?? [];
      list.push({ id, materialId, position, rotation, halfExtents, massKg: piece.k });
      clusters.set(key, list);
      continue;
    }
    const box = boxBounds({ position, rotation, halfExtents });
    const index = pieces.length;
    // Parts settled in order, so a part can only rest on earlier ones.
    const restsOn = [...parts.near(box, 0.1)]
      .filter((below) => {
        const lower = bounds[below];
        return lower !== undefined && mayRestOn(box, lower);
      })
      .map((below) => pieces[below]?.id)
      .filter((below): below is EntityId => below !== undefined);
    pieces.push({
      id,
      materialId,
      size: piece.s === 2 ? 'large' : 'medium',
      variant: piece.v,
      position,
      rotation,
      halfExtents,
      massKg: piece.k,
      restsOn,
    });
    bounds.push(box);
    parts.set(index, box);
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
