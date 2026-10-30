import type { EntityId } from '../../domain/ids';
import type { CharacterHandle, PhysicsBodyHandle, PhysicsWorldPort, Vec3 } from '../physics/physicsPort';

export interface TargetCandidate {
  readonly id: EntityId;
  readonly body: PhysicsBodyHandle;
  readonly position: Vec3;
}

/** Normalized aim ray from the camera. */
export interface AimRay {
  readonly origin: Vec3;
  readonly direction: Vec3;
}

/** First-pass reach assist (PRD-005 feel contract): generous cone, short range, never through walls. */
export const TARGETING = Object.freeze({
  reachMeters: 3.5,
  coneDegrees: 14,
});

export interface TargetPick {
  readonly candidate: TargetCandidate;
  readonly distance: number;
  /** Angle from the aim direction in radians. */
  readonly angle: number;
}

/**
 * Picks the candidate closest to the aim direction (then nearest) inside reach and cone, with a
 * clear line of sight: the first thing the ray toward the candidate hits must be the candidate.
 */
export function pickTarget(
  aim: AimRay,
  candidates: Iterable<TargetCandidate>,
  physics: PhysicsWorldPort,
  self?: CharacterHandle,
): TargetPick | null {
  const cosLimit = Math.cos((TARGETING.coneDegrees * Math.PI) / 180);
  let best: TargetPick | null = null;
  for (const candidate of candidates) {
    const dx = candidate.position.x - aim.origin.x;
    const dy = candidate.position.y - aim.origin.y;
    const dz = candidate.position.z - aim.origin.z;
    const distance = Math.hypot(dx, dy, dz);
    if (distance === 0 || distance > TARGETING.reachMeters) continue;
    const cos = (dx * aim.direction.x + dy * aim.direction.y + dz * aim.direction.z) / distance;
    if (cos < cosLimit) continue;
    const angle = Math.acos(Math.min(1, cos));
    if (best && (angle > best.angle + 1e-6 || (Math.abs(angle - best.angle) <= 1e-6 && distance >= best.distance))) {
      continue;
    }
    const hit = physics.castRay(aim.origin, { x: dx, y: dy, z: dz }, distance + 0.5, self);
    if (hit?.body !== candidate.body) continue;
    best = { candidate, distance, angle };
  }
  return best;
}
