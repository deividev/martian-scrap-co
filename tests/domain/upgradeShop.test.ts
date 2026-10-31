import { describe, expect, it } from 'vitest';
import { SharedCredits } from '../../src/domain/economy';
import { contentId, transactionId } from '../../src/domain/ids';
import { MaterialSelector } from '../../src/domain/materialSelector';
import { collectorUpgradeOffers, UpgradeShop } from '../../src/domain/upgradeShop';
import { credits } from '../../src/domain/units';

const HOST = 'host';
const GUEST = 'guest-1';
const OTHER = 'guest-2';
const txn = (n: number) => transactionId(`txn-buy${n}`);

function setup(balance: number) {
  const selector = new MaterialSelector(
    [[contentId('ferrous')], [contentId('aluminum'), contentId('copper')], [contentId('polymer')]],
    () => false,
  );
  const wallet = new SharedCredits(balance);
  const shop = new UpgradeShop(wallet, HOST, collectorUpgradeOffers(selector, [credits(80), credits(240)]));
  return { selector, wallet, shop };
}

describe('UpgradeShop', () => {
  it('host buys directly: the debit and the visible effect happen together and are announced', () => {
    const { selector, wallet, shop } = setup(100);
    const result = shop.buy(HOST, 'collector-2', txn(1));
    expect(result).toMatchObject({ ok: true, kind: 'purchased', buyer: HOST, cost: 80, balance: 20 });
    expect(wallet.balance).toBe(20);
    expect(selector.tier).toBe(1);
    expect(selector.available()).toEqual(['ferrous', 'aluminum', 'copper']);
    expect(shop.drainAnnouncements()).toEqual([
      { kind: 'purchased', buyer: HOST, offerId: 'collector-2', cost: 80, balance: 20 },
    ]);
  });

  it('insufficient credits take nothing and grant nothing, for host and approved guest alike', () => {
    const { selector, wallet, shop } = setup(79);
    expect(shop.buy(HOST, 'collector-2', txn(1))).toEqual({ ok: false, reason: 'insufficient-credits' });
    const request = shop.buy(GUEST, 'collector-2', txn(2));
    expect(request.ok && request.kind === 'requested').toBe(true);
    const id = request.ok && request.kind === 'requested' ? request.request.id : '';
    expect(shop.approve(HOST, id, txn(3))).toEqual({ ok: false, reason: 'insufficient-credits' });
    expect(wallet.balance).toBe(79);
    expect(selector.tier).toBe(0);
    expect(shop.pending()).toHaveLength(1);
    // The same transaction can be retried once the crew sells more.
    wallet.deposit(credits(1));
    expect(shop.approve(HOST, id, txn(3))).toMatchObject({ ok: true, buyer: GUEST, balance: 0 });
    expect(shop.pending()).toEqual([]);
  });

  it('a guest without permission only sends a request; the host approves or declines it', () => {
    const { selector, wallet, shop } = setup(200);
    const first = shop.buy(GUEST, 'collector-2', txn(1));
    const again = shop.buy(GUEST, 'collector-2', txn(2));
    expect(first).toMatchObject({ ok: true, kind: 'requested', request: { requester: GUEST, price: 80 } });
    expect(again).toEqual(first);
    expect(wallet.balance).toBe(200);
    expect(selector.tier).toBe(0);
    const id = first.ok && first.kind === 'requested' ? first.request.id : '';

    expect(shop.approve(GUEST, id, txn(3))).toEqual({ ok: false, reason: 'not-host' });
    expect(shop.decline(GUEST, id)).toBe(false);
    expect(shop.decline(HOST, id)).toBe(true);
    expect(shop.pending()).toEqual([]);
    expect(shop.drainAnnouncements().map((a) => a.kind)).toEqual(['requested', 'declined']);

    const retry = shop.buy(GUEST, 'collector-2', txn(4));
    const retryId = retry.ok && retry.kind === 'requested' ? retry.request.id : '';
    expect(shop.approve(HOST, retryId, txn(5))).toMatchObject({ ok: true, kind: 'purchased', buyer: GUEST });
    expect(wallet.balance).toBe(120);
    expect(selector.tier).toBe(1);
  });

  it('only the host grants "Can spend", and that guest then buys directly', () => {
    const { wallet, shop } = setup(100);
    expect(shop.setCanSpend(GUEST, OTHER, true)).toBe(false);
    expect(shop.setCanSpend(HOST, GUEST, true)).toBe(true);
    expect(shop.buy(GUEST, 'collector-2', txn(1))).toMatchObject({ ok: true, kind: 'purchased', buyer: GUEST });
    expect(wallet.balance).toBe(20);
    expect(shop.setCanSpend(HOST, GUEST, false)).toBe(true);
    expect(shop.canSpendDirectly(GUEST)).toBe(false);
  });

  it('concurrent purchases of the same upgrade charge once; a resubmitted transaction replays', () => {
    const { selector, wallet, shop } = setup(500);
    shop.setCanSpend(HOST, GUEST, true);
    const host = shop.buy(HOST, 'collector-2', txn(1));
    const guest = shop.buy(GUEST, 'collector-2', txn(2));
    const replay = shop.buy(HOST, 'collector-2', txn(1));
    expect(host).toMatchObject({ ok: true, kind: 'purchased', replayed: false });
    expect(guest).toEqual({ ok: false, reason: 'not-available' });
    expect(replay).toMatchObject({ ok: true, kind: 'purchased', replayed: true, balance: 420 });
    expect(wallet.balance).toBe(420);
    expect(selector.tier).toBe(1);
  });

  it('an approval loses to a direct purchase made meanwhile and the stale request closes', () => {
    const { wallet, shop } = setup(500);
    const request = shop.buy(GUEST, 'collector-2', txn(1));
    const id = request.ok && request.kind === 'requested' ? request.request.id : '';
    shop.buy(HOST, 'collector-2', txn(2));
    expect(shop.approve(HOST, id, txn(3))).toEqual({ ok: false, reason: 'not-available' });
    expect(shop.pending()).toEqual([]);
    expect(wallet.balance).toBe(420);
  });

  it('collector levels are sold in order and end at the top tier', () => {
    const { selector, shop } = setup(1000);
    expect(shop.buy(HOST, 'collector-3', txn(1))).toEqual({ ok: false, reason: 'not-available' });
    shop.buy(HOST, 'collector-2', txn(2));
    expect(shop.buy(HOST, 'collector-3', txn(3))).toMatchObject({ ok: true, cost: 240 });
    expect(selector.tier).toBe(selector.maxTier);
    expect(shop.buy(HOST, 'collector-4', txn(4))).toEqual({ ok: false, reason: 'unknown-offer' });
  });
});
