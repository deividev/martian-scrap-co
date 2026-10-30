import type { ContainerItem, MaterialBatch } from './container';
import type { ContentId, EntityId } from './ids';
import { quantity } from './units';

/** First-pass pieces per material bin; not an approved value (MSC-031). */
export const DEFAULT_BIN_CAPACITY = 40;

export type KeptReason = 'bin-full' | 'not-accepted';

/** What unloading a mixed batch would do, shown before the player commits (MSC-031). */
export interface IntakePreview {
  readonly accepted: readonly MaterialBatch[];
  readonly kept: readonly (MaterialBatch & { readonly reason: KeptReason })[];
  readonly acceptedIds: readonly EntityId[];
  /** Pieces already received earlier; they are ignored, never counted twice. */
  readonly duplicateIds: readonly EntityId[];
}

export interface ReceiveResult {
  readonly accepted: number;
  readonly duplicates: number;
  /** Pieces the intake did not take; the caller keeps them (nothing is destroyed). */
  readonly kept: readonly ContainerItem[];
}

function summarize(items: readonly ContainerItem[]): MaterialBatch[] {
  const totals = new Map<ContentId, { count: number; massKg: number }>();
  for (const item of items) {
    const total = totals.get(item.materialId) ?? { count: 0, massKg: 0 };
    total.count += 1;
    total.massKg += item.massKg;
    totals.set(item.materialId, total);
  }
  return [...totals].map(([materialId, total]) => ({
    materialId,
    count: quantity(total.count),
    massKg: total.massKg,
  }));
}

/**
 * Base intake with batch classification (MSC-031, PRD-006): the player unloads a whole mixed batch with one
 * action and the intake routes every piece to its material bin, with no screw-by-screw sorting. Pieces of a
 * material the intake does not accept, or that do not fit in a full bin, are handed back to the caller.
 * Each piece is received at most once. Bins feed the compactor through `take`/`restore`.
 */
export class BaseIntake {
  readonly #binCapacity: number;
  readonly #accepts: (material: ContentId) => boolean;
  readonly #received = new Set<EntityId>();
  readonly #bins = new Map<ContentId, ContainerItem[]>();

  constructor(binCapacity = DEFAULT_BIN_CAPACITY, accepts: (material: ContentId) => boolean = () => true) {
    if (!Number.isInteger(binCapacity) || binCapacity < 1) throw new RangeError('Bin capacity must be at least 1');
    this.#binCapacity = binCapacity;
    this.#accepts = accepts;
  }

  get binCapacity(): number {
    return this.#binCapacity;
  }

  /** Pieces currently waiting in the bins. */
  get count(): number {
    let total = 0;
    for (const bin of this.#bins.values()) total += bin.length;
    return total;
  }

  binCount(material: ContentId): number {
    return this.#bins.get(material)?.length ?? 0;
  }

  /** Classifies a batch without changing anything. */
  preview(items: readonly ContainerItem[]): IntakePreview {
    const free = new Map<ContentId, number>();
    const accepted: ContainerItem[] = [];
    const full: ContainerItem[] = [];
    const refused: ContainerItem[] = [];
    const duplicateIds: EntityId[] = [];
    const seen = new Set<EntityId>();
    for (const item of items) {
      if (this.#received.has(item.id) || seen.has(item.id)) {
        duplicateIds.push(item.id);
        continue;
      }
      seen.add(item.id);
      if (!this.#accepts(item.materialId)) {
        refused.push(item);
        continue;
      }
      const room = free.get(item.materialId) ?? this.#binCapacity - this.binCount(item.materialId);
      if (room <= 0) {
        full.push(item);
        continue;
      }
      free.set(item.materialId, room - 1);
      accepted.push(item);
    }
    return {
      accepted: summarize(accepted),
      kept: [
        ...summarize(full).map((batch) => ({ ...batch, reason: 'bin-full' as const })),
        ...summarize(refused).map((batch) => ({ ...batch, reason: 'not-accepted' as const })),
      ],
      acceptedIds: accepted.map((item) => item.id),
      duplicateIds,
    };
  }

  /** Routes the batch into the bins; whatever does not fit or is not accepted comes back in `kept`. */
  receive(items: readonly ContainerItem[]): ReceiveResult {
    const plan = this.preview(items);
    const take = new Set(plan.acceptedIds);
    const duplicates = new Set(plan.duplicateIds);
    const kept: ContainerItem[] = [];
    for (const item of items) {
      if (take.has(item.id)) {
        take.delete(item.id);
        this.#received.add(item.id);
        const bin = this.#bins.get(item.materialId) ?? [];
        bin.push(item);
        this.#bins.set(item.materialId, bin);
      } else if (!duplicates.has(item.id) && !this.#received.has(item.id)) {
        kept.push(item);
      }
    }
    return { accepted: plan.acceptedIds.length, duplicates: plan.duplicateIds.length, kept };
  }

  /** Current bin contents per material. */
  batches(): MaterialBatch[] {
    return [...this.#bins.values()].filter((bin) => bin.length > 0).flatMap((bin) => summarize(bin));
  }

  /** Removes the oldest `count` pieces of one material (the compactor reserving a load). */
  take(material: ContentId, count: number): ContainerItem[] {
    const bin = this.#bins.get(material) ?? [];
    if (!Number.isInteger(count) || count < 1 || bin.length < count) return [];
    return bin.splice(0, count);
  }

  /** Puts reserved pieces back at the front of their bins (an interrupted load); unknown pieces are ignored. */
  restore(items: readonly ContainerItem[]): void {
    for (const item of [...items].reverse()) {
      if (!this.#received.has(item.id)) continue;
      const bin = this.#bins.get(item.materialId) ?? [];
      if (bin.some((other) => other.id === item.id)) continue;
      bin.unshift(item);
      this.#bins.set(item.materialId, bin);
    }
  }
}
