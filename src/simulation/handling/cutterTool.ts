/**
 * First-pass cutter timing (MSC-020 review, 2026-10-30): cutting is held, not instant. A joint takes a fixed
 * time; cutting a part into pieces grows with its mass. All values are placeholders, not approved balance.
 */
export const CUTTER_TIMING = Object.freeze({
  jointSeconds: 0.8,
  baseSeconds: 0.5,
  secondsPerKg: 0.03,
  maxSeconds: 3.5,
});

/** Cutting speed per cutter level (placeholder upgrade ladder; prices and count are unapproved). */
export const CUTTER_SPEED_TIERS: readonly number[] = Object.freeze([1, 1.6, 2.4]);

/** Seconds to cut a part of the given mass into small pieces at speed 1. */
export function partCutSeconds(massKg: number): number {
  const mass = Number.isFinite(massKg) && massKg > 0 ? massKg : 0;
  return Math.min(CUTTER_TIMING.maxSeconds, CUTTER_TIMING.baseSeconds + mass * CUTTER_TIMING.secondsPerKg);
}

export interface CutTick {
  /** Fraction of the current cut done, 0 to 1. */
  readonly progress: number;
  /** True only on the tick the cut completes; progress then restarts. */
  readonly done: boolean;
}

/**
 * Hold-to-cut progress for one target at a time. Releasing the trigger or aiming at another target throws
 * the progress away, so a cut is a deliberate held action.
 */
export class CutProgress {
  #target: string | null = null;
  #elapsed = 0;

  get target(): string | null {
    return this.#target;
  }

  /**
   * Advances the cut on `target` while `holding`. `seconds` is the time needed at speed 1 and `speed` the
   * cutter level multiplier.
   */
  update(target: string | null, holding: boolean, dt: number, seconds: number, speed = 1): CutTick {
    if (target === null || !holding || !Number.isFinite(dt) || dt < 0) {
      this.reset();
      return { progress: 0, done: false };
    }
    if (target !== this.#target) {
      this.#target = target;
      this.#elapsed = 0;
    }
    const required = Math.max(seconds, 0.05) / Math.max(speed, 0.01);
    this.#elapsed += dt;
    if (this.#elapsed >= required) {
      this.reset();
      return { progress: 1, done: true };
    }
    return { progress: this.#elapsed / required, done: false };
  }

  reset(): void {
    this.#target = null;
    this.#elapsed = 0;
  }
}
