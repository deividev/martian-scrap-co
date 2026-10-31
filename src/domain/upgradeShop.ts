import type { SharedCredits } from './economy';
import type { TransactionId } from './ids';
import type { MaterialSelector } from './materialSelector';
import type { Credits } from './units';

/** A crew member as the host sees them; the host's own id is given to the shop. */
export type CrewMemberId = string;

/** Something the crew can buy once with shared credits. */
export interface UpgradeOffer {
  readonly id: string;
  readonly price: Credits;
  /** False once the upgrade no longer applies (already owned, top level reached). */
  available(): boolean;
  /** Applies the effect; called only after the credits were taken and must not fail. */
  grant(): void;
}

export interface PurchaseRequest {
  readonly id: string;
  readonly offerId: string;
  readonly requester: CrewMemberId;
  readonly price: Credits;
}

export type PurchaseFailure = 'unknown-offer' | 'not-available' | 'insufficient-credits' | 'not-host' | 'no-request';

export type PurchaseResult =
  | {
      readonly ok: true;
      readonly kind: 'purchased';
      readonly offerId: string;
      readonly buyer: CrewMemberId;
      readonly cost: Credits;
      readonly balance: Credits;
      readonly replayed: boolean;
    }
  | { readonly ok: true; readonly kind: 'requested'; readonly request: PurchaseRequest }
  | { readonly ok: false; readonly reason: PurchaseFailure };

/** Told to the whole crew so credits never drop silently (MSC-003 P2). */
export type ShopAnnouncement =
  | {
      readonly kind: 'purchased';
      readonly buyer: CrewMemberId;
      readonly offerId: string;
      readonly cost: Credits;
      readonly balance: Credits;
    }
  | { readonly kind: 'requested'; readonly request: PurchaseRequest }
  | { readonly kind: 'declined'; readonly request: PurchaseRequest }
  | { readonly kind: 'can-spend'; readonly member: CrewMemberId; readonly allowed: boolean };

/**
 * Shared upgrade shop owned by the host (MSC-034, MSC-003 P2, PRD-018/019). The host buys directly; a guest's
 * purchase becomes a request the host approves or declines, unless the host marked that guest "Can spend" for
 * the session. Taking the credits and granting the upgrade are one step: nothing is taken if the upgrade no
 * longer applies or funds are short, and a resubmitted transaction id returns the first result without
 * charging again. Every purchase, request and decision is announced to the crew.
 */
export class UpgradeShop {
  readonly #credits: SharedCredits;
  readonly #host: CrewMemberId;
  readonly #offers: ReadonlyMap<string, UpgradeOffer>;
  readonly #canSpend = new Set<CrewMemberId>();
  readonly #requests = new Map<string, PurchaseRequest>();
  readonly #results = new Map<TransactionId, PurchaseResult>();
  readonly #announcements: ShopAnnouncement[] = [];
  #requestCounter = 0;

  constructor(sharedCredits: SharedCredits, host: CrewMemberId, offers: readonly UpgradeOffer[]) {
    this.#credits = sharedCredits;
    this.#host = host;
    this.#offers = new Map(offers.map((offer) => [offer.id, offer]));
  }

  offer(id: string): UpgradeOffer | undefined {
    return this.#offers.get(id);
  }

  canSpendDirectly(member: CrewMemberId): boolean {
    return member === this.#host || this.#canSpend.has(member);
  }

  /** Host-only session permission; returns false for anyone else or for the host itself. */
  setCanSpend(actor: CrewMemberId, member: CrewMemberId, allowed: boolean): boolean {
    if (actor !== this.#host || member === this.#host) return false;
    if (allowed) this.#canSpend.add(member);
    else this.#canSpend.delete(member);
    this.#announcements.push({ kind: 'can-spend', member, allowed });
    return true;
  }

  /** Pending guest requests, oldest first. */
  pending(): PurchaseRequest[] {
    return [...this.#requests.values()];
  }

  buy(member: CrewMemberId, offerId: string, transaction: TransactionId): PurchaseResult {
    return this.#once(transaction, () => {
      const offer = this.#offers.get(offerId);
      if (!offer) return { ok: false, reason: 'unknown-offer' };
      if (!offer.available()) return { ok: false, reason: 'not-available' };
      if (this.canSpendDirectly(member)) return this.#commit(offer, member);
      // One open request per guest and offer: asking again returns the same request.
      const open = [...this.#requests.values()].find((r) => r.requester === member && r.offerId === offerId);
      if (open) return { ok: true, kind: 'requested', request: open };
      this.#requestCounter += 1;
      const request = { id: `req-${this.#requestCounter}`, offerId, requester: member, price: offer.price };
      this.#requests.set(request.id, request);
      this.#announcements.push({ kind: 'requested', request });
      return { ok: true, kind: 'requested', request };
    });
  }

  /** Host approval pays for the guest's request; a failed approval leaves the request open. */
  approve(actor: CrewMemberId, requestId: string, transaction: TransactionId): PurchaseResult {
    return this.#once(transaction, () => {
      if (actor !== this.#host) return { ok: false, reason: 'not-host' };
      const request = this.#requests.get(requestId);
      const offer = request ? this.#offers.get(request.offerId) : undefined;
      if (!request || !offer) return { ok: false, reason: 'no-request' };
      if (!offer.available()) {
        this.#requests.delete(requestId);
        return { ok: false, reason: 'not-available' };
      }
      const result = this.#commit(offer, request.requester);
      if (result.ok) this.#requests.delete(requestId);
      return result;
    });
  }

  decline(actor: CrewMemberId, requestId: string): boolean {
    const request = this.#requests.get(requestId);
    if (actor !== this.#host || !request) return false;
    this.#requests.delete(requestId);
    this.#announcements.push({ kind: 'declined', request });
    return true;
  }

  /** Announcements since the last call, oldest first. */
  drainAnnouncements(): ShopAnnouncement[] {
    return this.#announcements.splice(0, this.#announcements.length);
  }

  #once(transaction: TransactionId, run: () => PurchaseResult): PurchaseResult {
    const previous = this.#results.get(transaction);
    if (previous) return previous.ok && previous.kind === 'purchased' ? { ...previous, replayed: true } : previous;
    const result = run();
    // Failures are not remembered, so the same transaction can be retried once funds arrive.
    if (result.ok) this.#results.set(transaction, result);
    return result;
  }

  #commit(offer: UpgradeOffer, buyer: CrewMemberId): PurchaseResult {
    const balance = this.#credits.spend(offer.price);
    if (balance === null) return { ok: false, reason: 'insufficient-credits' };
    offer.grant();
    this.#announcements.push({ kind: 'purchased', buyer, offerId: offer.id, cost: offer.price, balance });
    return { ok: true, kind: 'purchased', offerId: offer.id, buyer, cost: offer.price, balance, replayed: false };
  }
}

/** Collector level offers (`collector-2`, `collector-3`, …): each is for sale only right after the one before. */
export function collectorUpgradeOffers(selector: MaterialSelector, prices: readonly Credits[]): UpgradeOffer[] {
  return prices.slice(0, selector.maxTier).map((price, index) => ({
    id: `collector-${index + 2}`,
    price,
    available: () => selector.tier === index,
    grant: () => void selector.upgrade(),
  }));
}
