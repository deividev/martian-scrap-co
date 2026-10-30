import type { EntityId } from '../../domain/ids';
import type { PhysicsBodyHandle, PhysicsWorldPort, Quat, Vec3 } from '../physics/physicsPort';
import { rotateVec, tiltOf, wrapAngle, yawOf, yawQuat } from '../physics/quat';
import type { ClaimRegistry, HolderId } from './claims';
import type { MediumPropSet } from './mediumProps';

/** First-pass cart values (PRD-005); capacities and feel are reviewed at MSC-020. */
export const CART_TUNING = Object.freeze({
  halfExtents: { x: 0.6, y: 0.25, z: 0.45 },
  massKg: 40,
  pushDistance: 1.4,
  followGain: 8,
  maxFollowSpeed: 5,
  yawGain: 8,
  maxLoadCount: 4,
  maxLoadMassKg: 60,
  overturnTiltRadians: (60 * Math.PI) / 180,
  overturnSeconds: 1,
  recoveryHeight: -20,
});

export type LoadResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'full' | 'too-heavy' | 'already-loaded' | 'claimed' | 'unknown' };

/** Four load slots on the bed, in cart-local coordinates. */
const SLOTS: readonly { x: number; z: number }[] = [
  { x: -0.3, z: -0.2 },
  { x: 0.3, z: -0.2 },
  { x: -0.3, z: 0.2 },
  { x: 0.3, z: 0.2 },
];

/**
 * Loadable push cart (MSC-017). Loaded props ride on the bed with their bodies disabled, so they
 * travel with the cart and can never fall out or be lost. The cart rights itself after tipping over
 * and returns to its last settled spot if it leaves the yard.
 */
export class Cart {
  readonly id: EntityId;
  readonly body: PhysicsBodyHandle;
  readonly #physics: PhysicsWorldPort;
  readonly #props: MediumPropSet;
  readonly #claims: ClaimRegistry;
  readonly #loads: EntityId[] = [];
  #tippedFor = 0;
  #lastSettled: { position: Vec3; rotation: Quat };
  #recoveries = 0;

  constructor(physics: PhysicsWorldPort, props: MediumPropSet, claims: ClaimRegistry, id: EntityId, position: Vec3) {
    this.#physics = physics;
    this.#props = props;
    this.#claims = claims;
    this.id = id;
    this.body = physics.addBox({
      kind: 'dynamic',
      position,
      halfExtents: CART_TUNING.halfExtents,
      massKg: CART_TUNING.massKg,
      friction: 0.4,
    });
    this.#lastSettled = { position, rotation: yawQuat(0) };
  }

  get loads(): readonly EntityId[] {
    return this.#loads;
  }

  get recoveries(): number {
    return this.#recoveries;
  }

  get loadMassKg(): number {
    return this.#loads.reduce((total, id) => total + (this.#props.get(id)?.massKg ?? 0), 0);
  }

  pusher(): HolderId | undefined {
    return this.#claims.holderOf(this.id);
  }

  startPush(holder: HolderId): boolean {
    return this.#claims.claim(this.id, holder);
  }

  stopPush(holder: HolderId): boolean {
    return this.#claims.release(this.id, holder);
  }

