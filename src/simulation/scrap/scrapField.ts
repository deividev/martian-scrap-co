import type { ContentId, EntityId } from '../../domain/ids';
import { BoundsGrid, boxBounds, mayRestOn, type Bounds, type PosedBox } from '../physics/boxSupport';
import type { PhysicsBodyHandle, PhysicsWorldPort, Quat, Vec3 } from '../physics/physicsPort';

/**
 * Lifecycle of an interactable scrap piece (architecture §3):
 * - `dormant`: identity and pose are known, no dynamic body (cheap, saved). Pieces of a `solid` cluster keep a
 *   fixed collider while dormant so they are still real obstacles (scrap mountain, owner follow-up R4).
 * - `active`: has a physics body because its cluster is being worked, or (solid clusters) because something
 *   disturbed it: the collector, the player, or the piece it rested on moving away (`disturb`).
 * - `removed`: collected, sold or consumed. Terminal; the id is never reused or re-created.
 * Decorative aggregate mass is not a piece at all: it is a per-cluster visual count.
 */
export type ScrapState = 'dormant' | 'active' | 'removed';

export interface ScrapPieceSpec {
  readonly id: EntityId;
  readonly materialId: ContentId;
  readonly position: Vec3;
  readonly halfExtents: Vec3;
  readonly massKg: number;
  /** Resting orientation; identity when omitted. */
  readonly rotation?: Quat;
}

export interface ScrapPiece extends ScrapPieceSpec {
  readonly state: ScrapState;
  readonly rotation: Quat;
}

export interface ScrapClusterSpec {
  readonly id: string;
  readonly pieces: readonly ScrapPieceSpec[];
  /** Visual-only instances that make the mountain look dense; never simulated. */
  readonly decorativeInstances: number;
  /** Dormant pieces keep a fixed collider (they never stop being solid); default false. */
  readonly solid?: boolean;
}

/** Persistent form: no physics handles, only durable identity, state and pose. */
export interface ScrapFieldSnapshot {
  readonly clusters: readonly {
    readonly id: string;
    readonly decorativeInstances: number;
    readonly solid?: boolean;
    readonly pieces: readonly ScrapPiece[];
  }[];
}

export interface ScrapFieldMetrics {
  readonly dormant: number;
  readonly active: number;
  readonly removed: number;
  readonly decorativeInstances: number;
  readonly physicsBodies: number;
  /** Fixed colliders held by dormant pieces of solid clusters (never awake). */
  readonly solidDormant: number;
  readonly awakeBodies: number;
}

const IDENTITY: Quat = { x: 0, y: 0, z: 0, w: 1 };
/** Clusters within this distance of an awake piece of a solid cluster stay loaded, meters. */
const AWAKE_SUPPORT_REACH = 2;

interface ClusterRecord {
  readonly id: string;
  readonly pieceIds: readonly EntityId[];
  readonly solid: boolean;
  /** Solid clusters hold fixed colliders only while loaded (near a player, see `streamSolids`). */
  loaded: boolean;
  /** Ground-plane extent of the cluster's pieces as laid out (streaming distance). */
  readonly area: { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number };
  decorativeInstances: number;
}

export class ScrapField {
  readonly #physics: PhysicsWorldPort;
  readonly #pieces = new Map<EntityId, ScrapPiece>();
  readonly #clusters = new Map<string, ClusterRecord>();
  /** Transient mapping for active pieces only; rebuilt on activation, never saved. */
  readonly #bodies = new Map<EntityId, PhysicsBodyHandle>();
  /** Fixed colliders of dormant pieces in solid clusters; transient like `#bodies`. */
  readonly #solidBodies = new Map<EntityId, PhysicsBodyHandle>();
  readonly #clusterOf = new Map<EntityId, string>();
  /** Dormant pieces of solid clusters by bounds, to find what rests on a piece that moves. */
  readonly #resting = new BoundsGrid<EntityId>();
  readonly #listeners = new Set<(id: EntityId) => void>();
  /** Collider changes of loaded/unloaded clusters not applied yet (spread over frames, see `pumpSolids`). */
  readonly #solidQueue = new Map<EntityId, 'add' | 'drop'>();
  #version = 0;

