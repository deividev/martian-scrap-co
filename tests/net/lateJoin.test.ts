import { describe, expect, it } from 'vitest';
import { entityId, transactionId, type EntityId } from '../../src/domain/ids';
import { GuestSession, type EventMessage } from '../../src/net/guestSession';
import { LocalNetwork, type FaultPlan } from '../../src/net/localTransport';
import { SNAPSHOT_LIMITS, decodeHostMessage, encodeMessage, type SessionId } from '../../src/net/protocol';
import { SnapshotAssembler, encodeSnapshot, fnv1a } from '../../src/net/snapshot';
import type { Channel } from '../../src/net/protocol';
import type { ClientTransport, CloseReason } from '../../src/net/transport';
import {
  HostRouter,
  type SessionSnapshot,
  type WorldAuthority,
  type WorldIntent,
  type WorldOutcome,
} from '../../src/simulation/host/hostRouter';

const SESSION = 'ses-latejoin1' as SessionId;
const id = (n: number): EntityId => entityId(`ent-${n.toString(36)}`);

describe('snapshot encoding', () => {
  it('round-trips a multi-chunk world, including non-ASCII text', () => {
    const state = { name: 'Chatarra férrica · Ünïcode ✓', items: Array.from({ length: 4000 }, (_, i) => `ent-${i}`) };
    const encoded = encodeSnapshot(state);
    expect(encoded.chunks.length).toBeGreaterThan(3);
    for (const chunk of encoded.chunks) expect(chunk.length).toBeLessThanOrEqual(SNAPSHOT_LIMITS.chunkBase64);
    const header = {
      snapshot: 1,
      revision: 7,
      bytes: encoded.bytes,
      chunks: encoded.chunks.length,
      checksum: encoded.checksum,
    };
    const assembler = new SnapshotAssembler(header, 0, 100);
    // Out of order and with duplicates.
    const order = [...encoded.chunks.keys()].reverse();
    for (const index of order) expect(assembler.add(1, index, encoded.chunks[index] as string)).toBe('accepted');
    expect(assembler.add(1, 0, encoded.chunks[0] as string)).toBe('duplicate');
    expect(assembler.complete(50)).toEqual({ ok: true, revision: 7, state });
  });

  it('refuses to encode a world above the size limit', () => {
    const huge = { blob: 'x'.repeat(SNAPSHOT_LIMITS.maxBytes) };
    expect(() => encodeSnapshot(huge)).toThrow(RangeError);
  });

  const setup = () => {
    const encoded = encodeSnapshot({ items: Array.from({ length: 3000 }, (_, i) => i) });
    const header = {
      snapshot: 3,
      revision: 2,
      bytes: encoded.bytes,
      chunks: encoded.chunks.length,
      checksum: encoded.checksum,
    };
    return { encoded, header };
  };

  it('is never usable while a chunk is missing', () => {
    const { encoded, header } = setup();
    const assembler = new SnapshotAssembler(header, 0, 100);
    encoded.chunks.slice(1).forEach((chunk, i) => assembler.add(3, i + 1, chunk));
    expect(assembler.complete(1)).toEqual({ ok: false, error: 'incomplete' });
    expect(assembler.missing(64)).toEqual([0]);
  });

  it('refuses chunks from another snapshot or of the wrong size', () => {
    const { encoded, header } = setup();
    const assembler = new SnapshotAssembler(header, 0, 100);
    expect(assembler.add(4, 0, encoded.chunks[0] as string)).toBe('foreign');
    expect(assembler.add(3, 0, 'AAAA')).toBe('invalid');
    expect(assembler.add(3, header.chunks, encoded.chunks[0] as string)).toBe('invalid');
    expect(assembler.add(3, 0, '!!not base64!!')).toBe('invalid');
  });

  it('detects corruption with the checksum', () => {
    const { encoded, header } = setup();
    const assembler = new SnapshotAssembler({ ...header, checksum: (header.checksum + 1) >>> 0 }, 0, 100);
    encoded.chunks.forEach((chunk, i) => assembler.add(3, i, chunk));
    expect(assembler.complete(1)).toEqual({ ok: false, error: 'checksum' });
  });

  it('expires a snapshot that took too long, even when complete', () => {
    const { encoded, header } = setup();
    const assembler = new SnapshotAssembler(header, 0, 10);
    encoded.chunks.forEach((chunk, i) => assembler.add(3, i, chunk));
    expect(assembler.complete(11)).toEqual({ ok: false, error: 'expired' });
  });

  it('flags a header whose chunk count does not match its size', () => {
    const { header } = setup();
    expect(new SnapshotAssembler({ ...header, chunks: header.chunks + 1 }, 0, 10).plausible).toBe(false);
    expect(fnv1a(new TextEncoder().encode('abc'))).toBe(0x1a47e90b);
  });
});