  /** Whether a point lies over the cart bed (used to decide that a placed prop goes into the cart). */
  isOverBed(point: Vec3): boolean {
    const position = this.#physics.bodyPosition(this.body);
    const yaw = yawOf(this.#physics.bodyRotation(this.body));
    const local = rotateVec(yawQuat(-yaw), { x: point.x - position.x, y: 0, z: point.z - position.z });
    const top = position.y + CART_TUNING.halfExtents.y;
    return (
      Math.abs(local.x) <= CART_TUNING.halfExtents.x &&
      Math.abs(local.z) <= CART_TUNING.halfExtents.z &&
      point.y >= top - 0.1 &&
      point.y <= top + 1
    );
  }

  /** Loads an unclaimed prop. The cart claims it so nobody can grab it while it rides. */
  load(propId: EntityId): LoadResult {
    const prop = this.#props.get(propId);
    if (!prop) return { ok: false, reason: 'unknown' };
    if (this.#loads.includes(propId)) return { ok: false, reason: 'already-loaded' };
    if (this.#loads.length >= CART_TUNING.maxLoadCount) return { ok: false, reason: 'full' };
    if (this.loadMassKg + prop.massKg > CART_TUNING.maxLoadMassKg) return { ok: false, reason: 'too-heavy' };
    if (!this.#claims.claim(propId, this.#cartHolder)) return { ok: false, reason: 'claimed' };
    this.#physics.setBodyEnabled(prop.body, false);
    this.#loads.push(propId);
    this.#carryLoads();
    return { ok: true };
  }

  /** Puts every load back in the world beside the cart and returns their ids. */
  unloadAll(): EntityId[] {
    const position = this.#physics.bodyPosition(this.body);
    const yaw = yawOf(this.#physics.bodyRotation(this.body));
    const unloaded = this.#loads.splice(0);
    unloaded.forEach((id, index) => {
      const prop = this.#props.get(id);
      if (!prop) return;
      // Line the loads up along the cart's right side, clear of the bed.
      const side = rotateVec(yawQuat(yaw), {
        x: CART_TUNING.halfExtents.x + 0.6,
        y: 0,
        z: -0.6 + index * 0.5,
      });
      this.#physics.setBodyPose(
        prop.body,
        { x: position.x + side.x, y: position.y + 0.3 + prop.halfExtents.y, z: position.z + side.z },
        yawQuat(yaw),
      );
      this.#physics.setBodyEnabled(prop.body, true);
      this.#physics.setGravityScale(prop.body, 1);
      this.#claims.release(id, this.#cartHolder);
    });
    return unloaded;
  }

  /** Steers the cart when pushed, carries loads and applies tip-over and out-of-bounds recovery. */
  fixedUpdate(dt: number, push?: { readonly holder: HolderId; readonly eye: Vec3; readonly yaw: number }): void {
    const position = this.#physics.bodyPosition(this.body);
    const rotation = this.#physics.bodyRotation(this.body);

    if (position.y < CART_TUNING.recoveryHeight) {
      this.#recover(this.#lastSettled.position, yawOf(this.#lastSettled.rotation));
      return;
    }

    const tilt = tiltOf(rotation);
    this.#tippedFor = tilt > CART_TUNING.overturnTiltRadians ? this.#tippedFor + dt : 0;
    if (this.#tippedFor >= CART_TUNING.overturnSeconds) {
      this.#recover({ x: position.x, y: position.y + 0.5, z: position.z }, yawOf(rotation));
      return;
    }

    if (push && this.pusher() === push.holder) {
      const target = {
        x: push.eye.x - Math.sin(push.yaw) * CART_TUNING.pushDistance,
        z: push.eye.z - Math.cos(push.yaw) * CART_TUNING.pushDistance,
      };
      let vx = (target.x - position.x) * CART_TUNING.followGain;
      let vz = (target.z - position.z) * CART_TUNING.followGain;
      const speed = Math.hypot(vx, vz);
      if (speed > CART_TUNING.maxFollowSpeed) {
        vx *= CART_TUNING.maxFollowSpeed / speed;
        vz *= CART_TUNING.maxFollowSpeed / speed;
      }
      const vy = this.#physics.bodyLinearVelocity(this.body).y;
      this.#physics.setLinearVelocity(this.body, { x: vx, y: vy, z: vz });
      const yawError = wrapAngle(push.yaw - yawOf(rotation));
      this.#physics.setAngularVelocity(this.body, { x: 0, y: yawError * CART_TUNING.yawGain, z: 0 });
    } else if (tilt < 0.1 && this.#physics.isSleeping(this.body)) {
      this.#lastSettled = { position, rotation };
    }

    this.#carryLoads();
  }

  get #cartHolder(): HolderId {
    return `cart:${this.id}`;
  }

  #carryLoads(): void {
    const position = this.#physics.bodyPosition(this.body);
    const rotation = this.#physics.bodyRotation(this.body);
    this.#loads.forEach((id, index) => {
      const prop = this.#props.get(id);
      const slot = SLOTS[index];
      if (!prop || !slot) return;
      const offset = rotateVec(rotation, {
        x: slot.x,
        y: CART_TUNING.halfExtents.y + prop.halfExtents.y + 0.02,
        z: slot.z,
      });
      this.#physics.setBodyPose(
        prop.body,
        { x: position.x + offset.x, y: position.y + offset.y, z: position.z + offset.z },
        rotation,
      );
    });
  }

  #recover(position: Vec3, yaw: number): void {
    this.#physics.setBodyPose(this.body, { x: position.x, y: position.y + 0.2, z: position.z }, yawQuat(yaw));
    this.#tippedFor = 0;
    this.#recoveries += 1;
    this.#carryLoads();
  }
}
