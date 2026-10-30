import { describe, expect, it } from 'vitest';
import type { Bale } from '../../src/domain/compactor';
import { SaleTerminal, SharedCredits } from '../../src/domain/economy';
import { contentId, entityId, transactionId } from '../../src/domain/ids';

const bale = (id: string, material = 'ferrous', pieces = 10): Bale => ({
  id: entityId(id),
  materialId: contentId(material),
  pieceIds: Array.from({ length: pieces }, (_, index) => entityId(`${id}p${index}`)),
  massKg: pieces * 1.5,
});

const PRICES: Record<string, number> = { ferrous: 4, copper: 10 };

function terminal() {
  const shared = new SharedCredits();
  return { shared, sale: new SaleTerminal(shared, (material) => PRICES[material]) };
}

describe('SaleTerminal (MSC-033)', () => {
  it('previews a bale and pays the shared credits when the bale is removed', () => {
    const { shared, sale } = terminal();
    const ironBale = bale('ent-b1');
    expect(sale.quote(ironBale)).toEqual({ baleId: 'ent-b1', materialId: 'ferrous', pieces: 10, credits: 40 });
    let present = true;
    const result = sale.sell(ironBale, transactionId('txn-s1'), () => {
      const was = present;
      present = false;
      return was;
    });
    expect(result).toMatchObject({ ok: true, balance: 40, replayed: false });
    expect(shared.balance).toBe(40);
    expect(present).toBe(false);
    expect(sale.sold(ironBale.id)).toBe(true);
  });

  it('pays a duplicate submission of the same transaction only once', () => {
    const { shared, sale } = terminal();
    const copperBale = bale('ent-b2', 'copper', 5);
    let removals = 0;
    const consume = (): boolean => {
      removals += 1;
      return removals === 1;
    };
    const first = sale.sell(copperBale, transactionId('txn-s2'), consume);
    const replay = sale.sell(copperBale, transactionId('txn-s2'), consume);
    expect(first).toMatchObject({ ok: true, replayed: false });
    expect(replay).toMatchObject({ ok: true, replayed: true, balance: 50 });
    expect(removals).toBe(1);
    expect(shared.balance).toBe(50);
  });

  it('lets only one of two racing sales of the same bale pay', () => {
    const { shared, sale } = terminal();
    const contested = bale('ent-b3');
    let present = true;
    const consume = (): boolean => {
      const was = present;
      present = false;
      return was;
    };
    const a = sale.sell(contested, transactionId('txn-a'), consume);
    const b = sale.sell(contested, transactionId('txn-b'), consume);
    expect(a.ok).toBe(true);
    expect(b).toEqual({ ok: false, reason: 'already-sold' });
    expect(shared.balance).toBe(40);
  });

  it('pays nothing when the bale is gone or its material has no price', () => {
    const { shared, sale } = terminal();
    expect(sale.sell(bale('ent-b4'), transactionId('txn-c'), () => false)).toEqual({
      ok: false,
      reason: 'not-present',
    });
    expect(sale.sell(bale('ent-b5', 'polymer'), transactionId('txn-d'), () => true)).toEqual({
      ok: false,
      reason: 'unknown-material',
    });
    expect(sale.sold(entityId('ent-b4'))).toBe(false);
    expect(shared.balance).toBe(0);
  });
});