/** Host world: many loose pieces (so the snapshot spans several chunks) that guests collect. */
class World implements WorldAuthority {
  readonly pieces = new Set(Array.from({ length: 3000 }, (_, i) => id(i + 1)));

  checkClaim(target: EntityId) {
    return this.pieces.has(target) ? null : ('unavailable' as const);
  }

  settleReleased(): void {}

  apply(intent: WorldIntent, slot: number): WorldOutcome {
    if (intent.kind !== 'collect') return { ok: false, reason: 'unavailable' };
    if (!intent.targets.every((t) => this.pieces.has(t))) return { ok: false, reason: 'unavailable' };
    for (const t of intent.targets) this.pieces.delete(t);
    return { ok: true, events: [{ kind: 'collected', pieces: intent.targets, collector: slot }] };
  }

  snapshot(): unknown {
    return { pieces: [...this.pieces] };
  }
}

/** A guest's replicated copy of the world, rebuilt from a snapshot plus events. */
class Replica {
  pieces = new Set<EntityId>();
  holders = new Map<EntityId, number>();
  loads = 0;

  load(state: unknown): void {
    const snapshot = state as SessionSnapshot;
    this.pieces = new Set((snapshot.world as { pieces: EntityId[] }).pieces);
    this.holders = new Map(snapshot.holders);
    this.loads += 1;
  }

  apply(message: EventMessage): void {
    const event = message.event;
    if (event.kind === 'collected') for (const piece of event.pieces) this.pieces.delete(piece);
    if (event.kind === 'claimed') this.holders.set(event.target, event.holder);
    if (event.kind === 'released') this.holders.delete(event.target);
  }
}

/** Passes a guest's incoming traffic through a filter, to drop, duplicate or corrupt chosen messages. */
class Tap implements ClientTransport {
  constructor(
    readonly inner: ClientTransport,
    readonly filter: (channel: Channel, raw: string) => string[],
  ) {}

  get open(): boolean {
    return this.inner.open;
  }

  send(channel: Channel, raw: string): void {
    this.inner.send(channel, raw);
  }

  onMessage(handler: (channel: Channel, raw: string) => void): void {
    this.inner.onMessage((channel, raw) => {
      for (const out of this.filter(channel, raw)) handler(channel, out);
    });
  }

  onClosed(handler: (reason: CloseReason) => void): void {
    this.inner.onClosed(handler);
  }

  close(): void {
    this.inner.close();
  }
}

const typeOf = (raw: string): string => {
  const decoded = decodeHostMessage(raw, 'reliable');
  return decoded.ok ? decoded.message.type : 'other';
};

function scene(faults?: FaultPlan) {
  const network = new LocalNetwork(faults ? { faults } : {});
  const world = new World();
  const router = new HostRouter(network.host(), { session: SESSION, world });
  const join = (identity: string, filter?: (channel: Channel, raw: string) => string[]) => {
    const replica = new Replica();
    const transport = filter ? new Tap(network.connect(identity), filter) : network.connect(identity);
    const guest = new GuestSession(
      transport,
      { load: (state) => replica.load(state), apply: (event) => replica.apply(event) },
      { build: '0.0.0', clock: () => network.now, snapshotTimeout: 40, stallAfter: 5 },
    );
    return { guest, replica, transport };
  };
  /** Runs network time with the host collecting a piece every tick, so the world keeps changing. */
  let nextPiece = 1;
  const run = (ticks: number, guests: GuestSession[] = []) => {
    for (let i = 0; i < ticks; i += 1) {
      router.submit({ kind: 'collect', targets: [id(nextPiece)] }, transactionId(`txn-h${nextPiece}`));
      nextPiece += 1;
      router.beginStep();
      network.advance();
      for (const guest of guests) guest.tick();
    }
  };
  return { network, world, router, join, run };
}

