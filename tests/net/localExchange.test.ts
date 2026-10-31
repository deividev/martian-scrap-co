import { describe, expect, it } from 'vitest';
import { entityId, transactionId, type EntityId, type TransactionId } from '../../src/domain/ids';
import { LocalNetwork } from '../../src/net/localTransport';
import {
  PROTOCOL_VERSION,
  decodeClientMessage,
  decodeHostMessage,
  encodeMessage,
  type ClientMessage,
  type HostMessage,
  type Intent,
  type SessionId,
} from '../../src/net/protocol';
import type { ClientTransport, HostTransport, PeerId } from '../../src/net/transport';

/**
 * Minimal claim-only host used to exercise the protocol over the local transport. Real host validation and the
 * idempotency cache are MSC-022 and MSC-023; this fixture only shows the protocol carries what they need.
 */
class ClaimHost {
  readonly session = 'ses-local0001' as SessionId;
  revision = 0;
  readonly holders = new Map<EntityId, number>();
  readonly rejectedFrames: string[] = [];
  readonly #members = new Map<PeerId, { slot: number; generation: number }>();
  readonly #generations = new Map<number, number>();
  readonly #answered = new Map<TransactionId, HostMessage>();
  readonly #transport: HostTransport;

  constructor(transport: HostTransport) {
    this.#transport = transport;
    transport.onMessage((peer, channel, raw) => {
      const decoded = decodeClientMessage(raw, channel);
      if (!decoded.ok) {
        this.rejectedFrames.push(decoded.error);
        return;
      }
      this.#handle(peer, decoded.message);
    });
    transport.onPeerLeft((peer) => {
      const member = this.#members.get(peer);
      this.#members.delete(peer);
      if (!member) return;
      // A departed player's claims are released so nothing stays held by nobody.
      for (const [target, slot] of this.holders) {
        if (slot === member.slot) this.#commit(null, 0, { kind: 'released', target });
      }
    });
  }

  #send(peer: PeerId, message: HostMessage): void {
    const { channel, raw } = encodeMessage(message);
    this.#transport.send(peer, channel, raw);
  }

  #commit(
    txn: TransactionId | null,
    actor: number,
    event: Extract<HostMessage, { type: 'event' }>['event'],
  ): HostMessage {
    if (event.kind === 'claimed') this.holders.set(event.target, event.holder);
    if (event.kind === 'released') this.holders.delete(event.target);
    this.revision += 1;
    const message: HostMessage = { type: 'event', session: this.session, revision: this.revision, txn, actor, event };
    const { channel, raw } = encodeMessage(message);
    this.#transport.broadcast(channel, raw);
    return message;
  }

  #handle(peer: PeerId, message: ClientMessage): void {
    if (message.type === 'hello') {
      if (message.protocol !== PROTOCOL_VERSION) {
        this.#send(peer, { type: 'incompatible', protocol: PROTOCOL_VERSION });
        this.#transport.disconnect(peer, 'kicked');
        return;
      }
      const used = new Set([...this.#members.values()].map((m) => m.slot));
      const slot = [1, 2, 3].find((s) => !used.has(s));
      if (slot === undefined) {
        this.#send(peer, { type: 'closed', reason: 'full' });
        this.#transport.disconnect(peer, 'kicked');
        return;
      }
      const generation = (this.#generations.get(slot) ?? 0) + 1;
      this.#generations.set(slot, generation);
      this.#members.set(peer, { slot, generation });
      this.#send(peer, {
        type: 'welcome',
        protocol: PROTOCOL_VERSION,
        session: this.session,
        generation,
        slot,
        revision: this.revision,
      });
      return;
    }
    const member = this.#members.get(peer);
    // Membership comes from the transport identity plus the current binding, never from the payload alone.
    if (!member || message.session !== this.session || message.generation !== member.generation) {
      this.rejectedFrames.push('binding');
      return;
    }
    if (message.type !== 'intent') return;
    const previous = this.#answered.get(message.txn);
    if (previous) {
      // A repeated transaction gets its first answer again and changes nothing.
      this.#send(peer, previous);
      return;
    }
    this.#answered.set(message.txn, this.#decide(peer, message.txn, member.slot, message.intent));
  }

  #decide(peer: PeerId, txn: TransactionId, slot: number, intent: Intent): HostMessage {
    if (intent.kind !== 'claim') return this.#reject(peer, txn, 'invalid');
    const holder = this.holders.get(intent.target);
    if (holder !== undefined && holder !== slot) return this.#reject(peer, txn, 'claimed-by-other');
    return this.#commit(txn, slot, { kind: 'claimed', target: intent.target, holder: slot });
  }

  #reject(peer: PeerId, txn: TransactionId, reason: 'invalid' | 'claimed-by-other'): HostMessage {
    const message: HostMessage = { type: 'reject', session: this.session, txn, reason, revision: this.revision };
    this.#send(peer, message);
    return message;
  }
}

