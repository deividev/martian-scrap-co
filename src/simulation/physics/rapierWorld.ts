import RAPIER from '@dimforge/rapier3d-compat';
import { PHYSICS_CONVENTIONS } from './conventions';
import type { BoxBodySpec, PhysicsBodyHandle, PhysicsWorldPort, Quat, RayHit, Vec3 } from './physicsPort';

let initPromise: Promise<void> | null = null;

/** Loads the Rapier WASM module once per process. */
export function initRapier(): Promise<void> {
  initPromise ??= RAPIER.init();
  return initPromise;
}

export interface RapierWorldOptions {
  readonly gravity?: number;
  readonly fixedStepSeconds?: number;
}

function assertFiniteVec(name: string, value: Vec3): void {
  if (![value.x, value.y, value.z].every(Number.isFinite)) throw new RangeError(`${name} must be finite`);
}

export async function createRapierWorld(options: RapierWorldOptions = {}): Promise<PhysicsWorldPort> {
  await initRapier();
  const gravity = options.gravity ?? PHYSICS_CONVENTIONS.marsGravity;
  const fixedStepSeconds = options.fixedStepSeconds ?? PHYSICS_CONVENTIONS.fixedStepSeconds;
  const world = new RAPIER.World({ x: 0, y: -gravity, z: 0 });
  world.timestep = fixedStepSeconds;

  const bodyOf = (handle: PhysicsBodyHandle): RAPIER.RigidBody => {
    const body = world.getRigidBody(handle);
    if (!body) throw new RangeError(`Unknown physics body ${handle}`);
    return body;
  };

  return {
    engine: `rapier3d-compat ${RAPIER.version()}`,
    fixedStepSeconds,

    addBox(spec: BoxBodySpec): PhysicsBodyHandle {
      assertFiniteVec('position', spec.position);
      assertFiniteVec('halfExtents', spec.halfExtents);
      const { x: hx, y: hy, z: hz } = spec.halfExtents;
      if (hx <= 0 || hy <= 0 || hz <= 0) throw new RangeError('halfExtents must be positive');
      const bodyDesc = spec.kind === 'fixed' ? RAPIER.RigidBodyDesc.fixed() : RAPIER.RigidBodyDesc.dynamic();
      bodyDesc.setTranslation(spec.position.x, spec.position.y, spec.position.z);
      const body = world.createRigidBody(bodyDesc);
      const colliderDesc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
        .setFriction(spec.friction ?? 0.7)
        .setRestitution(spec.restitution ?? 0.05);
      if (spec.kind === 'dynamic' && spec.massKg !== undefined) {
        if (!Number.isFinite(spec.massKg) || spec.massKg <= 0) throw new RangeError('massKg must be positive');
        colliderDesc.setMass(spec.massKg);
      }
      world.createCollider(colliderDesc, body);
      return body.handle as PhysicsBodyHandle;
    },

    removeBody(handle: PhysicsBodyHandle): void {
      world.removeRigidBody(bodyOf(handle));
    },

    step(): void {
      world.step();
    },

    bodyPosition(handle: PhysicsBodyHandle): Vec3 {
      const { x, y, z } = bodyOf(handle).translation();
      return { x, y, z };
    },

    bodyRotation(handle: PhysicsBodyHandle): Quat {
      const { x, y, z, w } = bodyOf(handle).rotation();
      return { x, y, z, w };
    },

    castRay(origin: Vec3, direction: Vec3, maxDistance: number): RayHit | null {
      assertFiniteVec('origin', origin);
      assertFiniteVec('direction', direction);
      const length = Math.hypot(direction.x, direction.y, direction.z);
      if (length === 0) throw new RangeError('direction must be non-zero');
      const dir = { x: direction.x / length, y: direction.y / length, z: direction.z / length };
      const hit = world.castRay(new RAPIER.Ray(origin, dir), maxDistance, true);
      const body = hit?.collider.parent();
      return hit && body ? { body: body.handle as PhysicsBodyHandle, distance: hit.timeOfImpact } : null;
    },

    bodyCount(): number {
      return world.bodies.len();
    },

    awakeBodyCount(): number {
      let awake = 0;
      world.forEachActiveRigidBody(() => (awake += 1));
      return awake;
    },

    dispose(): void {
      world.free();
    },
  };
}
