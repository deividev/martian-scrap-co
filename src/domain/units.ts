// Explicit units with valid ranges. Every constructor rejects negative, non-finite and
// out-of-range values instead of clamping them, so corrupt saves and packets fail loudly.

declare const unit: unique symbol;
type Unit<U extends string> = number & { readonly [unit]: U };

/** Shared campaign currency. Whole credits only. */
export type Credits = Unit<'credits'>;
/** Count of discrete items or material units. */
export type Quantity = Unit<'quantity'>;
/** Mass in kilograms. */
export type Kilograms = Unit<'kg'>;
/** Distance in meters. */
export type Meters = Unit<'m'>;
/** Duration in seconds. */
export type Seconds = Unit<'s'>;

export interface UnitRange {
  readonly min: number;
  readonly max: number;
  readonly integer: boolean;
}

export const UNIT_RANGES = Object.freeze({
  credits: { min: 0, max: 1_000_000_000, integer: true },
  quantity: { min: 0, max: 1_000_000, integer: true },
  kilograms: { min: 0, max: 100_000, integer: false },
  meters: { min: 0, max: 10_000, integer: false },
  seconds: { min: 0, max: 86_400, integer: false },
} satisfies Record<string, UnitRange>);

export type UnitName = keyof typeof UNIT_RANGES;

export function isInRange(name: UnitName, value: unknown): value is number {
  const range = UNIT_RANGES[name];
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= range.min &&
    value <= range.max &&
    (!range.integer || Number.isInteger(value))
  );
}

function make<T extends number>(name: UnitName, value: unknown): T {
  if (!isInRange(name, value)) throw new RangeError(`Invalid ${name}: ${String(value)}`);
  return value as T;
}

export const credits = (value: unknown): Credits => make<Credits>('credits', value);
export const quantity = (value: unknown): Quantity => make<Quantity>('quantity', value);
export const kilograms = (value: unknown): Kilograms => make<Kilograms>('kilograms', value);
export const meters = (value: unknown): Meters => make<Meters>('meters', value);
export const seconds = (value: unknown): Seconds => make<Seconds>('seconds', value);

/** Adds credits; throws if the result leaves the valid range. */
export function addCredits(balance: Credits, amount: Credits): Credits {
  return credits(balance + amount);
}

/** Subtracts credits; returns `null` when funds are insufficient instead of going negative. */
export function trySpendCredits(balance: Credits, cost: Credits): Credits | null {
  return cost > balance ? null : credits(balance - cost);
}
