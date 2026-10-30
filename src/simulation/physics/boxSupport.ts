import type { Quat, Vec3 } from './physicsPort';

/** A box collider in the world. */
export interface PosedBox {
  readonly position: Vec3;
  readonly rotation: Quat;
  readonly halfExtents: Vec3;
}

export interface Bounds {
  readonly min: Vec3;
  readonly max: Vec3;
}

/** World-axis bounds of a rotated box. */
export function boxBounds(box: PosedBox): Bounds {
  const { x, y, z, w } = box.rotation;
  const h = box.halfExtents;
  // Rows of the rotation matrix, taken absolute: the half size of the box along each world axis.
  const ex =
    Math.abs(1 - 2 * (y * y + z * z)) * h.x + Math.abs(2 * (x * y - w * z)) * h.y + Math.abs(2 * (x * z + w * y)) * h.z;
  const ey =
    Math.abs(2 * (x * y + w * z)) * h.x + Math.abs(1 - 2 * (x * x + z * z)) * h.y + Math.abs(2 * (y * z - w * x)) * h.z;
  const ez =
    Math.abs(2 * (x * z - w * y)) * h.x + Math.abs(2 * (y * z + w * x)) * h.y + Math.abs(1 - 2 * (x * x + y * y)) * h.z;
  const p = box.position;
  return { min: { x: p.x - ex, y: p.y - ey, z: p.z - ez }, max: { x: p.x + ex, y: p.y + ey, z: p.z + ez } };
}

/**
 * Conservative support test: `upper` may rest on `lower` when their bounds touch (within `margin`) and `upper`
 * sits higher. Used to wake whatever a moving or removed piece was holding up, so nothing is left floating.
 */
export function mayRestOn(upper: Bounds, lower: Bounds, margin = 0.06): boolean {
  return (
    upper.min.x <= lower.max.x + margin &&
    upper.max.x >= lower.min.x - margin &&
    upper.min.z <= lower.max.z + margin &&
    upper.max.z >= lower.min.z - margin &&
    upper.min.y <= lower.max.y + margin &&
    upper.max.y > lower.max.y &&
    upper.min.y + upper.max.y > lower.min.y + lower.max.y
  );
}

/** Ground-plane grid of ids by bounds, for neighbor queries among thousands of resting pieces. */
export class BoundsGrid<T> {
  readonly #cell: number;
  readonly #cells = new Map<string, Set<T>>();
  readonly #keys = new Map<T, string[]>();

  constructor(cell = 2) {
    this.#cell = cell;
  }

  set(id: T, bounds: Bounds): void {
    this.delete(id);
    const keys = this.#cover(bounds, 0);
    for (const key of keys) {
      const set = this.#cells.get(key) ?? new Set<T>();
      set.add(id);
      this.#cells.set(key, set);
    }
    this.#keys.set(id, keys);
  }

  delete(id: T): void {
    for (const key of this.#keys.get(id) ?? []) this.#cells.get(key)?.delete(id);
    this.#keys.delete(id);
  }

  /** Ids whose cells overlap the bounds grown by `margin`. */
  near(bounds: Bounds, margin = 0): Set<T> {
    const out = new Set<T>();
    for (const key of this.#cover(bounds, margin)) for (const id of this.#cells.get(key) ?? []) out.add(id);
    return out;
  }

  #cover(bounds: Bounds, margin: number): string[] {
    const keys: string[] = [];
    const x0 = Math.floor((bounds.min.x - margin) / this.#cell);
    const x1 = Math.floor((bounds.max.x + margin) / this.#cell);
    const z0 = Math.floor((bounds.min.z - margin) / this.#cell);
    const z1 = Math.floor((bounds.max.z + margin) / this.#cell);
    for (let cz = z0; cz <= z1; cz += 1) for (let cx = x0; cx <= x1; cx += 1) keys.push(`${cx}:${cz}`);
    return keys;
  }
}
