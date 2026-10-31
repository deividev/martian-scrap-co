import { describe, expect, it } from 'vitest';
import { contentId, entityId, transactionId, type EntityId, type TransactionId } from '../../src/domain/ids';
import { LocalNetwork } from '../../src/net/localTransport';
import {
  PROTOCOL_VERSION,
  decodeHostMessage,
  encodeMessage,
  type ClientMessage,
  type HostMessage,
  type Intent,
  type SessionId,
} from '../../src/net/protocol';
import type { ClientTransport, PeerId } from '../../src/net/transport';
import {
  HOST_SLOT,
  HostRouter,
  type PurchaseRequest,
  type WorldAuthority,
  type WorldIntent,
  type WorldOutcome,
} from '../../src/simulation/host/hostRouter';

const SESSION = 'ses-router001' as SessionId;
const id = (n: number): EntityId => entityId(`ent-${n}`);
const UPGRADE = contentId('collector-tier-2');

/** A small authoritative world: pieces, bales and shared credits. */
class FakeWorld implements WorldAuthority {
  readonly pieces = new Set<EntityId>([id(1), id(2), id(3), id(4)]);
  readonly bales = new Set<EntityId>([id(20)]);
  readonly settled: EntityId[] = [];
  /** Objects only some slots can reach. */
  readonly outOfReach = new Map<EntityId, number[]>();
  credits = 100;
  applied = 0;

  checkClaim(target: EntityId, slot: number) {
    if (!this.pieces.has(target) && !this.bales.has(target)) return 'unavailable' as const;
    if (this.outOfReach.get(target)?.includes(slot)) return 'out-of-reach' as const;
    return null;
  }

  settleReleased(target: EntityId): void {
    this.settled.push(target);
  }

  apply(intent: WorldIntent, slot: number): WorldOutcome {
    this.applied += 1;
    if (intent.kind === 'collect') {
      if (!intent.targets.every((t) => this.pieces.has(t))) return { ok: false, reason: 'unavailable' };
      for (const t of intent.targets) this.pieces.delete(t);
      return { ok: true, events: [{ kind: 'collected', pieces: intent.targets, collector: slot }] };
    }
    if (intent.kind === 'sell') {
      if (!this.bales.delete(intent.target)) return { ok: false, reason: 'unavailable' };
      this.credits += 40;
      return { ok: true, events: [{ kind: 'sold', bale: intent.target, credits: 40, balance: this.credits }] };
    }
    if (intent.kind === 'purchase') {
      if (this.credits < 60) return { ok: false, reason: 'insufficient-credits' };
      this.credits -= 60;
      return { ok: true, events: [{ kind: 'purchased', offer: intent.offer, balance: this.credits }] };
    }
    return { ok: false, reason: 'unavailable' };
  }
}

/** A guest that keeps the replicated view: revision, holders and what the host said to it. */
class Guest {
  slot = -1;
  generation = 0;
  revision = 0;
  session: SessionId | undefined;
  readonly holders = new Map<EntityId, number>();
  readonly rejects: string[] = [];
  readonly events: number[] = [];
  closed: string | undefined;
  #txn = 0;

  constructor(
    readonly transport: ClientTransport,
    readonly tag: string,
  ) {
    transport.onMessage((channel, raw) => {
      const decoded = decodeHostMessage(raw, channel);
      if (decoded.ok) this.#apply(decoded.message);
    });
    this.raw({ type: 'hello', protocol: PROTOCOL_VERSION, build: '0.0.0' });
  }

  raw(message: ClientMessage): void {
    const { channel, raw } = encodeMessage(message);
    this.transport.send(channel, raw);
  }

  #apply(message: HostMessage): void {
    if (message.type === 'welcome') {
      Object.assign(this, { slot: message.slot, generation: message.generation, session: message.session });
      this.revision = message.revision;
    } else if (message.type === 'event') {
      if (message.revision <= this.revision) return;
      this.revision = message.revision;
      this.events.push(message.revision);
      if (message.event.kind === 'claimed') this.holders.set(message.event.target, message.event.holder);
      if (message.event.kind === 'released') this.holders.delete(message.event.target);
    } else if (message.type === 'reject') {
      this.rejects.push(message.reason);
    } else if (message.type === 'closed') {
      this.closed = message.reason;
    }
  }

  nextTxn(): TransactionId {
    this.#txn += 1;
    return transactionId(`txn-${this.tag}${this.#txn}`);
  }

  act(intent: Intent, basis = this.revision): void {
    if (!this.session) throw new Error(`${this.tag} was not welcomed`);
    this.raw({
      type: 'intent',
      session: this.session,
      generation: this.generation,
      txn: this.nextTxn(),
      basis,
      intent,
    });
  }
}

