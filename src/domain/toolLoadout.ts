import type { ContentId } from './ids';

export type EquipResult =
  | { readonly ok: true; readonly equipped: ContentId }
  | { readonly ok: false; readonly reason: 'not-owned' | 'unknown' };

/**
 * The tools a player carries in numbered slots and the one in hand (MSC-020 review, 2026-10-30). Only owned
 * tools can be equipped; buying a tool (`grant`) arrives with the shared-credit store, the test yard grants
 * its tools up front as a stand-in.
 */
export class ToolLoadout {
  readonly #slots: readonly ContentId[];
  readonly #owned = new Set<ContentId>();
  #equipped: ContentId;

  constructor(slots: readonly ContentId[], owned: Iterable<ContentId>) {
    if (slots.length === 0 || new Set(slots).size !== slots.length) {
      throw new RangeError('tool slots must be non-empty and unique');
    }
    this.#slots = [...slots];
    for (const tool of owned) if (this.#slots.includes(tool)) this.#owned.add(tool);
    const first = this.#slots.find((tool) => this.#owned.has(tool));
    if (first === undefined) throw new RangeError('the player must own at least one slotted tool');
    this.#equipped = first;
  }

  get equipped(): ContentId {
    return this.#equipped;
  }

  get slots(): readonly ContentId[] {
    return this.#slots;
  }

  owns(tool: ContentId): boolean {
    return this.#owned.has(tool);
  }

  /** Adds a slotted tool to the owned set; returns false when it is unknown or already owned. */
  grant(tool: ContentId): boolean {
    if (!this.#slots.includes(tool) || this.#owned.has(tool)) return false;
    this.#owned.add(tool);
    return true;
  }

  equip(tool: ContentId): EquipResult {
    if (!this.#slots.includes(tool)) return { ok: false, reason: 'unknown' };
    if (!this.#owned.has(tool)) return { ok: false, reason: 'not-owned' };
    this.#equipped = tool;
    return { ok: true, equipped: tool };
  }

  /** Equips the tool in a zero-based slot. */
  equipSlot(index: number): EquipResult {
    const tool = this.#slots[index];
    return tool === undefined ? { ok: false, reason: 'unknown' } : this.equip(tool);
  }

  /** Equips the next owned tool after the current one, wrapping; stays put with a single owned tool. */
  cycle(): ContentId {
    const start = this.#slots.indexOf(this.#equipped);
    for (let step = 1; step <= this.#slots.length; step++) {
      const tool = this.#slots[(start + step) % this.#slots.length];
      if (tool !== undefined && this.#owned.has(tool)) {
        this.#equipped = tool;
        break;
      }
    }
    return this.#equipped;
  }
}
