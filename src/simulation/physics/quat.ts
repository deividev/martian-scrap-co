import type { Quat, Vec3 } from './physicsPort';

export const IDENTITY_QUAT: Quat = Object.freeze({ x: 0, y: 0, z: 0, w: 1 });

/** Heading around +Y in radians (0 faces -Z, the Three.js forward). */
export function yawOf(q: Quat): number {
  return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.x * q.x + q.y * q.y));
}

export function yawQuat(yaw: number): Quat {
  return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
}

/** Wraps an angle to (-π, π]. */
export function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/** Rotates a vector by a unit quaternion. */
export function rotateVec(q: Quat, v: Vec3): Vec3 {
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return {
    x: v.x + q.w * tx + (q.y * tz - q.z * ty),
    y: v.y + q.w * ty + (q.z * tx - q.x * tz),
    z: v.z + q.w * tz + (q.x * ty - q.y * tx),
  };
}

/** Angle between the body's up axis and world up, in radians. */
export function tiltOf(q: Quat): number {
  const up = rotateVec(q, { x: 0, y: 1, z: 0 });
  return Math.acos(Math.max(-1, Math.min(1, up.y)));
}