function setup(guests = 2): { network: LocalNetwork; router: HostRouter; world: FakeWorld; crew: Guest[] } {
  const network = new LocalNetwork();
  const world = new FakeWorld();
  const router = new HostRouter(network.host(), { session: SESSION, world });
  const crew = Array.from({ length: guests }, (_, i) => new Guest(network.connect(`steam-${i + 1}`), `g${i + 1}`));
  network.flush();
  return { network, router, world, crew };
}

describe('host router: membership and session policy', () => {
  it('welcomes guests into slots 1–3 next to the host', () => {
    const { router, crew } = setup(3);
    expect(crew.map((g) => g.slot)).toEqual([1, 2, 3]);
    expect(router.slots).toEqual([0, 1, 2, 3]);
  });

  it('refuses a fifth player as full (MSC-003 T3)', () => {
    const { network, crew } = setup(3);
    const fifth = new Guest(network.connect('steam-5'), 'g5');
    network.flush();
    expect(fifth.closed).toBe('full');
    expect(fifth.transport.open).toBe(false);
    expect(crew.every((g) => g.closed === undefined)).toBe(true);
  });

  it('refuses another protocol version before any state change (MSC-003 T4)', () => {
    const { network, router } = setup(0);
    const old = network.connect('steam-old');
    const said: string[] = [];
    old.onMessage((channel, raw) => {
      const decoded = decodeHostMessage(raw, channel);
      said.push(decoded.ok ? decoded.message.type : 'undecodable');
    });
    old.send('reliable', JSON.stringify({ type: 'hello', protocol: PROTOCOL_VERSION - 1, build: '0.0.0' }));
    network.flush();
    expect(said).toEqual(['incompatible']);
    expect(old.open).toBe(false);
    expect(router.slots).toEqual([HOST_SLOT]);
  });

  it('keeps a locked session closed to new joins without affecting the crew', () => {
    const { network, router, crew } = setup(1);
    router.setLocked(true);
    const late = new Guest(network.connect('steam-9'), 'late');
    network.flush();
    expect(late.closed).toBe('locked');
    crew[0]?.act({ kind: 'claim', target: id(1) });
    network.flush();
    expect(router.claims.holderOf(id(1))).toBe('player-1');
  });
});

describe('host router: claims', () => {
  it('gives one owner when two guests claim the same object at once', () => {
    const { network, router, crew } = setup(2);
    const [a, b] = crew as [Guest, Guest];
    a.act({ kind: 'claim', target: id(1) });
    b.act({ kind: 'claim', target: id(1) });
    network.flush();
    expect(router.claims.holderOf(id(1))).toBe('player-1');
    expect(b.rejects).toEqual(['claimed-by-other']);
    expect(a.holders.get(id(1))).toBe(1);
    expect(b.holders.get(id(1))).toBe(1);
  });

  it('keeps exactly one owner per object across many interleaved races', () => {
    const { network, router, crew } = setup(3);
    for (let round = 0; round < 20; round += 1) {
      for (const [i, guest] of crew.entries()) {
        const target = id(1 + ((round + i) % 4));
        guest.act({ kind: round % 3 === 2 ? 'release' : 'claim', target });
      }
      network.flush();
      router.beginStep();
    }
    const owners = new Map<EntityId, number>();
    for (const target of [1, 2, 3, 4].map(id)) {
      const holder = router.claims.holderOf(target);
      if (holder) owners.set(target, Number(holder.split('-')[1]));
    }
    for (const guest of crew) {
      expect(guest.revision).toBe(router.revision);
      expect(new Map(guest.holders)).toEqual(owners);
    }
  });

  it('lets only the holder release, sell or cut a held object', () => {
    const { network, router, world, crew } = setup(2);
    const [a, b] = crew as [Guest, Guest];
    a.act({ kind: 'claim', target: id(20) });
    network.flush();
    b.act({ kind: 'release', target: id(20) });
    b.act({ kind: 'sell', target: id(20), machine: id(30) });
    network.flush();
    expect(b.rejects).toEqual(['not-held', 'claimed-by-other']);
    expect(world.bales.has(id(20))).toBe(true);
    expect(router.claims.holderOf(id(20))).toBe('player-1');
  });

  it('passes the world’s refusal back to the sender only', () => {
    const { network, world, crew } = setup(2);
    const [a, b] = crew as [Guest, Guest];
    world.outOfReach.set(id(2), [1]);
    a.act({ kind: 'claim', target: id(2) });
    a.act({ kind: 'claim', target: id(99) });
    network.flush();
    expect(a.rejects).toEqual(['out-of-reach', 'unavailable']);
    expect(b.rejects).toEqual([]);
  });

  it('applies the host’s own actions by the same rules', () => {
    const { network, router, crew } = setup(1);
    crew[0]?.act({ kind: 'claim', target: id(3) });
    network.flush();
    expect(router.submit({ kind: 'claim', target: id(3) }, transactionId('txn-h1'))).toEqual({
      status: 'rejected',
      reason: 'claimed-by-other',
    });
    expect(router.submit({ kind: 'claim', target: id(4) }, transactionId('txn-h2')).status).toBe('committed');
    network.flush();
    expect(crew[0]?.holders.get(id(4))).toBe(HOST_SLOT);
  });
});

