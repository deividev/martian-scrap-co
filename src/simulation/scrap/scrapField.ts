import type { ContentId, EntityId } from '../../domain/ids';
import type { PhysicsBodyHandle, PhysicsWorldPort, Quat, Vec3 } from '../physics/physicsPort';

/**
 * Lifecycle of an interactable scrap piece (architecture §3):
 * - `dormant`: identity and pose are known, no dynamic body (cheap, saved). Pieces of a `solid` cluster keep a
 *   fixed collider while dormant so they are still real obstacles (scrap mountain, owner follow-up R4).
 * - `active`: has a physics body because its cluster is being worked.
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

interface ClusterRecord {
  readonly id: string;
  readonly pieceIds: readonly EntityId[];
  readonly solid: boolean;
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
        rotation: saved?.rotation ?? IDENTITY,
      });
      pieceIds.push(piece.id);
      this.#clusterOf.set(piece.id, cluster.id);
    }
    const solid = cluster.solid === true;
    this.#clusters.set(cluster.id, {
      id: cluster.id,
      pieceIds,
      solid,
      decorativeInstances: cluster.decorativeInstances,
    });
    if (solid) for (const id of pieceIds) this.#makeSolid(id);
  }

  /** The cluster a piece belongs to. */
  clusterOf(id: EntityId): string | undefined {
    return this.#clusterOf.get(id);
  }

  /** Cluster ids with the average position of their remaining pieces (for distance-based activation). */
  clusterCenters(): { id: string; x: number; z: number; remaining: number }[] {
    return [...this.#clusters.values()].map((cluster) => {
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

  /** Active pieces with their body handle and live position (targeting input). */
  activeTargets(): { id: EntityId; body: PhysicsBodyHandle; position: Vec3 }[] {
    return [...this.#bodies].map(([id, body]) => ({ id, body, position: this.#physics.bodyPosition(body) }));
  }

  /** Gives physics bodies to the cluster's dormant pieces. Removed pieces stay removed. */
  activateCluster(clusterId: string): number {
    let created = 0;
    for (const id of this.#cluster(clusterId).pieceIds) {
      const piece = this.#pieces.get(id);
      if (piece?.state !== 'dormant') continue;
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
      created += 1;
    }
    return created;
  }

  /** Stores current poses, frees the bodies and returns pieces to dormant. */
  deactivateCluster(clusterId: string): number {
    let freed = 0;
    for (const id of this.#cluster(clusterId).pieceIds) {
      const piece = this.#pieces.get(id);
      const handle = this.#bodies.get(id);
      if (piece?.state !== 'active' || handle === undefined) continue;
      this.#pieces.set(id, {
        ...piece,
        state: 'dormant',
        position: this.#physics.bodyPosition(handle),
        rotation: this.#physics.bodyRotation(handle),
      });
      this.#physics.removeBody(handle);
      this.#bodies.delete(id);
      if (this.#clusters.get(clusterId)?.solid) this.#makeSolid(id);
      freed += 1;
    }
    return freed;
  }

  /** Marks a piece collected/consumed exactly once. Returns false if it was already removed. */
  removePiece(id: EntityId): boolean {
    const piece = this.#pieces.get(id);
    if (!piece) throw new RangeError(`Unknown scrap piece ${id}`);
    if (piece.state === 'removed') return false;
    const handle = this.#bodies.get(id);
    if (handle !== undefined) {
      this.#physics.removeBody(handle);
      this.#bodies.delete(id);
    }
    this.#dropSolid(id);
    this.#pieces.set(id, { ...piece, state: 'removed' });
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
  }

  #dropSolid(id: EntityId): void {
    const handle = this.#solidBodies.get(id);
    if (handle === undefined) return;
    this.#physics.removeBody(handle);
    this.#solidBodies.delete(id);
  }

  #cluster(clusterId: string): ClusterRecord {
    const cluster = this.#clusters.get(clusterId);
    if (!cluster) throw new RangeError(`Unknown cluster ${clusterId}`);
    return cluster;
  }
}