  constructor(physics: PhysicsWorldPort, source: readonly ScrapClusterSpec[] | ScrapFieldSnapshot) {
    this.#physics = physics;
    const clusters = Array.isArray(source)
      ? (source as readonly ScrapClusterSpec[])
      : (source as ScrapFieldSnapshot).clusters;
    for (const cluster of clusters) this.addCluster(cluster);
  }

  /**
   * Adds a cluster (initial yard content, a restored save, or pieces released by breaking a medium
   * object). Duplicate cluster or piece ids are rejected, so identities are never reused.
   */
  addCluster(cluster: ScrapClusterSpec | ScrapFieldSnapshot['clusters'][number]): void {
    if (this.#clusters.has(cluster.id)) throw new Error(`Duplicate cluster ${cluster.id}`);
    if (!Number.isInteger(cluster.decorativeInstances) || cluster.decorativeInstances < 0) {
      throw new RangeError(`Invalid decorative count in ${cluster.id}`);
    }
    for (const piece of cluster.pieces) {
      if (this.#pieces.has(piece.id)) throw new Error(`Duplicate scrap piece ${piece.id}`);
    }
    const pieceIds: EntityId[] = [];
    for (const piece of cluster.pieces) {
      // Restored snapshots keep their state; fresh specs start dormant. Active is never persisted.
      const saved = 'state' in piece ? piece : null;
      this.#pieces.set(piece.id, {
        ...piece,
        state: saved?.state === 'removed' ? 'removed' : 'dormant',
        rotation: piece.rotation ?? IDENTITY,
      });
      pieceIds.push(piece.id);
      this.#clusterOf.set(piece.id, cluster.id);
    }
    const solid = cluster.solid === true;
    const xs = cluster.pieces.map((piece) => piece.position.x);
    const zs = cluster.pieces.map((piece) => piece.position.z);
    this.#clusters.set(cluster.id, {
      id: cluster.id,
      pieceIds,
      solid,
      loaded: solid,
      area: { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) },
      decorativeInstances: cluster.decorativeInstances,
    });
    if (solid) for (const id of pieceIds) this.#makeSolid(id);
  }

  /** The cluster a piece belongs to. */
  clusterOf(id: EntityId): string | undefined {
    return this.#clusterOf.get(id);
  }

  /**
   * Cluster ids with the average position of their remaining pieces (for distance-based activation). Solid clusters
   * stream by `streamSolids` instead, so callers can leave them out (`solid: false`; the dense mountain has thousands
   * of pieces to average).
   */
  clusterCenters(filter: { readonly solid?: boolean } = {}): { id: string; x: number; z: number; remaining: number }[] {
    const clusters = [...this.#clusters.values()].filter(
      (cluster) => filter.solid === undefined || cluster.solid === filter.solid,
    );
    return clusters.map((cluster) => {
      let x = 0;
      let z = 0;
      let remaining = 0;
      for (const id of cluster.pieceIds) {
        const piece = this.#pieces.get(id);
        if (!piece || piece.state === 'removed') continue;
        x += piece.position.x;
        z += piece.position.z;
        remaining += 1;
      }
      return { id: cluster.id, x: remaining ? x / remaining : 0, z: remaining ? z / remaining : 0, remaining };
    });
  }

  piece(id: EntityId): ScrapPiece | undefined {
    return this.#pieces.get(id);
  }

  bodyOf(id: EntityId): PhysicsBodyHandle | undefined {
    return this.#bodies.get(id);
  }

  /** Changes whenever a piece wakes, returns to dormant or is removed (views redraw only then). */
  get version(): number {
    return this.#version;
  }

  /** Calls `listener` with the id of every piece that wakes, returns to dormant or is removed; returns unsubscribe. */
  onStateChange(listener: (id: EntityId) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Collider changes `streamSolids` queued and has not applied yet. */
  get pendingSolids(): number {
    return this.#solidQueue.size;
  }

  /** Number of pieces with a dynamic body. */
  get activeCount(): number {
    return this.#bodies.size;
  }

  /**
   * Pieces near a point as aim candidates: active pieces with their live body, and dormant pieces of solid clusters
   * with their fixed collider (they wake when pulled, see `disturb`).
   */
  targetsNear(point: Vec3, radius: number): { id: EntityId; body: PhysicsBodyHandle; position: Vec3 }[] {
    const out: { id: EntityId; body: PhysicsBodyHandle; position: Vec3 }[] = [];
    const within = (position: Vec3): boolean =>
      Math.hypot(position.x - point.x, position.y - point.y, position.z - point.z) <= radius;
    for (const target of this.activeTargets()) if (within(target.position)) out.push(target);
    const area = {
      min: { x: point.x - radius, y: point.y - radius, z: point.z - radius },
      max: { x: point.x + radius, y: point.y + radius, z: point.z + radius },
    };
    for (const id of this.#resting.near(area)) {
      const piece = this.#pieces.get(id);
      const body = this.#solidBodies.get(id);
      if (piece && body !== undefined && within(piece.position)) out.push({ id, body, position: piece.position });
    }
    return out;
  }

  /**
   * A piece is about to move (pulled, pushed or left without support): a dormant piece of a solid cluster gets a
   * dynamic body, and every dormant piece resting on it wakes too, transitively, so nothing is left floating.
   * Returns how many pieces woke.
   */
  disturb(id: EntityId): number {
    const piece = this.#pieces.get(id);
    if (!piece || piece.state === 'removed') return 0;
    let woken = 0;
    const queue: EntityId[] = [id];
    const seen = new Set<EntityId>(queue);
    while (queue.length > 0) {
      const next = queue.shift();
      if (next === undefined) break;
      if (this.#wake(next)) woken += 1;
      const bounds = this.#boundsOf(next);
      if (!bounds) continue;
      for (const above of this.#restingOn(bounds)) {
        if (seen.has(above)) continue;
        seen.add(above);
        queue.push(above);
      }
    }
    return woken;
  }

  /** Wakes the dormant pieces resting on a box that leaves (a mountain part cut or taken out). */
  wakeAbove(box: PosedBox): number {
    let woken = 0;
    for (const id of this.#restingOn(boxBounds(box))) woken += this.disturb(id);
    return woken;
  }

  /** Wakes dormant pieces touching a region (the player walking through a heap); returns how many woke. */
  disturbWithin(region: Bounds): number {
    let woken = 0;
    for (const id of this.#resting.near(region)) {
      const bounds = this.#boundsOf(id);
      if (
        bounds &&
        bounds.min.x <= region.max.x &&
        bounds.max.x >= region.min.x &&
        bounds.min.y <= region.max.y &&
        bounds.max.y >= region.min.y &&
        bounds.min.z <= region.max.z &&
        bounds.max.z >= region.min.z
      ) {
        woken += this.disturb(id);
      }
    }
    return woken;
  }

  /**
   * Returns disturbed pieces of solid clusters to dormant once they sleep and are farther than `minDistance`
   * from `point`, keeping their settled pose (active-piece budget). `keep` pieces stay awake (being pulled).
   */
  settleFar(point: Vec3, minDistance: number, keep: ReadonlySet<EntityId> = new Set()): number {
    let settled = 0;
    for (const [id, handle] of [...this.#bodies]) {
      const clusterId = this.#clusterOf.get(id);
      if (keep.has(id) || clusterId === undefined || !this.#clusters.get(clusterId)?.solid) continue;
      if (!this.#physics.isSleeping(handle)) continue;
      const position = this.#physics.bodyPosition(handle);
      if (Math.hypot(position.x - point.x, position.z - point.z) <= minDistance) continue;
      this.#sleep(id, handle);
      settled += 1;
    }
    return settled;
  }

  /**
   * Physics streaming for solid clusters: each fixed collider costs simulation time even at rest, and a dormant
   * piece far from every player cannot be touched by anything, so clusters keep their colliders only within
   * `radius` of a focus point (players), dropping them past `radius + hysteresis`. Returns clusters changed.
   * At most `budget` colliders are added or removed now; the rest wait for `pumpSolids` (one cluster can hold
   * hundreds of pieces, too many to create in one frame).
   */
  streamSolids(focus: readonly Vec3[], radius: number, hysteresis = 6, budget = Infinity): number {
    // Awake pieces of solid clusters keep the colliders around them, so nothing they rest on vanishes under them.
    const awake: Vec3[] = [];
    for (const [id, handle] of this.#bodies) {
      const clusterId = this.#clusterOf.get(id);
      if (clusterId !== undefined && this.#clusters.get(clusterId)?.solid)
        awake.push(this.#physics.bodyPosition(handle));
    }
    let changed = 0;
    for (const cluster of this.#clusters.values()) {
      if (!cluster.solid) continue;
      const { minX, maxX, minZ, maxZ } = cluster.area;
      const away = (point: Vec3): number =>
        Math.hypot(Math.max(minX - point.x, 0, point.x - maxX), Math.max(minZ - point.z, 0, point.z - maxZ));
      let distance = Infinity;
      for (const point of focus) distance = Math.min(distance, away(point));
      for (const point of awake) distance = Math.min(distance, away(point) + radius - AWAKE_SUPPORT_REACH);
      if (!cluster.loaded && distance < radius) {
        cluster.loaded = true;
        for (const id of cluster.pieceIds) this.#solidQueue.set(id, 'add');
        changed += 1;
      } else if (cluster.loaded && distance > radius + hysteresis) {
        cluster.loaded = false;
        for (const id of cluster.pieceIds) this.#solidQueue.set(id, 'drop');
        changed += 1;
      }
    }
    this.pumpSolids(budget);
    return changed;
  }

  /**
   * Applies up to `budget` queued collider changes, additions first (the player may be walking toward them; removals
   * are far away). Returns how many were applied.
   */
  pumpSolids(budget: number): number {
    let applied = 0;
    for (const kind of ['add', 'drop'] as const) {
      for (const [id, queued] of this.#solidQueue) {
        if (applied >= budget) return applied;
        if (queued !== kind) continue;
        this.#solidQueue.delete(id);
        if (kind === 'add') this.#makeSolid(id);
        else this.#dropSolid(id);
        applied += 1;
      }
    }
    return applied;
  }

  /** Active pieces with their body handle and live position (targeting input). */
  activeTargets(): { id: EntityId; body: PhysicsBodyHandle; position: Vec3 }[] {
    return [...this.#bodies].map(([id, body]) => ({ id, body, position: this.#physics.bodyPosition(body) }));
  }

  /** Gives physics bodies to the cluster's dormant pieces. Removed pieces stay removed. */
  activateCluster(clusterId: string): number {
    let created = 0;
    for (const id of this.#cluster(clusterId).pieceIds) if (this.#wake(id)) created += 1;
    return created;
  }

  /** Stores current poses, frees the bodies and returns pieces to dormant. */
  deactivateCluster(clusterId: string): number {
    let freed = 0;
    for (const id of this.#cluster(clusterId).pieceIds) {
      const piece = this.#pieces.get(id);
      const handle = this.#bodies.get(id);
      if (piece?.state !== 'active' || handle === undefined) continue;
      this.#sleep(id, handle);
      freed += 1;
    }
    return freed;
  }

  /** Marks a piece collected/consumed exactly once. Returns false if it was already removed. */
  removePiece(id: EntityId): boolean {
    const piece = this.#pieces.get(id);
    if (!piece) throw new RangeError(`Unknown scrap piece ${id}`);
    if (piece.state === 'removed') return false;
    // Whatever still rests where the piece was must not float.
    const bounds = this.#boundsOf(id);
    const handle = this.#bodies.get(id);
    if (handle !== undefined) {
      this.#physics.removeBody(handle);
      this.#bodies.delete(id);
    }
    this.#dropSolid(id);
    this.#pieces.set(id, { ...piece, state: 'removed' });
    this.#changed(id);
    if (bounds) for (const above of this.#restingOn(bounds)) this.disturb(above);
    const clusterId = this.#clusterOf.get(id);
    const cluster = clusterId === undefined ? undefined : this.#clusters.get(clusterId);
    // A fully cleared cluster also loses its decorative mass, so the cleared area stays cleared.
    if (cluster?.pieceIds.every((pieceId) => this.#pieces.get(pieceId)?.state === 'removed')) {
      cluster.decorativeInstances = 0;
    }
    return true;
  }

  metrics(): ScrapFieldMetrics {
    let dormant = 0;
    let active = 0;
    let removed = 0;
    for (const piece of this.#pieces.values()) {
      if (piece.state === 'dormant') dormant += 1;
      else if (piece.state === 'active') active += 1;
      else removed += 1;
    }
    let decorativeInstances = 0;
    for (const cluster of this.#clusters.values()) decorativeInstances += cluster.decorativeInstances;
    return {
      dormant,
      active,
      removed,
      decorativeInstances,
      physicsBodies: this.#bodies.size,
      solidDormant: this.#solidBodies.size,
      awakeBodies: this.#physics.awakeBodyCount(),
    };
  }

  /** Durable state. Active pieces are saved with their live pose as dormant. */
  snapshot(): ScrapFieldSnapshot {
    return {
      clusters: [...this.#clusters.values()].map((cluster) => ({
        id: cluster.id,
        decorativeInstances: cluster.decorativeInstances,
        ...(cluster.solid ? { solid: true } : {}),
        pieces: cluster.pieceIds.map((id) => {
          const piece = this.#pieces.get(id);
          if (!piece) throw new Error(`Missing piece ${id}`);
          const handle = this.#bodies.get(id);
          if (piece.state !== 'active' || handle === undefined) return piece;
          return {
            ...piece,
            state: 'dormant' as const,
            position: this.#physics.bodyPosition(handle),
            rotation: this.#physics.bodyRotation(handle),
          };
        }),
      })),
    };
  }

  /** Gives a dormant piece its dynamic body; false if it was not dormant. */
  #wake(id: EntityId): boolean {
    const piece = this.#pieces.get(id);
    if (piece?.state !== 'dormant') return false;
    this.#dropSolid(id);
    const handle = this.#physics.addBox({
      kind: 'dynamic',
      position: piece.position,
      halfExtents: piece.halfExtents,
      rotation: piece.rotation,
      massKg: piece.massKg,
    });
    this.#bodies.set(id, handle);
    this.#pieces.set(id, { ...piece, state: 'active' });
    this.#changed(id);
    return true;
  }

  /** Stores the live pose, frees the body and returns the piece to dormant (solid again if its cluster is). */
  #sleep(id: EntityId, handle: PhysicsBodyHandle): void {
    const piece = this.#pieces.get(id);
    if (!piece) return;
    this.#pieces.set(id, {
      ...piece,
      state: 'dormant',
      position: this.#physics.bodyPosition(handle),
      rotation: this.#physics.bodyRotation(handle),
    });
    this.#physics.removeBody(handle);
    this.#bodies.delete(id);
    this.#changed(id);
    const clusterId = this.#clusterOf.get(id);
    if (clusterId !== undefined && this.#clusters.get(clusterId)?.loaded) this.#makeSolid(id);
  }

  /** Current bounds of a piece (live pose while active). */
  #boundsOf(id: EntityId): Bounds | null {
    const piece = this.#pieces.get(id);
    if (!piece) return null;
    const handle = this.#bodies.get(id);
    return boxBounds({
      position: handle === undefined ? piece.position : this.#physics.bodyPosition(handle),
      rotation: handle === undefined ? piece.rotation : this.#physics.bodyRotation(handle),
      halfExtents: piece.halfExtents,
    });
  }

  /** Dormant solid pieces that may rest on the given bounds. */
  #restingOn(lower: Bounds): EntityId[] {
    return [...this.#resting.near(lower, 0.1)].filter((id) => {
      const upper = this.#boundsOf(id);
      return upper !== null && mayRestOn(upper, lower);
    });
  }

  #changed(id: EntityId): void {
    this.#version += 1;
    for (const listener of this.#listeners) listener(id);
  }

  #makeSolid(id: EntityId): void {
    const piece = this.#pieces.get(id);
    if (piece?.state !== 'dormant' || this.#solidBodies.has(id)) return;
    this.#solidBodies.set(
      id,
      this.#physics.addBox({
        kind: 'fixed',
        position: piece.position,
        halfExtents: piece.halfExtents,
        rotation: piece.rotation,
      }),
    );
    this.#resting.set(id, boxBounds(piece));
  }

  #dropSolid(id: EntityId): void {
    const handle = this.#solidBodies.get(id);
    if (handle === undefined) return;
    this.#physics.removeBody(handle);
    this.#solidBodies.delete(id);
    this.#resting.delete(id);
  }

  #cluster(clusterId: string): ClusterRecord {
    const cluster = this.#clusters.get(clusterId);
    if (!cluster) throw new RangeError(`Unknown cluster ${clusterId}`);
    return cluster;
  }
}