describe('host router: stale and invalid intents', () => {
  it('rejects an intent based on a view older than the target’s last change', () => {
    const { network, world, crew } = setup(2);
    const [a, b] = crew as [Guest, Guest];
    const basis = b.revision;
    a.act({ kind: 'collect', targets: [id(1)] });
    network.flush();
    b.act({ kind: 'collect', targets: [id(1)] }, basis);
    network.flush();
    expect(b.rejects).toEqual(['stale-revision']);
    // With an up-to-date view the world itself says the piece is gone.
    b.act({ kind: 'collect', targets: [id(1)] });
    network.flush();
    expect(b.rejects).toEqual(['stale-revision', 'unavailable']);
    expect(world.applied).toBe(2);
  });

  it('rejects a basis from the future as invalid', () => {
    const { network, world, crew } = setup(1);
    crew[0]?.act({ kind: 'collect', targets: [id(1)] }, 50);
    network.flush();
    expect(crew[0]?.rejects).toEqual(['invalid']);
    expect(world.applied).toBe(0);
  });

  it('ignores intents bound to another session or an earlier connection', () => {
    const { network, router, world, crew } = setup(1);
    const a = crew[0] as Guest;
    a.raw({
      type: 'intent',
      session: 'ses-otherlob' as SessionId,
      generation: a.generation,
      txn: a.nextTxn(),
      basis: 0,
      intent: { kind: 'collect', targets: [id(1)] },
    });
    a.raw({
      type: 'intent',
      session: SESSION,
      generation: a.generation + 1,
      txn: a.nextTxn(),
      basis: 0,
      intent: { kind: 'collect', targets: [id(1)] },
    });
    network.flush();
    expect(world.applied).toBe(0);
    expect(router.revision).toBe(0);
    expect(a.transport.open).toBe(true);
  });

  it('disconnects a connection that sends anything but a valid hello first', () => {
    const { network, router, world } = setup(0);
    const intruder = network.connect('steam-x');
    intruder.send(
      'reliable',
      encodeMessage({
        type: 'intent',
        session: SESSION,
        generation: 1,
        txn: transactionId('txn-x1'),
        basis: 0,
        intent: { kind: 'collect', targets: [id(1)] },
      }).raw,
    );
    network.flush();
    expect(intruder.open).toBe(false);
    expect(world.applied).toBe(0);
    expect(router.slots).toEqual([HOST_SLOT]);
  });

  it('drops forged results and disconnects after repeated invalid frames', () => {
    const { network, router, crew } = setup(1);
    const a = crew[0] as Guest;
    const forged = JSON.stringify({
      type: 'event',
      session: SESSION,
      revision: 1,
      txn: null,
      actor: 0,
      event: { kind: 'sold', bale: 'ent-20', credits: 9999, balance: 9999 },
    });
    for (let i = 0; i < 8; i += 1) a.transport.send('reliable', forged);
    network.flush();
    expect(a.transport.open).toBe(true);
    expect(router.revision).toBe(0);
    a.transport.send('reliable', '{"type":"intent","credits":1}');
    network.flush();
    expect(a.closed).toBe('protocol-error');
    expect(router.slots).toEqual([HOST_SLOT]);
  });

  it('rate-limits a flood of intents within one simulation step', () => {
    const network = new LocalNetwork();
    const router = new HostRouter(network.host(), { session: SESSION, world: new FakeWorld(), maxIntentsPerStep: 3 });
    const a = new Guest(network.connect('steam-1'), 'a');
    network.flush();
    for (let i = 0; i < 5; i += 1) a.act({ kind: 'claim', target: id(1 + (i % 4)) });
    network.flush();
    expect(a.rejects).toEqual(['rate-limited', 'rate-limited']);
    router.beginStep();
    a.act({ kind: 'claim', target: id(4) });
    network.flush();
    expect(a.rejects).toHaveLength(2);
    expect(router.claims.holderOf(id(4))).toBe('player-1');
  });
});

