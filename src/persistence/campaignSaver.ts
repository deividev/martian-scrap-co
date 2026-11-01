import type { CampaignStore, WriteResult } from './campaignStore';
import { sealSave, type SaveEnvelope, type SaveSlot } from './saveSlots';

/** Who is playing this world. Only the host owns and persists the campaign (PRD-016, MSC-004). */
export type CampaignRole = 'host' | 'guest';

export type CampaignOpen =
  | { readonly kind: 'new' }
  | {
      readonly kind: 'resumed';
      readonly payload: unknown;
      readonly revision: number;
      readonly source: SaveSlot;
      readonly ignored: readonly SaveSlot[];
    }
  /** A save from a newer game version: nothing loaded, nothing will be written. */
  | { readonly kind: 'locked' }
  /** Stored data no slot can recover: nothing will be written until the player decides. */
  | { readonly kind: 'unreadable' }
  /** No storage (or a guest, who never persists a host world): play without saving. */
  | { readonly kind: 'unsaved' };

export type SaveOutcome = WriteResult | { readonly ok: false; readonly reason: 'read-only' };

export function newWorldId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return `wld-${[...bytes].map((byte) => (byte % 36).toString(36)).join('')}${Date.now().toString(36).slice(-6)}`;
}

/**
 * The host's link to its campaign save (MSC-036): opens the last valid revision, then writes later revisions in
 * order, one at a time; a request made while a save is running is folded into one follow-up save. It stays
 * read-only for guests, for a locked or unreadable store, and after `refuse` (a save the game could not apply),
 * so a save it cannot use is never overwritten.
 */
export class CampaignSaver {
  readonly #store: CampaignStore | null;
  readonly #worldId: string;
  #previous: Pick<SaveEnvelope, 'revision' | 'checksum' | 'history'> | null;
  #writable: boolean;
  #running: Promise<SaveOutcome> | null = null;
  #queued: { capture: () => unknown; done: Promise<SaveOutcome> } | null = null;

  private constructor(store: CampaignStore | null, worldId: string, previous: SaveEnvelope | null, writable: boolean) {
    this.#store = store;
    this.#worldId = worldId;
    this.#previous = previous;
    this.#writable = writable;
  }

  static async open(
    store: CampaignStore | null,
    role: CampaignRole,
    createWorldId: () => string = newWorldId,
  ): Promise<{ saver: CampaignSaver; opened: CampaignOpen }> {
    if (role !== 'host' || !store) {
      return { saver: new CampaignSaver(null, createWorldId(), null, false), opened: { kind: 'unsaved' } };
    }
    const recovered = await store.load();
    switch (recovered.status) {
      case 'empty':
        return { saver: new CampaignSaver(store, createWorldId(), null, true), opened: { kind: 'new' } };
      case 'locked':
        return { saver: new CampaignSaver(null, createWorldId(), null, false), opened: { kind: 'locked' } };
      case 'unreadable':
        return { saver: new CampaignSaver(null, createWorldId(), null, false), opened: { kind: 'unreadable' } };
      case 'ok': {
        const { envelope } = recovered;
        return {
          saver: new CampaignSaver(store, envelope.worldId, envelope, true),
          opened: {
            kind: 'resumed',
            payload: envelope.payload,
            revision: envelope.revision,
            source: recovered.source,
            ignored: recovered.ignored,
          },
        };
      }
    }
  }

  get worldId(): string {
    return this.#worldId;
  }

  get writable(): boolean {
    return this.#writable;
  }

  /** Last committed revision (0 before the first save of a new campaign). */
  get revision(): number {
    return this.#previous?.revision ?? 0;
  }

  /** Stops all writes for this session (the loaded save could not be applied; keep it untouched). */
  refuse(): void {
    this.#writable = false;
  }

  /** Captures and commits the next revision. `capture` runs when the write starts, so it sees the latest state. */
  save(capture: () => unknown): Promise<SaveOutcome> {
    if (!this.#writable || !this.#store) return Promise.resolve({ ok: false, reason: 'read-only' });
    if (!this.#running) {
      this.#running = this.#write(capture);
      return this.#running;
    }
    if (this.#queued) {
      this.#queued.capture = capture;
      return this.#queued.done;
    }
    const queued = {
      capture,
      done: this.#running.then(() => {
        this.#queued = null;
        this.#running = this.#write(queued.capture);
        return this.#running;
      }),
    };
    this.#queued = queued;
    return queued.done;
  }

  async #write(capture: () => unknown): Promise<SaveOutcome> {
    try {
      const store = this.#store;
      if (!this.#writable || !store) return { ok: false, reason: 'read-only' };
      const sealed = sealSave(this.#worldId, capture(), this.#previous);
      const result = await store.write(sealed.text);
      if (result.ok) this.#previous = sealed.envelope;
      // Another writer owns the newer state now: stop instead of fighting over the file.
      else if (result.reason === 'locked' || result.reason === 'stale' || result.reason === 'other-world') {
        this.#writable = false;
      }
      return result;
    } catch (error) {
      console.error('Campaign save failed', error);
      return { ok: false, reason: 'failed' };
    } finally {
      if (!this.#queued) this.#running = null;
    }
  }
}
