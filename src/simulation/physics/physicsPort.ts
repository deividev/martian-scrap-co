// Engine-neutral physics boundary. Gameplay and presentation depend on this port, never on Rapier types.

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Opaque engine handle. It is a number and deliberately incompatible with domain `EntityId`
 * strings: physics handles are never persisted or used as identity (architecture §2).
 */
export type PhysicsBodyHandle = number & { readonly __physicsHandle: true };

export type BodyKind = 'dynamic' | 'fixed';

export interface BoxBodySpec {
  readonly kind: BodyKind;
  /** Center position in meters. */
  readonly position: Vec3;
  /** Half extents in meters. */
  readonly halfExtents: Vec3;
  /** Unit quaternion; identity when omitted. */
  readonly rotation?: Quat;
  /** Total mass in kilograms (dynamic bodies only). */
  readonly massKg?: number;
  readonly friction?: number;
  readonly restitution?: number;
}

export interface Quat {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

export interface RayHit {
  readonly body: PhysicsBodyHandle;
  /** Distance along the normalized ray direction, in meters. */
  readonly distance: number;
}

export interface PhysicsWorldPort {
  /** Engine name and version, recorded in evidence. */
  readonly engine: string;
  /** Fixed simulation step in seconds. */
  readonly fixedStepSeconds: number;
  addBox(spec: BoxBodySpec): PhysicsBodyHandle;
  removeBody(handle: PhysicsBodyHandle): void;
  /** Advances exactly one fixed step. */
  step(): void;
  bodyPosition(handle: PhysicsBodyHandle): Vec3;
  bodyRotation(handle: PhysicsBodyHandle): Quat;
  castRay(origin: Vec3, direction: Vec3, maxDistance: number): RayHit | null;
  bodyCount(): number;
  awakeBodyCount(): number;
  dispose(): void;
}
