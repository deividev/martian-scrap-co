import type { ActionFrame } from '../../input/actions';
import type { CharacterHandle, PhysicsWorldPort, Vec3 } from '../physics/physicsPort';

/** First-pass movement tuning; feel review at MSC-020. */
export const PLAYER_TUNING = Object.freeze({
  walkSpeed: 4.2,
  /** Under Mars gravity this gives a calm hop of about 0.9 m. */
  jumpSpeed: 2.6,
  radius: 0.35,
  halfHeight: 0.45,
  /** Camera height above the capsule center. */
  eyeOffset: 0.55,
  maxSlopeDegrees: 40,
  stepHeight: 0.3,
  snapDistance: 0.3,
  pitchLimitRadians: (85 * Math.PI) / 180,
  /** Falling below this height returns the player to the last safe ground. */
  recoveryHeight: -20,
  maxFallSpeed: 30,
});

export interface PlayerView {
  readonly position: Vec3;
  readonly eye: Vec3;
  readonly yaw: number;
  readonly pitch: number;
  readonly grounded: boolean;
  readonly recoveries: number;
}

/** Recovery volumes return the player to safe ground without penalty (PRD-008, PRD-022). */
export interface RecoveryZone {
  readonly min: Vec3;
  readonly max: Vec3;
}

const inside = (point: Vec3, zone: RecoveryZone): boolean =>
  point.x >= zone.min.x &&
  point.x <= zone.max.x &&
  point.y >= zone.min.y &&
  point.y <= zone.max.y &&
  point.z >= zone.min.z &&
  point.z <= zone.max.z;

export class PlayerController {
  readonly #physics: PhysicsWorldPort;
  readonly #character: CharacterHandle;
  readonly #gravity: number;
  readonly #recoveryZones: readonly RecoveryZone[];
  #position: Vec3;
  #lastSafe: Vec3;
  #yaw = 0;
  #pitch = 0;
  #verticalVelocity = 0;
  #grounded = false;
  #jumpQueued = false;
  #recoveries = 0;

  constructor(physics: PhysicsWorldPort, spawn: Vec3, gravity: number, recoveryZones: readonly RecoveryZone[] = []) {
    this.#physics = physics;
    this.#gravity = gravity;
    this.#recoveryZones = recoveryZones;
    this.#position = spawn;
    this.#lastSafe = spawn;
    this.#character = physics.createCharacter({
      position: spawn,
      radius: PLAYER_TUNING.radius,
      halfHeight: PLAYER_TUNING.halfHeight,
      maxSlopeDegrees: PLAYER_TUNING.maxSlopeDegrees,
      stepHeight: PLAYER_TUNING.stepHeight,
      snapDistance: PLAYER_TUNING.snapDistance,
    });
  }

  /** The capsule handle, used to keep the player's own body out of aim and support rays. */
  get characterHandle(): CharacterHandle {
    return this.#character;
  }

  /** Applies camera look and queues edge actions; call once per rendered frame. */
  applyLook(frame: ActionFrame): void {
    if (Number.isFinite(frame.look.yaw)) this.#yaw = (this.#yaw + frame.look.yaw) % (Math.PI * 2);
    if (Number.isFinite(frame.look.pitch)) {
      this.#pitch = Math.max(
        -PLAYER_TUNING.pitchLimitRadians,
        Math.min(PLAYER_TUNING.pitchLimitRadians, this.#pitch + frame.look.pitch),
      );
    }
    if (frame.jump) this.#jumpQueued = true;
  }

  /** Advances movement for one fixed step; the physics world must step afterwards. */
  fixedUpdate(move: ActionFrame['move'], dt: number): void {
    const sin = Math.sin(this.#yaw);
    const cos = Math.cos(this.#yaw);
    // Forward is -Z at yaw 0 (Three.js camera convention).
    const vx = (move.x * cos - move.y * sin) * PLAYER_TUNING.walkSpeed;
    const vz = (-move.x * sin - move.y * cos) * PLAYER_TUNING.walkSpeed;

    if (this.#grounded) {
      this.#verticalVelocity = this.#jumpQueued ? PLAYER_TUNING.jumpSpeed : 0;
    } else {
      this.#verticalVelocity = Math.max(this.#verticalVelocity - this.#gravity * dt, -PLAYER_TUNING.maxFallSpeed);
    }
    this.#jumpQueued = false;

    // A small constant downward bias keeps snap-to-ground engaged while walking.
    const vertical = this.#verticalVelocity * dt - (this.#grounded && this.#verticalVelocity === 0 ? 0.02 : 0);
    const result = this.#physics.moveCharacter(this.#character, { x: vx * dt, y: vertical, z: vz * dt });
    this.#position = result.position;
    this.#grounded = result.grounded && this.#verticalVelocity <= 0;
    if (this.#grounded && this.#isFullySupported(result.position)) this.#lastSafe = result.position;

    if (
      this.#position.y < PLAYER_TUNING.recoveryHeight ||
      this.#recoveryZones.some((zone) => inside(this.#position, zone))
    ) {
      this.#recover();
    }
  }

  view(): PlayerView {
    return {
      position: this.#position,
      eye: { x: this.#position.x, y: this.#position.y + PLAYER_TUNING.eyeOffset, z: this.#position.z },
      yaw: this.#yaw,
      pitch: this.#pitch,
      grounded: this.#grounded,
      recoveries: this.#recoveries,
    };
  }

  /** Safe ground means solid support under all four sides of the feet, not a ledge edge. */
  #isFullySupported(position: Vec3): boolean {
    const feetY = position.y - PLAYER_TUNING.halfHeight - PLAYER_TUNING.radius + 0.1;
    const reach = PLAYER_TUNING.radius * 0.9;
    const offsets = [
      { x: reach, z: 0 },
      { x: -reach, z: 0 },
      { x: 0, z: reach },
      { x: 0, z: -reach },
    ];
    return offsets.every(
      (offset) =>
        this.#physics.castRay(
          { x: position.x + offset.x, y: feetY, z: position.z + offset.z },
          { x: 0, y: -1, z: 0 },
          0.4,
          this.#character,
        ) !== null,
    );
  }

  #recover(): void {
    const target = { x: this.#lastSafe.x, y: this.#lastSafe.y + 0.1, z: this.#lastSafe.z };
    this.#physics.teleportCharacter(this.#character, target);
    this.#position = target;
    this.#verticalVelocity = 0;
    this.#recoveries += 1;
  }
}
