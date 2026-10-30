import type { EntityId } from '../../domain/ids';
import type { TargetPick } from '../collection/targeting';
import type { PhysicsWorldPort, Vec3 } from '../physics/physicsPort';
import { wrapAngle as wrap, yawOf, yawQuat } from '../physics/quat';
import { PLAYER_TUNING } from '../player/playerController';
import type { ClaimRegistry, HolderId } from './claims';
import type { MediumPropSet } from './mediumProps';

/** First-pass grip feel; reviewed at MSC-020. */
export const GRIP_TUNING = Object.freeze({
  holdDistance: 1.6,
  /** Hold point sits this far below the eye so the object stays readable in first person. */
  holdDrop: 0.45,
  followGain: 12,
  maxFollowSpeed: 8,
  yawGain: 10,
  rotateStepRadians: Math.PI / 4,
  /** Placement is refused if the object is held back this far from the hold point by an obstacle. */
  maxPlacementOffset: 0.6,
});

export type GrabResult =
  | { readonly ok: true; readonly id: EntityId }
  | { readonly ok: false; readonly reason: 'nothing' | 'claimed' | 'already-holding' };

export type PlaceResult =
  | { readonly ok: true; readonly id: EntityId }
  | { readonly ok: false; readonly reason: 'not-holding' | 'blocked' | 'overlaps-player' };

/**
 * Medium-object grip (MSC-016). The held object stays a physical body steered toward a hold point,
 * so it cannot pass through walls or props. Only the claim holder can move or place it.
 */
export class GripController {
  readonly #physics: PhysicsWorldPort;
  readonly #props: MediumPropSet;
  readonly #claims: ClaimRegistry;
  readonly #holder: HolderId;
  #held: EntityId | null = null;
  #yawOffset = 0;
  #holdPoint: Vec3 | null = null;

  constructor(physics: PhysicsWorldPort, props: MediumPropSet, claims: ClaimRegistry, holder: HolderId) {
    this.#physics = physics;
    this.#props = props;
    this.#claims = claims;
    this.#holder = holder;
  }

  get held(): EntityId | null {
    return this.#held;
  }

  tryGrab(pick: TargetPick | null, playerYaw: number): GrabResult {
    if (this.#held !== null) return { ok: false, reason: 'already-holding' };
    const prop = pick ? this.#props.get(pick.candidate.id) : undefined;
    if (!prop) return { ok: false, reason: 'nothing' };
    if (!this.#claims.claim(prop.id, this.#holder)) return { ok: false, reason: 'claimed' };
    const rotation = this.#physics.bodyRotation(prop.body);
    // Keep the object's current heading relative to the player, but stand it upright.
    this.#yawOffset = wrap(yawOf(rotation) - playerYaw);
    this.#physics.setBodyPose(prop.body, this.#physics.bodyPosition(prop.body), yawQuat(playerYaw + this.#yawOffset));
    this.#physics.setGravityScale(prop.body, 0);
    this.#held = prop.id;
    return { ok: true, id: prop.id };
  }

  rotate(direction: 1 | -1): void {
    if (this.#held !== null) this.#yawOffset = wrap(this.#yawOffset + direction * GRIP_TUNING.rotateStepRadians);
  }

  /** Steers the held object toward the hold point in front of the camera. */
  fixedUpdate(eye: Vec3, playerYaw: number): void {
    const prop = this.#held === null ? undefined : this.#props.get(this.#held);
    if (!prop) return;
    const target: Vec3 = {
      x: eye.x - Math.sin(playerYaw) * GRIP_TUNING.holdDistance,
      y: eye.y - GRIP_TUNING.holdDrop,
      z: eye.z - Math.cos(playerYaw) * GRIP_TUNING.holdDistance,
    };
    this.#holdPoint = target;
    const position = this.#physics.bodyPosition(prop.body);
    let velocity = {
      x: (target.x - position.x) * GRIP_TUNING.followGain,
      y: (target.y - position.y) * GRIP_TUNING.followGain,
      z: (target.z - position.z) * GRIP_TUNING.followGain,
    };
    const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
    if (speed > GRIP_TUNING.maxFollowSpeed) {
      const scale = GRIP_TUNING.maxFollowSpeed / speed;
      velocity = { x: velocity.x * scale, y: velocity.y * scale, z: velocity.z * scale };
    }
    this.#physics.setLinearVelocity(prop.body, velocity);
    const yawError = wrap(playerYaw + this.#yawOffset - yawOf(this.#physics.bodyRotation(prop.body)));
    this.#physics.setAngularVelocity(prop.body, { x: 0, y: yawError * GRIP_TUNING.yawGain, z: 0 });
  }

  /** Places the held object where it is. Refuses (and keeps holding) if the spot is invalid. */
  tryPlace(playerPosition: Vec3): PlaceResult {
    const prop = this.#held === null ? undefined : this.#props.get(this.#held);
    if (!prop) return { ok: false, reason: 'not-holding' };
    const position = this.#physics.bodyPosition(prop.body);
    if (this.#holdPoint) {
      const offset = Math.hypot(
        position.x - this.#holdPoint.x,
        position.y - this.#holdPoint.y,
        position.z - this.#holdPoint.z,
      );
      if (offset > GRIP_TUNING.maxPlacementOffset) return { ok: false, reason: 'blocked' };
    }
    const horizontal = Math.hypot(position.x - playerPosition.x, position.z - playerPosition.z);
    const verticalGap = Math.abs(position.y - playerPosition.y);
    const radius = this.#props.radiusOf(prop.id);
    if (
      horizontal < radius + PLAYER_TUNING.radius &&
      verticalGap < radius + PLAYER_TUNING.halfHeight + PLAYER_TUNING.radius
    ) {
      return { ok: false, reason: 'overlaps-player' };
    }
    this.#release(prop.id);
    return { ok: true, id: prop.id };
  }

  /** Safe release without validation (disconnect, removal, session end). */
  forceRelease(): EntityId | null {
    const id = this.#held;
    if (id !== null) this.#release(id);
    return id;
  }

  #release(id: EntityId): void {
    const prop = this.#props.get(id);
    if (prop) {
      this.#physics.setLinearVelocity(prop.body, { x: 0, y: 0, z: 0 });
      this.#physics.setAngularVelocity(prop.body, { x: 0, y: 0, z: 0 });
      this.#physics.setGravityScale(prop.body, 1);
    }
    this.#claims.release(id, this.#holder);
    this.#held = null;
    this.#holdPoint = null;
  }
}
