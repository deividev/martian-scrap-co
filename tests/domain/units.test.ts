import { describe, expect, it } from 'vitest';
import {
  UNIT_RANGES,
  addCredits,
  credits,
  isInRange,
  kilograms,
  meters,
  quantity,
  seconds,
  trySpendCredits,
} from '../../src/domain/units';

const INVALID_ANY = [
  -1,
  -0.001,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  '5',
  null,
  undefined,
  {},
];

describe('unit constructors', () => {
  it.each([
    ['credits', credits],
    ['quantity', quantity],
    ['kilograms', kilograms],
    ['meters', meters],
    ['seconds', seconds],
  ] as const)('%s rejects negative, non-finite and non-number values', (_name, make) => {
    for (const value of INVALID_ANY) expect(() => make(value)).toThrow(RangeError);
  });

  it('enforces whole numbers for credits and quantities', () => {
    expect(() => credits(1.5)).toThrow(RangeError);
    expect(() => quantity(0.1)).toThrow(RangeError);
    expect(kilograms(0.5)).toBe(0.5);
  });

  it('enforces explicit upper bounds', () => {
    expect(credits(UNIT_RANGES.credits.max)).toBe(UNIT_RANGES.credits.max);
    expect(() => credits(UNIT_RANGES.credits.max + 1)).toThrow(RangeError);
    expect(() => quantity(UNIT_RANGES.quantity.max + 1)).toThrow(RangeError);
    expect(isInRange('meters', 10_001)).toBe(false);
  });
});

describe('credit arithmetic', () => {
  it('never produces a negative balance', () => {
    expect(trySpendCredits(credits(10), credits(11))).toBeNull();
    expect(trySpendCredits(credits(10), credits(10))).toBe(0);
  });

  it('rejects additions that overflow the range', () => {
    expect(addCredits(credits(5), credits(7))).toBe(12);
    expect(() => addCredits(credits(UNIT_RANGES.credits.max), credits(1))).toThrow(RangeError);
  });
});
