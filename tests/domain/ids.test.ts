import { describe, expect, it } from 'vitest';
import {
  EntityIdAllocator,
  contentId,
  entityId,
  isContentId,
  isEntityId,
  isTransactionId,
  isWorldId,
} from '../../src/domain/ids';

describe('content ids', () => {
  it.each(['ferrous', 'magnetic-collector', 'regolith-ceramic', 'tool2'])('accepts %j', (value) => {
    expect(isContentId(value)).toBe(true);
  });

  it.each(['', 'Ferrous', 'two words', '-lead', 'trail-', 'double--dash', '1abc', 'a'.repeat(49), 42, null, undefined])(
    'rejects %j',
    (value) => {
      expect(isContentId(value)).toBe(false);
      expect(() => contentId(value)).toThrow(TypeError);
    },
  );
});

describe('entity ids', () => {
  it('rejects render/physics/native handles, which are numbers', () => {
    for (const handle of [0, 7, 1234, Number.NaN]) {
      expect(isEntityId(handle)).toBe(false);
      expect(() => entityId(handle)).toThrow(TypeError);
    }
  });

  it.each(['ent-', 'ent-ABC', 'entity-1', 'ent-1 ', 'ent-123456789012'])('rejects malformed %j', (value) => {
    expect(isEntityId(value)).toBe(false);
  });

  it('allocates unique, never-reused ids from a persisted sequence', () => {
    const allocator = new EntityIdAllocator();
    const first = allocator.allocate();
    const second = allocator.allocate();
    expect(first).toBe('ent-1');
    expect(second).toBe('ent-2');
    const resumed = new EntityIdAllocator(allocator.nextSequence);
    expect(resumed.allocate()).toBe('ent-3');
    expect(isEntityId(first)).toBe(true);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 36 ** 11])('rejects invalid sequence %j', (value) => {
    expect(() => new EntityIdAllocator(value)).toThrow(RangeError);
  });
});

describe('world and transaction ids', () => {
  it('validates their formats', () => {
    expect(isWorldId('wld-k3j2h1g0')).toBe(true);
    expect(isWorldId('wld-short')).toBe(false);
    expect(isTransactionId('txn-a1')).toBe(true);
    expect(isTransactionId('txn-')).toBe(false);
    expect(isTransactionId(12)).toBe(false);
  });
});
