import type { EntityId } from '../../domain/ids';

/** Who holds an object: a player slot id (`player-0` is the host/solo player). */
export type HolderId = string;

/**
 * Object claims (PRD-019): one holder per object; a second claim fails instead of stealing.
 * Local single-authority version; the host-arbitrated network version arrives in MSC-022.
 */
export class ClaimRegistry {
  readonly #holders = new Map<EntityId, HolderId>();

  holderOf(id: EntityId): HolderId | undefined {
    return this.#holders.get(id);
  }

  claim(id: EntityId, holder: HolderId): boolean {
    const current = this.#holders.get(id);
    if (current !== undefined) return current === holder;
    this.#holders.set(id, holder);
    return true;
  }

  /** Only the current holder can release; returns whether a claim was released. */
  release(id: EntityId, holder: HolderId): boolean {
    if (this.#holders.get(id) !== holder) return false;
    this.#holders.delete(id);
    return true;
  }

  /** Releases everything a holder owns (disconnect, removal, leaving the session). */
  releaseAll(holder: HolderId): EntityId[] {
    const released: EntityId[] = [];
    for (const [id, owner] of this.#holders) {
      if (owner !== holder) continue;
      this.#holders.delete(id);
      released.push(id);
    }
    return released;
  }
}
