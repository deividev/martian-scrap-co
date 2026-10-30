import type { ContainerItem } from './container';
import type { ContentId, EntityId } from './ids';

/** First-pass compactor tuning (MSC-032); placeholders, not approved balance. */
export interface CompactorTuning {
  readonly balePieces: number;
  readonly loadSeconds: number;
  readonly processSeconds: number;
}

export const COMPACTOR_TUNING: CompactorTuning = Object.freeze({
  /** Small pieces of one material pressed into one bale. */
  balePieces: 10,
  loadSeconds: 0.6,
  processSeconds: 3,
});

/** A one-material bale; its id is new and its pieces never appear in another bale. */
export interface Bale {
  readonly id: EntityId;
  readonly materialId: ContentId;
  readonly pieceIds: readonly EntityId[];
  readonly massKg: number;
}

/** Where the compactor draws its pieces from (the intake bins). */
export interface CompactorSource {
  binCount(material: ContentId): number;
  take(material: ContentId, count: number): ContainerItem[];
  restore(items: readonly ContainerItem[]): void;
}

export type CompactorState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading'; readonly materialId: ContentId; readonly progress: number }
  | { readonly kind: 'processing'; readonly materialId: ContentId; readonly progress: number }
  | { readonly kind: 'blocked'; readonly bale: Bale };

/**
 * Physical compactor state machine (MSC-032, PRD-007): idle → loading → processing → output. Loading reserves
 * a full load from one bin at once; an interruption before the bale exists puts every reserved piece back.
 * When the bale is pressed but the exit is occupied the machine is blocked and keeps the finished bale until
 * the exit clears; progress is never thrown away.
 */
export class Compactor {
  readonly #source: CompactorSource;
  readonly #allocate: () => EntityId;
  readonly #tuning: CompactorTuning;
  readonly #materials: readonly ContentId[];
  #state: CompactorState = { kind: 'idle' };
  #load: ContainerItem[] = [];
  #elapsed = 0;

  constructor(
    source: CompactorSource,
    materials: readonly ContentId[],
    allocate: () => EntityId,
    tuning: CompactorTuning = COMPACTOR_TUNING,
  ) {
    if (!Number.isInteger(tuning.balePieces) || tuning.balePieces < 1) throw new RangeError('Invalid bale size');
    this.#source = source;
    this.#materials = [...materials];
    this.#allocate = allocate;
    this.#tuning = tuning;
  }

  get state(): CompactorState {
    return this.#state;
  }

  /** Pieces inside the machine right now (reserved load or the blocked bale). */
  get inside(): readonly EntityId[] {
    return this.#state.kind === 'blocked' ? this.#state.bale.pieceIds : this.#load.map((item) => item.id);
  }

  /**
   * Advances the machine. Returns the bale on the tick it leaves through the exit, else null. `exitClear`
   * says whether the output pad is free for a new bale.
   */
  update(dt: number, exitClear: boolean): Bale | null {
    const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
    switch (this.#state.kind) {
      case 'idle': {
        const material = this.#materials.find((id) => this.#source.binCount(id) >= this.#tuning.balePieces);
        if (material === undefined) return null;
        const load = this.#source.take(material, this.#tuning.balePieces);
        if (load.length !== this.#tuning.balePieces) {
          this.#source.restore(load);
          return null;
        }
        this.#load = load;
        this.#elapsed = 0;
        this.#state = { kind: 'loading', materialId: material, progress: 0 };
        return null;
      }
      case 'loading': {
        this.#elapsed += step;
        const { materialId } = this.#state;
        if (this.#elapsed < this.#tuning.loadSeconds) {
          this.#state = { kind: 'loading', materialId, progress: this.#elapsed / this.#tuning.loadSeconds };
          return null;
        }
        this.#elapsed = 0;
        this.#state = { kind: 'processing', materialId, progress: 0 };
        return null;
      }
      case 'processing': {
        this.#elapsed += step;
        const { materialId } = this.#state;
        if (this.#elapsed < this.#tuning.processSeconds) {
          this.#state = { kind: 'processing', materialId, progress: this.#elapsed / this.#tuning.processSeconds };
          return null;
        }
        const bale: Bale = {
          id: this.#allocate(),
          materialId,
          pieceIds: this.#load.map((item) => item.id),
          massKg: this.#load.reduce((sum, item) => sum + item.massKg, 0),
        };
        this.#load = [];
        this.#state = { kind: 'blocked', bale };
        return this.#eject(exitClear);
      }
      case 'blocked':
        return this.#eject(exitClear);
    }
  }

  /**
   * Interrupts the machine (power cut, host leaving). A load not yet pressed goes back to its bin; a finished
   * bale stays inside, waiting for the exit.
   */
  interrupt(): void {
    if (this.#state.kind === 'loading' || this.#state.kind === 'processing') {
      this.#source.restore(this.#load);
      this.#load = [];
      this.#state = { kind: 'idle' };
    }
  }

  #eject(exitClear: boolean): Bale | null {
    if (this.#state.kind !== 'blocked' || !exitClear) return null;
    const { bale } = this.#state;
    this.#state = { kind: 'idle' };
    return bale;
  }
}
