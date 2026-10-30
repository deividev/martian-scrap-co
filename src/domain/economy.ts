import type { Bale } from './compactor';
import type { ContentId, EntityId, TransactionId } from './ids';
import { addCredits, credits, type Credits } from './units';

/** Campaign-wide credits owned by the host save and shared by the whole crew (PRD-010). */
export class SharedCredits {
  #balance: Credits;

  constructor(initial: number = 0) {
    this.#balance = credits(initial);
  }

  get balance(): Credits {
    return this.#balance;
  }

  /** Only sale commits call this; spending arrives with the upgrade purchase slice (MSC-034). */
  deposit(amount: Credits): Credits {
    this.#balance = addCredits(this.#balance, amount);
    return this.#balance;
  }
}

export interface SaleQuote {
  readonly baleId: EntityId;
  readonly materialId: ContentId;
  readonly pieces: number;
  readonly credits: Credits;
}

export type SaleResult =
  | { readonly ok: true; readonly quote: SaleQuote; readonly balance: Credits; readonly replayed: boolean }
  | { readonly ok: false; readonly reason: 'already-sold' | 'unknown-material' | 'not-present' };

/**
 * Sale machine (MSC-033, PRD-007): previews what a bale is worth and commits the sale on the host. Removing
 * the bale from the world and paying the crew are one step: payment happens only if `consume` removed the
 * bale, and a bale is paid at most once. Resubmitting the same transaction id returns the first result
 * without paying again (duplicate network delivery, retries).
 */
export class SaleTerminal {
  readonly #credits: SharedCredits;
  readonly #priceOf: (material: ContentId) => number | undefined;
  readonly #sold = new Set<EntityId>();
  readonly #results = new Map<TransactionId, Extract<SaleResult, { ok: true }>>();

  constructor(sharedCredits: SharedCredits, priceOf: (material: ContentId) => number | undefined) {
    this.#credits = sharedCredits;
    this.#priceOf = priceOf;
  }

  /** What the bale would pay, or null when its material has no price. */
  quote(bale: Bale): SaleQuote | null {
    const price = this.#priceOf(bale.materialId);
    if (price === undefined) return null;
    return {
      baleId: bale.id,
      materialId: bale.materialId,
      pieces: bale.pieceIds.length,
      credits: credits(price * bale.pieceIds.length),
    };
  }

  sold(baleId: EntityId): boolean {
    return this.#sold.has(baleId);
  }

  /** Commits a sale. `consume` removes the bale from the world and returns false if it is no longer there. */
  sell(bale: Bale, transaction: TransactionId, consume: () => boolean): SaleResult {
    const previous = this.#results.get(transaction);
    if (previous) return { ...previous, replayed: true };
    if (this.#sold.has(bale.id)) return { ok: false, reason: 'already-sold' };
    const quote = this.quote(bale);
    if (!quote) return { ok: false, reason: 'unknown-material' };
    if (!consume()) return { ok: false, reason: 'not-present' };
    this.#sold.add(bale.id);
    const balance = this.#credits.deposit(quote.credits);
    const result = { ok: true as const, quote, balance, replayed: false };
    this.#results.set(transaction, result);
    return result;
  }
}