describe('late join and catch-up (MSC-024)', () => {
  it('joins an active world: loads the snapshot, applies what happened meanwhile, then acts', () => {
    const { network, world, router, join, run } = scene({ seed: 5, reliableDelay: [0, 3] });
    run(10);
    const { guest, replica } = join('steam-1');
    expect(guest.act({ kind: 'collect', targets: [id(2999)] })).toBeUndefined();
    const loading = (): boolean => guest.state !== 'ready';
    let actedWhileLoading = 0;
    for (let i = 0; i < 30 && loading(); i += 1) {
      run(1, [guest]);
      if (loading() && guest.act({ kind: 'collect', targets: [id(2999)] }) !== undefined) actedWhileLoading += 1;
    }
    expect(actedWhileLoading).toBe(0);
    expect(guest.state).toBe('ready');
    run(5, [guest]);
    network.settle();
    expect(guest.revision).toBe(router.revision);
    expect(replica.pieces).toEqual(world.pieces);
    expect(replica.loads).toBe(1);
    expect(router.isReady(guest.slot)).toBe(true);
    // Now it may act, and the host applies it.
    guest.act({ kind: 'collect', targets: [id(2999)] });
    network.settle();
    expect(world.pieces.has(id(2999))).toBe(false);
    expect(replica.pieces.has(id(2999))).toBe(false);
  });

  it('refuses intents from a guest that has not finished loading, even if it sends them anyway', () => {
    const { network, world, join } = scene();
    const { guest, transport } = join('steam-1', (_, raw) => (typeOf(raw) === 'snapshot-chunk' ? [] : [raw]));
    network.flush();
    expect(guest.state).toBe('loading');
    const rejects: string[] = [];
    transport.onMessage((channel, raw) => {
      const decoded = decodeHostMessage(raw, channel);
      if (decoded.ok && decoded.message.type === 'reject') rejects.push(decoded.message.reason);
    });
    const session = guest.session as SessionId;
    transport.send(
      'reliable',
      encodeMessage({
        type: 'intent',
        session,
        generation: 1,
        txn: transactionId('txn-x1'),
        basis: 0,
        intent: { kind: 'collect', targets: [id(5)] },
      }).raw,
    );
    // A forged "ready" for a revision the host never reached does not unlock it either.
    transport.send('reliable', encodeMessage({ type: 'ready', session, generation: 1, revision: 999 }).raw);
    network.flush();
    expect(rejects).toEqual(['joining']);
    expect(world.pieces.has(id(5))).toBe(true);
  });

  it('asks again for omitted chunks and only becomes ready once all arrived', () => {
    const { network, world, router, join, run } = scene();
    let dropped = 0;
    const { guest, replica } = join('steam-1', (_, raw) => {
      // Drop the first delivery of chunk 1 and 3; resends get through.
      const decoded = decodeHostMessage(raw, 'reliable');
      if (
        decoded.ok &&
        decoded.message.type === 'snapshot-chunk' &&
        [1, 3].includes(decoded.message.index) &&
        dropped < 2
      ) {
        dropped += 1;
        return [];
      }
      return [raw];
    });
    run(3, [guest]);
    expect(guest.state).toBe('loading');
    expect(router.isReady(1)).toBe(false);
    run(10, [guest]);
    expect(guest.missingRequests).toBeGreaterThanOrEqual(1);
    expect(guest.state).toBe('ready');
    network.settle();
    expect(replica.pieces).toEqual(world.pieces);
  });

  it('ignores duplicated chunks and events', () => {
    const { network, world, router, join, run } = scene({ seed: 9, duplicate: 0.5, reliableDelay: [0, 2] });
    run(5);
    const { guest, replica } = join('steam-1');
    run(30, [guest]);
    network.settle();
    expect(network.duplicated).toBeGreaterThan(5);
    expect(guest.state).toBe('ready');
    expect(guest.revision).toBe(router.revision);
    expect(replica.pieces).toEqual(world.pieces);
    expect(replica.loads).toBe(1);
  });

  it('discards an expired snapshot and loads a fresh one', () => {
    const { network, world, join, run } = scene();
    let blocking = true;
    const { guest, replica } = join('steam-1', (_, raw) => (blocking && typeOf(raw) === 'snapshot-chunk' ? [] : [raw]));
    // Chunks stay blocked past the 40-tick deadline, even when the guest asks for them again.
    run(45, [guest]);
    expect(guest.state).toBe('loading');
    blocking = false;
    run(30, [guest]);
    expect(guest.discarded).toContain('expired');
    expect(guest.state).toBe('ready');
    network.settle();
    expect(replica.pieces).toEqual(world.pieces);
    expect(replica.loads).toBe(1);
  });

  it('discards a corrupt or oversize snapshot instead of loading it', () => {
    const { network, world, join, run } = scene();
    let corruptions = 0;
    const { guest, replica } = join('steam-1', (_, raw) => {
      const decoded = decodeHostMessage(raw, 'reliable');
      if (!decoded.ok) return [raw];
      const message = decoded.message;
      if (message.type === 'snapshot-begin' && message.snapshot === 1) {
        // First snapshot: claims more chunks than its size allows.
        return [encodeMessage({ ...message, chunks: message.chunks + 1 }).raw];
      }
      if (message.type === 'snapshot-chunk' && message.snapshot === 2 && message.index === 0 && corruptions === 0) {
        corruptions += 1;
        const data = message.data.startsWith('A') ? `B${message.data.slice(1)}` : `A${message.data.slice(1)}`;
        return [encodeMessage({ ...message, data }).raw];
      }
      return [raw];
    });
    run(15, [guest]);
    expect(guest.discarded).toEqual(['size', 'checksum']);
    expect(guest.state).toBe('ready');
    network.settle();
    expect(replica.pieces).toEqual(world.pieces);
  });

  it('fills a gap in events by asking the host to replay it', () => {
    const { network, world, router, join, run } = scene();
    let dropNext = false;
    const { guest, replica } = join('steam-1', (_, raw) => {
      if (dropNext && typeOf(raw) === 'event') {
        dropNext = false;
        return [];
      }
      return [raw];
    });
    run(5, [guest]);
    expect(guest.state).toBe('ready');
    dropNext = true;
    run(3, [guest]);
    network.settle();
    expect(guest.revision).toBe(router.revision);
    expect(replica.pieces).toEqual(world.pieces);
  });

  it('starts a rejoining player from the current world, without its stale claims', () => {
    const { network, router, join, run } = scene();
    const first = join('steam-1');
    run(3, [first.guest]);
    first.guest.act({ kind: 'claim', target: id(2500) });
    network.settle();
    expect(router.claims.holderOf(id(2500))).toBe('player-1');
    first.transport.close();
    network.settle();
    const back = join('steam-1');
    run(5, [back.guest]);
    network.settle();
    expect(back.guest.state).toBe('ready');
    expect(back.guest.generation).toBe(2);
    expect(back.replica.holders.has(id(2500))).toBe(false);
    expect(router.claims.holderOf(id(2500))).toBeUndefined();
  });

  it('reloads the world when a gap is older than the event log', () => {
    const network = new LocalNetwork();
    const world = new World();
    const router = new HostRouter(network.host(), { session: SESSION, world, eventLogSize: 2 });
    const replica = new Replica();
    let dropping = false;
    const tap = new Tap(network.connect('steam-1'), (_, raw) => (dropping && typeOf(raw) === 'event' ? [] : [raw]));
    const guest = new GuestSession(
      tap,
      { load: (state) => replica.load(state), apply: (event) => replica.apply(event) },
      { build: '0.0.0', clock: () => network.now },
    );
    network.settle();
    expect(guest.state).toBe('ready');
    dropping = true;
    for (let n = 1; n <= 5; n += 1) router.submit({ kind: 'collect', targets: [id(n)] }, transactionId(`txn-h${n}`));
    network.settle();
    dropping = false;
    router.submit({ kind: 'collect', targets: [id(6)] }, transactionId('txn-h6'));
    network.settle();
    expect(replica.loads).toBe(2);
    expect(guest.state).toBe('ready');
    expect(guest.revision).toBe(router.revision);
    expect(replica.pieces).toEqual(world.pieces);
  });
});
