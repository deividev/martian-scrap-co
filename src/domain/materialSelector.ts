import type { ContentId } from './ids';

export type SelectResult =
  | { readonly ok: true; readonly selected: ContentId }
  | { readonly ok: false; readonly reason: 'locked' | 'unavailable' };

/**
 * Collector material selector (owner decision 2026-10-30). Upgrade tiers unlock materials cumulatively;
 * the collector takes only the selected material, and the choice stays locked while the container holds
 * anything, so each trip carries one material. Unloading at the base unlocks it again.
 */
export class MaterialSelector {
  readonly #tiers: readonly (readonly ContentId[])[];
  readonly #isLocked: () => boolean;
  #tier = 0;
  #selected: ContentId;

  constructor(tiers: readonly (readonly ContentId[])[], isLocked: () => boolean, tier = 0) {
    const first = tiers[0]?.[0];
    if (first === undefined) throw new RangeError('A selector needs at least one material');
    if (!Number.isInteger(tier) || tier < 0 || tier >= tiers.length) throw new RangeError(`Invalid tier ${tier}`);
    this.#tiers = tiers;
    this.#isLocked = isLocked;
    this.#tier = tier;
    this.#selected = first;
  }

  /** Zero-based upgrade level. */
  get tier(): number {
    return this.#tier;
  }

  get maxTier(): number {
    return this.#tiers.length - 1;
  }

  get selected(): ContentId {
    return this.#selected;
  }

  get locked(): boolean {
    return this.#isLocked();
  }

  /** Materials unlocked at the current tier, in authored order. */
  available(): ContentId[] {
    return this.#tiers.slice(0, this.#tier + 1).flat();
  }

  /** Tier that unlocks a material, or undefined if the collector never takes it. */
  tierOf(material: ContentId): number | undefined {
    const index = this.#tiers.findIndex((tier) => tier.includes(material));
    return index === -1 ? undefined : index;
  }

  /** Whether the collector takes this material right now. */
  accepts(material: ContentId): boolean {
    return material === this.#selected;
  }

  /** Raises the tier by one; returns the newly unlocked materials (empty at the top tier). */
  upgrade(): ContentId[] {
    if (this.#tier >= this.maxTier) return [];
    this.#tier += 1;
    return [...(this.#tiers[this.#tier] ?? [])];
  }

  select(material: ContentId): SelectResult {
    if (!this.available().includes(material)) return { ok: false, reason: 'unavailable' };
    if (material !== this.#selected && this.#isLocked()) return { ok: false, reason: 'locked' };
    this.#selected = material;
    return { ok: true, selected: material };
  }

  /** Steps to the next or previous unlocked material, wrapping around. */
  cycle(direction: -1 | 1): SelectResult {
    const available = this.available();
    if (this.#isLocked()) return { ok: false, reason: 'locked' };
    const index = available.indexOf(this.#selected);
    const next = available[(index + direction + available.length) % available.length];
    return next === undefined ? { ok: false, reason: 'unavailable' } : this.select(next);
  }
}
