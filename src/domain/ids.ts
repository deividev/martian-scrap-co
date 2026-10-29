// Stable identifiers. Entity identity is a branded string owned by the domain; Three.js object ids,
// Rapier body handles and native handles are numbers and can never be used where an id is expected.

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

/** Authored content id, e.g. `ferrous` or `magnetic-collector`. Stable across builds and saves. */
export type ContentId = Brand<string, 'ContentId'>;
/** Runtime world entity id, e.g. `ent-1f`. Stable for the lifetime of a world save. */
export type EntityId = Brand<string, 'EntityId'>;
/** Campaign world id, created once when a campaign starts. */
export type WorldId = Brand<string, 'WorldId'>;
/** Deduplication id for sales, compactions, cuts and purchases (PRD-019). */
export type TransactionId = Brand<string, 'TransactionId'>;

export const CONTENT_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const CONTENT_ID_MAX_LENGTH = 48;
const ENTITY_ID_PATTERN = /^ent-[0-9a-z]{1,11}$/;
const WORLD_ID_PATTERN = /^wld-[0-9a-z]{8,32}$/;
const TRANSACTION_ID_PATTERN = /^txn-[0-9a-z]{1,32}$/;

export function isContentId(value: unknown): value is ContentId {
  return typeof value === 'string' && value.length <= CONTENT_ID_MAX_LENGTH && CONTENT_ID_PATTERN.test(value);
}

export function isEntityId(value: unknown): value is EntityId {
  return typeof value === 'string' && ENTITY_ID_PATTERN.test(value);
}

export function isWorldId(value: unknown): value is WorldId {
  return typeof value === 'string' && WORLD_ID_PATTERN.test(value);
}

export function isTransactionId(value: unknown): value is TransactionId {
  return typeof value === 'string' && TRANSACTION_ID_PATTERN.test(value);
}

function parseWith<T>(guard: (value: unknown) => value is T, kind: string, value: unknown): T {
  if (!guard(value)) throw new TypeError(`Invalid ${kind}: ${JSON.stringify(value)}`);
  return value;
}

export const contentId = (value: unknown): ContentId => parseWith(isContentId, 'content id', value);
export const entityId = (value: unknown): EntityId => parseWith(isEntityId, 'entity id', value);
export const worldId = (value: unknown): WorldId => parseWith(isWorldId, 'world id', value);
export const transactionId = (value: unknown): TransactionId => parseWith(isTransactionId, 'transaction id', value);

const MAX_ENTITY_SEQUENCE = 36 ** 11 - 1;

/**
 * Issues entity ids from a persisted monotonic sequence. Ids are never reused, so a sold or
 * consumed object cannot be resurrected by a later allocation (PRD-019, PRD-021).
 */
export class EntityIdAllocator {
  #next: number;

  constructor(nextSequence = 1) {
    if (!Number.isSafeInteger(nextSequence) || nextSequence < 1 || nextSequence > MAX_ENTITY_SEQUENCE) {
      throw new RangeError(`Invalid entity sequence: ${nextSequence}`);
    }
    this.#next = nextSequence;
  }

  /** The value to persist so a reloaded world continues without reuse. */
  get nextSequence(): number {
    return this.#next;
  }

  allocate(): EntityId {
    if (this.#next > MAX_ENTITY_SEQUENCE) throw new RangeError('Entity id space exhausted');
    const id = `ent-${this.#next.toString(36)}` as EntityId;
    this.#next += 1;
    return id;
  }
}