describe('host router: permissions, removal and recovery', () => {
  it('turns a guest purchase into a host request unless the guest can spend (MSC-003 T5)', () => {
    const { network, router, world, crew } = setup(1);
    const a = crew[0] as Guest;
    const requests: PurchaseRequest[] = [];
    router.onPurchaseRequest((request) => requests.push(request));
    a.act({ kind: 'purchase', offer: UPGRADE });
    network.flush();
    expect(a.rejects).toEqual(['awaiting-host']);
    expect(requests).toMatchObject([{ slot: 1, offer: UPGRADE }]);
    expect(world.credits).toBe(100);
    router.setCanSpend(1, true);
    a.act({ kind: 'purchase', offer: UPGRADE });
    network.flush();
    expect(world.credits).toBe(40);
    expect(a.events).toHaveLength(1);
  });

  it('commits one of two simultaneous purchases when funds cover only one (MSC-003 T6)', () => {
    const { network, router, world, crew } = setup(2);
    router.setCanSpend(1, true);
    router.setCanSpend(2, true);
    for (const guest of crew) guest.act({ kind: 'purchase', offer: UPGRADE });
    network.flush();
    expect(world.credits).toBe(40);
    expect(crew[1]?.rejects).toEqual(['insufficient-credits']);
  });

  it('releases a removed guest’s objects safely and keeps them out until re-invited (MSC-003 T8)', () => {
    const { network, router, world, crew } = setup(2);
    const [a, b] = crew as [Guest, Guest];
    a.act({ kind: 'claim', target: id(2) });
    network.flush();
    router.remove(a.slot);
    network.flush();
    expect(a.closed).toBe('removed');
    expect(world.settled).toEqual([id(2)]);
    expect(b.holders.has(id(2))).toBe(false);

    const again = new Guest(network.connect('steam-1'), 'again');
    network.flush();
    expect(again.closed).toBe('removed');

    router.invite('steam-1' as PeerId);
    const invited = new Guest(network.connect('steam-1'), 'invited');
    network.flush();
    expect(invited.slot).toBe(1);
    expect(invited.generation).toBe(2);
  });

  it('releases what a departing guest held and gives them back their slot on rejoin (MSC-003 T9)', () => {
    const { network, router, world, crew } = setup(2);
    const [a, b] = crew as [Guest, Guest];
    a.act({ kind: 'claim', target: id(1) });
    network.flush();
    a.transport.close();
    network.flush();
    expect(router.claims.holderOf(id(1))).toBeUndefined();
    expect(world.settled).toEqual([id(1)]);
    expect(b.holders.has(id(1))).toBe(false);
    const back = new Guest(network.connect('steam-1'), 'back');
    network.flush();
    expect(back.slot).toBe(1);
    expect(back.generation).toBe(2);
    expect(back.revision).toBe(router.revision);
    expect(back.holders.size).toBe(0);
  });

  it('answers a resync from the event log, or asks for a snapshot when the gap is older', () => {
    const network = new LocalNetwork();
    const router = new HostRouter(network.host(), { session: SESSION, world: new FakeWorld(), eventLogSize: 2 });
    const a = new Guest(network.connect('steam-1'), 'a');
    network.flush();
    for (const n of [1, 2, 3]) router.submit({ kind: 'claim', target: id(n) }, transactionId(`txn-h${n}`));
    network.flush();
    expect(a.revision).toBe(3);
    const needed: number[] = [];
    router.onSnapshotNeeded((slot) => needed.push(slot));
    a.revision = 1;
    a.raw({ type: 'resync', session: SESSION, generation: a.generation, fromRevision: 1 });
    network.flush();
    expect(a.revision).toBe(3);
    expect(needed).toEqual([]);
    a.raw({ type: 'resync', session: SESSION, generation: a.generation, fromRevision: 0 });
    network.flush();
    expect(needed).toEqual([1]);
  });
});
