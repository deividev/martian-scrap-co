import type { EntityId } from '../../domain/ids';
import type { Vec3 } from '../physics/physicsPort';

export interface StationMarkerSpec {
  /** Ground position of the buried marker (y is ignored for cover). */
  readonly position: Vec3;
  /** Horizontal radius, meters, of the scrap that covers it. */
  readonly radius: number;
  /** The marker shows once at most this fraction of the original cover is still around it. */
  readonly revealWhenRemaining: number;
}

export interface StationRevealStatus {
  readonly total: number;
  readonly remaining: number;
  /** 0 when untouched, 1 when the reveal threshold is reached. */
  readonly progress: number;
  readonly revealed: boolean;
  /** True only on the update that crossed the threshold. */
  readonly justRevealed: boolean;
}

/**
 * First station marker (MSC-035, PRD-001/004): a station part buried at the mountain foot. It is revealed by
 * clearing the scrap around it, whatever the method (vacuumed, carried, cut or knocked away): a covering piece
 * counts while it still exists within the radius. The reveal is permanent once reached.
 */
export class StationReveal {
  readonly #spec: StationMarkerSpec;
  readonly #cover: readonly EntityId[];
  #revealed = false;
  #remaining: number;

  constructor(spec: StationMarkerSpec, coverIds: readonly EntityId[]) {
    if (coverIds.length === 0) throw new RangeError('A station marker needs covering scrap');
    if (!(spec.revealWhenRemaining >= 0 && spec.revealWhenRemaining < 1)) {
      throw new RangeError(`Invalid reveal threshold ${spec.revealWhenRemaining}`);
    }
    this.#spec = spec;
    this.#cover = coverIds;
    this.#remaining = coverIds.length;
  }

  /** Pieces whose start position lies within the marker radius. */
  static coverOf(spec: StationMarkerSpec, pieces: Iterable<{ readonly id: EntityId; readonly position: Vec3 }>) {
    const ids: EntityId[] = [];
    for (const piece of pieces) if (StationReveal.#within(spec, piece.position)) ids.push(piece.id);
    return ids;
  }

  get revealed(): boolean {
    return this.#revealed;
  }

  /** `locate` returns where a covering piece is now, or null once it no longer exists (collected, sold, cut). */
  update(locate: (id: EntityId) => Vec3 | null): StationRevealStatus {
    let remaining = 0;
    for (const id of this.#cover) {
      const position = locate(id);
      if (position && StationReveal.#within(this.#spec, position)) remaining += 1;
    }
    this.#remaining = remaining;
    const wasRevealed = this.#revealed;
    if (remaining <= this.#cover.length * this.#spec.revealWhenRemaining) this.#revealed = true;
    return { ...this.status(), justRevealed: this.#revealed && !wasRevealed };
  }

  status(): StationRevealStatus {
    const total = this.#cover.length;
    const cleared = total - this.#remaining;
    const needed = total * (1 - this.#spec.revealWhenRemaining);
    return {
      total,
      remaining: this.#remaining,
      progress: this.#revealed ? 1 : Math.min(1, cleared / needed),
      revealed: this.#revealed,
      justRevealed: false,
    };
  }

  static #within(spec: StationMarkerSpec, position: Vec3): boolean {
    return Math.hypot(position.x - spec.position.x, position.z - spec.position.z) <= spec.radius;
  }
}
