import type { AssemblyState, Chunk, CutResult } from '../../domain/assembly';
import type { EntityId, TransactionId } from '../../domain/ids';
import type { AimRay } from '../collection/targeting';
import type { CharacterHandle, PhysicsBodyHandle, PhysicsWorldPort, Quat, Vec3 } from '../physics/physicsPort';
import { IDENTITY_QUAT, rotateVec } from '../physics/quat';
import type { MediumPropSet } from './mediumProps';

/** Authored world placement of each fragment and joint of one assembly. */
export interface AssemblyLayout {
  readonly fragments: Readonly<Record<string, { readonly position: Vec3; readonly halfExtents: Vec3 }>>;
  readonly joints: Readonly<Record<string, Vec3>>;
  readonly fragmentNames: Readonly<Record<string, string>>;
}

export const CUTTER_TUNING = Object.freeze({
  reachMeters: 2.6,
  coneDegrees: 8,
});

/**
 * Physical side of a cuttable assembly (MSC-018). Anchored fragments are fixed bodies; each chunk the
 * domain releases becomes one medium prop whose box covers its fragments. Split chunks are replaced.
 */
export class AssemblyBody {
  readonly #physics: PhysicsWorldPort;
  readonly #props: MediumPropSet;
  readonly #state: AssemblyState;
  readonly #layout: AssemblyLayout;
  readonly #fixed = new Map<string, PhysicsBodyHandle>();

  constructor(physics: PhysicsWorldPort, props: MediumPropSet, state: AssemblyState, layout: AssemblyLayout) {
    this.#physics = physics;
    this.#props = props;
    this.#state = state;
    this.#layout = layout;
    for (const fragmentId of state.anchoredFragments()) {
      const placement = layout.fragments[fragmentId];
      if (!placement) throw new Error(`Missing layout for fragment ${fragmentId}`);
      this.#fixed.set(
        fragmentId,
        physics.addBox({ kind: 'fixed', position: placement.position, halfExtents: placement.halfExtents }),
      );
    }
    for (const chunk of state.chunks()) this.#spawn(chunk, null);
  }

  get state(): AssemblyState {
    return this.#state;
  }

  isFixedBody(handle: PhysicsBodyHandle): boolean {
    return [...this.#fixed.values()].includes(handle);
  }

  /** World position of a joint that is still attached to the anchored structure. */
  jointPosition(jointId: string): Vec3 | null {
    const joint = this.#state.definition.joints.find((candidate) => candidate.id === jointId);
    const position = this.#layout.joints[jointId];
    if (!joint || !position || this.#state.isCut(jointId)) return null;
    const anchored = this.#state.anchoredFragments();
    return joint.between.some((fragment) => anchored.includes(fragment)) ? position : null;
  }

  /** Picks the uncut joint closest to the aim, within reach and a narrow cone, with nothing in front. */
  pickJoint(aim: AimRay, self?: CharacterHandle): { jointId: string; available: boolean } | null {
    const cosLimit = Math.cos((CUTTER_TUNING.coneDegrees * Math.PI) / 180);
    const available = new Set(this.#state.availableJoints());
    let best: { jointId: string; cos: number } | null = null;
    for (const joint of this.#state.definition.joints) {
      const position = this.jointPosition(joint.id);
      if (!position) continue;
      const d = { x: position.x - aim.origin.x, y: position.y - aim.origin.y, z: position.z - aim.origin.z };
      const distance = Math.hypot(d.x, d.y, d.z);
      if (distance === 0 || distance > CUTTER_TUNING.reachMeters) continue;
      const cos = (d.x * aim.direction.x + d.y * aim.direction.y + d.z * aim.direction.z) / distance;
      if (cos < cosLimit || (best && cos <= best.cos)) continue;
      const hit = this.#physics.castRay(aim.origin, d, distance + 0.5, self);
      if (hit && hit.distance < distance - 0.25) continue;
      best = { jointId: joint.id, cos };
    }
    return best ? { jointId: best.jointId, available: available.has(best.jointId) } : null;
  }

  /** Applies a cut transaction and mirrors created/retired chunks in the physics world. */
  cut(jointId: string, txn: TransactionId): CutResult {
    const before = new Set(this.#state.chunks().map((chunk) => chunk.entityId));
    const result = this.#state.cut(jointId, txn);
    if (!result.ok) return result;
    const parents = new Map<EntityId, { position: Vec3; rotation: Quat; center: Vec3 }>();
    for (const retired of result.retired) {
      const prop = this.#props.get(retired);
      const chunk = { fragments: result.created.flatMap((created) => created.fragments) };
      if (prop) {
        parents.set(retired, {
          position: this.#physics.bodyPosition(prop.body),
          rotation: this.#physics.bodyRotation(prop.body),
          center: this.#bounds(chunk.fragments).center,
        });
      }
      this.#props.remove(retired);
    }
    for (const created of result.created) {
      // Only spawn chunks this call created (a retried transaction returns the old result).
      if (before.has(created.entityId) || this.#props.get(created.entityId)) continue;
      const parent = result.retired.length > 0 ? (parents.get(result.retired[0] as EntityId) ?? null) : null;
      this.#spawn(created, parent);
    }
    return result;
  }

  #bounds(fragments: readonly string[]): { center: Vec3; halfExtents: Vec3 } {
    let min = { x: Infinity, y: Infinity, z: Infinity };
    let max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const id of fragments) {
      const placement = this.#layout.fragments[id];
      if (!placement) continue;
      const { position: p, halfExtents: h } = placement;
      min = { x: Math.min(min.x, p.x - h.x), y: Math.min(min.y, p.y - h.y), z: Math.min(min.z, p.z - h.z) };
      max = { x: Math.max(max.x, p.x + h.x), y: Math.max(max.y, p.y + h.y), z: Math.max(max.z, p.z + h.z) };
    }
    return {
      center: { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 },
      halfExtents: { x: (max.x - min.x) / 2, y: (max.y - min.y) / 2, z: (max.z - min.z) / 2 },
    };
  }

  #spawn(chunk: Chunk, parent: { position: Vec3; rotation: Quat; center: Vec3 } | null): void {
    for (const fragmentId of chunk.fragments) {
      const fixed = this.#fixed.get(fragmentId);
      if (fixed !== undefined) {
        this.#physics.removeBody(fixed);
        this.#fixed.delete(fragmentId);
      }
    }
    const { center, halfExtents } = this.#bounds(chunk.fragments);
    let position = center;
    let rotation = IDENTITY_QUAT;
    if (parent) {
      // Keep the piece where it currently is inside the moved parent chunk.
      const offset = rotateVec(parent.rotation, {
        x: center.x - parent.center.x,
        y: center.y - parent.center.y,
        z: center.z - parent.center.z,
      });
      position = { x: parent.position.x + offset.x, y: parent.position.y + offset.y, z: parent.position.z + offset.z };
      rotation = parent.rotation;
    }
    const definition = this.#state.definition;
    const massKg = chunk.fragments.reduce(
      (total, id) => total + (definition.fragments.find((fragment) => fragment.id === id)?.massKg ?? 0),
      0,
    );
    const first = definition.fragments.find((fragment) => fragment.id === chunk.fragments[0]);
    if (!first) return;
    this.#props.add(
      {
        id: chunk.entityId,
        materialId: first.materialId,
        displayName: chunk.fragments.map((id) => this.#layout.fragmentNames[id] ?? id).join(' + '),
        position,
        halfExtents,
        massKg,
      },
      rotation,
    );
  }
}
