import type { ContentId, EntityId } from './ids';
import { quantity, type Quantity } from './units';

/** One small piece entering the portable container. */
export interface ContainerItem {
  readonly id: EntityId;
  readonly materialId: ContentId;
  readonly massKg: number;
}

export interface MaterialBatch {
  readonly materialId: ContentId;
  readonly count: Quantity;
  readonly massKg: number;
}

export type AddResult = { readonly ok: true } | { readonly ok: false; readonly reason: 'full' | 'duplicate' };

/** First-pass capacity; upgrades raise it (PRD-009). Not an approved value. */
export const DEFAULT_CONTAINER_CAPACITY = 20;

/**
 * Portable batch container (MSC-015, PRD-005/006). Counts pieces per material. A piece enters at
 * most once; a full container refuses intake instead of deleting anything.
 */
export class PortableContainer {
  readonly #capacity: Quantity;
  readonly #items = new Map<EntityId, ContainerItem>();

  constructor(capacity: number = DEFAULT_CONTAINER_CAPACITY) {
    this.#capacity = quantity(capacity);
    if (this.#capacity < 1) throw new RangeError('Container capacity must be at least 1');
  }

  get capacity(): Quantity {
    return this.#capacity;
  }

  get count(): number {
    return this.#items.size;
  }

  get isFull(): boolean {
    return this.#items.size >= this.#capacity;
  }

  has(id: EntityId): boolean {
    return this.#items.has(id);
  }

  canAccept(id: EntityId): boolean {
    return !this.#items.has(id) && !this.isFull;
  }

  add(item: ContainerItem): AddResult {
    if (this.#items.has(item.id)) return { ok: false, reason: 'duplicate' };
    if (this.isFull) return { ok: false, reason: 'full' };
    if (!Number.isFinite(item.massKg) || item.massKg <= 0) throw new RangeError(`Invalid mass for ${item.id}`);
    this.#items.set(item.id, item);
    return { ok: true };
  }

  /** Read-only per-material summary, in first-collected order. */
  batches(): MaterialBatch[] {
    const totals = new Map<ContentId, { count: number; massKg: number }>();
    for (const item of this.#items.values()) {
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

  /** Items in the order they were collected (read-only view for an unload preview). */
  items(): ContainerItem[] {
    return [...this.#items.values()];
  }

  /** Removes exactly the listed items and returns them; unknown ids are skipped (MSC-031 partial unload). */
  take(ids: readonly EntityId[]): ContainerItem[] {
    const taken: ContainerItem[] = [];
    for (const id of ids) {
      const item = this.#items.get(id);
      if (!item) continue;
      this.#items.delete(id);
      taken.push(item);
    }
    return taken;
  }

  /** Empties the container and hands back every item exactly once (unloading at base, MSC-031). */
  unloadAll(): ContainerItem[] {
    const items = [...this.#items.values()];
    this.#items.clear();
    return items;
  }
}
