import RAPIER from '@dimforge/rapier3d-compat';
import { PHYSICS_CONVENTIONS } from './conventions';
import type {
  BoxBodySpec,
  CharacterHandle,
  CharacterMoveResult,
  CharacterSpec,
  PhysicsBodyHandle,
  PhysicsWorldPort,
  Quat,
  RayHit,
  Vec3,
} from './physicsPort';

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

  interface Character {
    readonly body: RAPIER.RigidBody;
    readonly collider: RAPIER.Collider;
    readonly controller: RAPIER.KinematicCharacterController;
  }
  const characters = new Map<CharacterHandle, Character>();
  const characterOf = (handle: CharacterHandle): Character => {
    const character = characters.get(handle);
    if (!character) throw new RangeError(`Unknown character ${handle}`);
    return character;
  };

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
      if (spec.rotation) {
        const { x, y, z, w } = spec.rotation;
        if (![x, y, z, w].every(Number.isFinite)) throw new RangeError('rotation must be finite');
        bodyDesc.setRotation({ x, y, z, w });
      }
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

    isSleeping(handle: PhysicsBodyHandle): boolean {
      return bodyOf(handle).isSleeping();
    },

    setLinearVelocity(handle: PhysicsBodyHandle, velocity: Vec3): void {
      assertFiniteVec('velocity', velocity);
      bodyOf(handle).setLinvel(velocity, true);
    },

    setAngularVelocity(handle: PhysicsBodyHandle, velocity: Vec3): void {
      assertFiniteVec('angular velocity', velocity);
      bodyOf(handle).setAngvel(velocity, true);
    },

    setBodyPose(handle: PhysicsBodyHandle, position: Vec3, rotation: Quat): void {
      assertFiniteVec('position', position);
      if (![rotation.x, rotation.y, rotation.z, rotation.w].every(Number.isFinite)) {
        throw new RangeError('rotation must be finite');
      }
      const body = bodyOf(handle);
      body.setTranslation(position, true);
      body.setRotation(rotation, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    },

    setGravityScale(handle: PhysicsBodyHandle, scale: number): void {
      if (!Number.isFinite(scale) || scale < 0 || scale > 10) throw new RangeError('gravity scale out of range');
      bodyOf(handle).setGravityScale(scale, true);
    },

    setBodyEnabled(handle: PhysicsBodyHandle, enabled: boolean): void {
      bodyOf(handle).setEnabled(enabled);
    },

    bodyLinearVelocity(handle: PhysicsBodyHandle): Vec3 {
      const { x, y, z } = bodyOf(handle).linvel();
      return { x, y, z };
    },

    castRay(origin: Vec3, direction: Vec3, maxDistance: number, excludeCharacter?: CharacterHandle): RayHit | null {
      assertFiniteVec('origin', origin);
      assertFiniteVec('direction', direction);
      const length = Math.hypot(direction.x, direction.y, direction.z);
      if (length === 0) throw new RangeError('direction must be non-zero');
      const dir = { x: direction.x / length, y: direction.y / length, z: direction.z / length };
      const excluded = excludeCharacter === undefined ? undefined : characterOf(excludeCharacter).collider;
      const hit = world.castRay(new RAPIER.Ray(origin, dir), maxDistance, true, undefined, undefined, excluded);
      const body = hit?.collider.parent();
      return hit && body ? { body: body.handle as PhysicsBodyHandle, distance: hit.timeOfImpact } : null;
    },

    createCharacter(spec: CharacterSpec): CharacterHandle {
      assertFiniteVec('position', spec.position);
      const values = [spec.radius, spec.halfHeight, spec.maxSlopeDegrees, spec.stepHeight, spec.snapDistance];
      if (!values.every((value) => Number.isFinite(value) && value > 0)) {
        throw new RangeError('character dimensions must be positive');
      }
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(spec.position.x, spec.position.y, spec.position.z),
      );
      const collider = world.createCollider(RAPIER.ColliderDesc.capsule(spec.halfHeight, spec.radius), body);
      const controller = world.createCharacterController(0.02);
      controller.setUp({ x: 0, y: 1, z: 0 });
      controller.setSlideEnabled(true);
      controller.setMaxSlopeClimbAngle((spec.maxSlopeDegrees * Math.PI) / 180);
      controller.setMinSlopeSlideAngle((spec.maxSlopeDegrees * Math.PI) / 180);
      controller.enableAutostep(spec.stepHeight, spec.radius * 0.5, false);
      controller.enableSnapToGround(spec.snapDistance);
      controller.setApplyImpulsesToDynamicBodies(true);
      const handle = body.handle as CharacterHandle;
      characters.set(handle, { body, collider, controller });
      return handle;
    },

    moveCharacter(handle: CharacterHandle, desired: Vec3): CharacterMoveResult {
      assertFiniteVec('desired', desired);
      const { body, collider, controller } = characterOf(handle);
      controller.computeColliderMovement(collider, desired);
      const movement = controller.computedMovement();
      const current = body.translation();
      const position = { x: current.x + movement.x, y: current.y + movement.y, z: current.z + movement.z };
      body.setNextKinematicTranslation(position);
      return { position, grounded: controller.computedGrounded() };
    },

    teleportCharacter(handle: CharacterHandle, position: Vec3): void {
      assertFiniteVec('position', position);
      const { body } = characterOf(handle);
      body.setTranslation(position, true);
      body.setNextKinematicTranslation(position);
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
      for (const { controller } of characters.values()) world.removeCharacterController(controller);
      characters.clear();
      world.free();
    },
  };
}
