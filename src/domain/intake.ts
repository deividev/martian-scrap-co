import type { ContainerItem, MaterialBatch } from './container';
import type { ContentId, EntityId } from './ids';
import { quantity } from './units';

export interface ReceiveResult {
  readonly accepted: number;
  readonly duplicates: number;
}

/**
 * Base intake hopper (early prototype ahead of MSC-031): the player unloads the whole portable container
 * here with one action (right click / F / Y). Pieces are tallied per material, ready for batch
 * classification and compaction. Each piece is received at most once.
 */
export class BaseIntake {
  readonly #received = new Set<EntityId>();
  readonly #totals = new Map<ContentId, { count: number; massKg: number }>();

  get count(): number {
    return this.#received.size;
  }

  receive(items: readonly ContainerItem[]): ReceiveResult {
    let accepted = 0;
    let duplicates = 0;
    for (const item of items) {
      if (this.#received.has(item.id)) {
        duplicates += 1;
        continue;
      }
      this.#received.add(item.id);
      const total = this.#totals.get(item.materialId) ?? { count: 0, massKg: 0 };
      total.count += 1;
      total.massKg += item.massKg;
      this.#totals.set(item.materialId, total);
      accepted += 1;
    }
    return { accepted, duplicates };
  }

  batches(): MaterialBatch[] {
    return [...this.#totals].map(([materialId, total]) => ({
      materialId,
      count: quantity(total.count),
      massKg: total.massKg,
    }));
  }
}