/** A guest that applies events in revision order and records rejections and gaps. */
class Guest {
  slot = -1;
  session: SessionId | undefined;
  generation = 0;
  revision = 0;
  readonly holders = new Map<EntityId, number>();
  readonly rejects: string[] = [];
  readonly gaps: number[] = [];
  /** Events received again (a repeated answer); already applied, so ignored. */
  readonly duplicates: number[] = [];
  closedBy: string | undefined;
  #nextTxn = 1;
  readonly transport: ClientTransport;
  readonly #tag: string;

  constructor(transport: ClientTransport, tag: string, protocol = PROTOCOL_VERSION) {
    this.transport = transport;
    this.#tag = tag;
    transport.onMessage((channel, raw) => {
      const decoded = decodeHostMessage(raw, channel);
      if (decoded.ok) this.#apply(decoded.message);
    });
    transport.onClosed((reason) => (this.closedBy = reason));
    this.#send({ type: 'hello', protocol, build: '0.0.0' });
  }

  #send(message: ClientMessage): void {
    const { channel, raw } = encodeMessage(message);
    this.transport.send(channel, raw);
  }

  #apply(message: HostMessage): void {
    if (message.type === 'welcome') {
      this.slot = message.slot;
      this.session = message.session;
      this.generation = message.generation;
      this.revision = message.revision;
    } else if (message.type === 'event') {
      if (message.revision <= this.revision) {
        this.duplicates.push(message.revision);
        return;
      }
      if (message.revision !== this.revision + 1) this.gaps.push(message.revision);
      this.revision = message.revision;
      if (message.event.kind === 'claimed') this.holders.set(message.event.target, message.event.holder);
      if (message.event.kind === 'released') this.holders.delete(message.event.target);
    } else if (message.type === 'reject') {
      this.rejects.push(`${message.txn}:${message.reason}`);
    } else if (message.type === 'incompatible') {
      this.rejects.push('incompatible');
    }
  }

  claim(target: EntityId, txn: TransactionId = transactionId(`txn-${this.#tag}${this.#nextTxn++}`)): TransactionId {
    if (!this.session) throw new Error('not welcomed');
    this.#send({
      type: 'intent',
      session: this.session,
      generation: this.generation,
      txn,
      basis: this.revision,
      intent: { kind: 'claim', target },
    });
    return txn;
  }

  /** Sends a raw intent with an explicit binding (stale packets after a reconnect). */
  claimWithBinding(target: EntityId, session: SessionId, generation: number): void {
    this.#send({
      type: 'intent',
      session,
      generation,
      txn: transactionId(`txn-${this.#tag}x${this.#nextTxn++}`),
      basis: this.revision,
      intent: { kind: 'claim', target },
    });
  }
}

const crate = entityId('ent-a');
const bale = entityId('ent-b');

function setup(): { network: LocalNetwork; host: ClaimHost; a: Guest; b: Guest } {
  const network = new LocalNetwork();
  const host = new ClaimHost(network.host());
  const a = new Guest(network.connect(), 'a');
  const b = new Guest(network.connect(), 'b');
  network.flush();
  return { network, host, a, b };
}

