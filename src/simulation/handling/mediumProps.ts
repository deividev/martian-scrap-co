import type { ContentId, EntityId } from '../../domain/ids';
import type { PhysicsBodyHandle, PhysicsWorldPort, Quat, Vec3 } from '../physics/physicsPort';
import type { TargetCandidate } from '../collection/targeting';

export interface MediumPropSpec {
  readonly id: EntityId;
  readonly materialId: ContentId;
  readonly displayName: string;
  /** Localization keys of the name parts (a cut chunk lists one per fragment). */
  readonly nameKeys?: readonly string[];
  readonly position: Vec3;
  readonly halfExtents: Vec3;
  readonly massKg: number;
}

export interface MediumProp extends MediumPropSpec {
  readonly body: PhysicsBodyHandle;
}

const IDENTITY: Quat = { x: 0, y: 0, z: 0, w: 1 };
/** Props that fall below this height are returned to their last resting place (PRD-008). */
export const PROP_RECOVERY_HEIGHT = -20;

/** Medium world objects moved by hand, grabber or cart (PRD-005). */
export class MediumPropSet {
  readonly #physics: PhysicsWorldPort;
  readonly #props = new Map<EntityId, MediumProp>();
  readonly #lastRest = new Map<EntityId, { position: Vec3; rotation: Quat }>();

  constructor(physics: PhysicsWorldPort, specs: readonly MediumPropSpec[]) {
    this.#physics = physics;
    for (const spec of specs) this.add(spec);
  }

  /** Adds a prop (e.g. a chunk released by cutting). Ids are never reused. */
  add(spec: MediumPropSpec, rotation: Quat = IDENTITY): MediumProp {
    if (this.#props.has(spec.id)) throw new Error(`Duplicate prop ${spec.id}`);
    const body = this.#physics.addBox({
      kind: 'dynamic',
      position: spec.position,
      halfExtents: spec.halfExtents,
      rotation,
      massKg: spec.massKg,
      friction: 0.8,
    });
    const prop = { ...spec, body };
    this.#props.set(spec.id, prop);
    this.#lastRest.set(spec.id, { position: spec.position, rotation });
    return prop;
  }

  /** Removes a prop that stopped existing as one object (split by a cut, compacted, sold). */
  remove(id: EntityId): void {
    const prop = this.#props.get(id);
    if (!prop) return;
    this.#physics.removeBody(prop.body);
    this.#props.delete(id);
    this.#lastRest.delete(id);
  }

  get(id: EntityId): MediumProp | undefined {
    return this.#props.get(id);
  }

  all(): MediumProp[] {
    return [...this.#props.values()];
  }

  targets(): TargetCandidate[] {
    return this.all().map((prop) => ({
      id: prop.id,
      body: prop.body,
      position: this.#physics.bodyPosition(prop.body),
    }));
  }

  /** Bounding radius used for quick overlap checks against the player capsule. */
  radiusOf(id: EntityId): number {
    const prop = this.#props.get(id);
    if (!prop) throw new RangeError(`Unknown prop ${id}`);
    return Math.hypot(prop.halfExtents.x, prop.halfExtents.y, prop.halfExtents.z);
  }

  /**
   * Records the pose of every settled (sleeping) prop that nobody holds. Only settled, supported
   * poses become recovery points, never the spot where an object was let go.
   */
  recordSettled(held: ReadonlySet<EntityId> = new Set()): void {
    for (const prop of this.#props.values()) {
      if (held.has(prop.id) || !this.#physics.isSleeping(prop.body)) continue;
      const position = this.#physics.bodyPosition(prop.body);
      if (position.y < PROP_RECOVERY_HEIGHT) continue;
      this.#lastRest.set(prop.id, { position, rotation: this.#physics.bodyRotation(prop.body) });
    }
  }

  /** Returns fallen props to their last resting pose; returns the recovered ids. */
  recoverFallen(): EntityId[] {
    const recovered: EntityId[] = [];
    for (const prop of this.#props.values()) {
      if (this.#physics.bodyPosition(prop.body).y >= PROP_RECOVERY_HEIGHT) continue;
      const rest = this.#lastRest.get(prop.id);
      if (!rest) continue;
      this.#physics.setBodyPose(prop.body, { ...rest.position, y: rest.position.y + 0.2 }, rest.rotation);
      recovered.push(prop.id);
    }
    return recovered;
  }
}