describe('local two-client intent/event exchange', () => {
  it('welcomes two guests into distinct slots of one session', () => {
    const { a, b, host } = setup();
    expect([a.slot, b.slot]).toEqual([1, 2]);
    expect(a.session).toBe(host.session);
    expect(b.session).toBe(host.session);
  });

  it('gives a contested object exactly one holder and tells the loser why', () => {
    const { network, a, b, host } = setup();
    a.claim(crate);
    const lost = b.claim(crate);
    network.flush();
    expect(host.holders.get(crate)).toBe(a.slot);
    expect(a.holders.get(crate)).toBe(a.slot);
    expect(b.holders.get(crate)).toBe(a.slot);
    expect(b.rejects).toEqual([`${lost}:claimed-by-other`]);
    expect([a.revision, b.revision]).toEqual([host.revision, host.revision]);
    expect([...a.gaps, ...b.gaps]).toEqual([]);
  });

  it('replays the same scenario identically (deterministic delivery)', () => {
    const run = (): string => {
      const { network, a, b, host } = setup();
      b.claim(bale);
      a.claim(bale);
      a.claim(crate);
      network.flush();
      return JSON.stringify([...host.holders, host.revision, a.rejects, b.rejects]);
    };
    expect(run()).toBe(run());
  });

  it('answers a duplicated transaction once: no second event, same answer', () => {
    const { network, a, b, host } = setup();
    const txn = a.claim(crate);
    a.claim(crate, txn);
    network.flush();
    expect(host.revision).toBe(1);
    expect(b.revision).toBe(1);
    expect(a.duplicates).toEqual([1]);
    expect(a.gaps).toEqual([]);
  });

  it('lets a late joiner start from the current revision and follow later events', () => {
    const { network, a, host } = setup();
    a.claim(crate);
    network.flush();
    const late = new Guest(network.connect(), 'c');
    network.flush();
    expect(late.slot).toBe(3);
    expect(late.revision).toBe(host.revision);
    late.claim(bale);
    network.flush();
    expect(late.holders.get(bale)).toBe(3);
    expect(late.gaps).toEqual([]);
    expect(a.revision).toBe(host.revision);
  });

  it('releases a departed guest’s claims and refuses packets bound to its old connection', () => {
    const { network, a, b, host } = setup();
    a.claim(crate);
    network.flush();
    const oldGeneration = a.generation;
    a.transport.close();
    network.flush();
    expect(host.holders.has(crate)).toBe(false);
    expect(b.holders.has(crate)).toBe(false);

    const back = new Guest(network.connect(), 'r');
    network.flush();
    expect(back.slot).toBe(a.slot);
    expect(back.generation).toBe(oldGeneration + 1);
    back.claimWithBinding(crate, host.session, oldGeneration);
    back.claimWithBinding(crate, 'ses-otherlobby' as SessionId, back.generation);
    network.flush();
    expect(host.rejectedFrames).toEqual(['binding', 'binding']);
    expect(host.holders.has(crate)).toBe(false);
  });

  it('refuses a build with another protocol version before it can interact', () => {
    const network = new LocalNetwork();
    const host = new ClaimHost(network.host());
    const old = new Guest(network.connect(), 'o', PROTOCOL_VERSION + 1);
    network.flush();
    expect(old.rejects).toEqual(['incompatible']);
    expect(old.closedBy).toBe('kicked');
    expect(host.revision).toBe(0);
  });

  it('drops malformed or forged frames without touching the world', () => {
    const { network, a, host } = setup();
    a.transport.send('reliable', '{"type":"event","revision":99}');
    a.transport.send('disposable', JSON.stringify({ type: 'intent' }));
    a.transport.send('reliable', 'not json');
    network.flush();
    expect(host.rejectedFrames).toEqual(['schema', 'schema', 'malformed']);
    expect(host.revision).toBe(0);
  });
});

describe('local transport', () => {
  it('delivers nothing until flushed, then everything in send order', () => {
    const network = new LocalNetwork();
    const host = network.host();
    const seen: string[] = [];
    host.onMessage((peer, _channel, raw) => seen.push(`${peer}:${raw}`));
    const one = network.connect();
    const two = network.connect();
    one.send('reliable', '1');
    two.send('reliable', '2');
    one.send('reliable', '3');
    expect(seen).toEqual([]);
    network.flush();
    expect(seen).toEqual(['peer-1:1', 'peer-2:2', 'peer-1:3']);
  });

  it('drops disposable traffic and closes on reliable overflow when a receiver falls behind', () => {
    const network = new LocalNetwork({ maxQueued: 2 });
    network.host();
    const guest = network.connect();
    let closed: string | undefined;
    guest.onClosed((reason) => (closed = reason));
    guest.send('disposable', 'p1');
    guest.send('disposable', 'p2');
    guest.send('disposable', 'p3');
    expect(network.dropped).toBe(1);
    guest.send('reliable', 'r1');
    network.flush();
    expect(closed).toBe('overflow');
    expect(guest.open).toBe(false);
  });

  it('tells every guest when the host leaves (no host migration)', () => {
    const network = new LocalNetwork();
    const host = network.host();
    const reasons: string[] = [];
    for (let i = 0; i < 3; i += 1) network.connect().onClosed((reason) => reasons.push(reason));
    network.flush();
    host.close();
    network.flush();
    expect(reasons).toEqual(['host-left', 'host-left', 'host-left']);
    expect(() => network.connect()).toThrow();
  });
});
