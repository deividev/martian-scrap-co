import type { Channel } from './protocol';
import type { ClientTransport, CloseReason, HostTransport, PeerId } from './transport';

/** Messages waiting for one endpoint before reliable traffic overflows (the connection closes) or poses drop. */
const DEFAULT_MAX_QUEUED = 512;

/**
 * Deterministic fault injection (MSC-023). Times are in network ticks (`advance`). Reliable traffic may be delayed or
 * duplicated but always arrives in send order per connection, as a reliable transport guarantees; disposable traffic
 * may also be lost and, through independent delays, reordered.
 */
export interface FaultPlan {
  readonly seed: number;
  /** Extra ticks before a reliable message arrives, inclusive range. */
  readonly reliableDelay?: readonly [number, number];
  /** Extra ticks before a disposable message arrives, inclusive range; different delays reorder poses. */
  readonly disposableDelay?: readonly [number, number];
  /** Probability that a disposable message is lost. */
  readonly disposableLoss?: number;
  /** Probability that a message is delivered twice (a retransmission or an application retry). */
  readonly duplicate?: number;
}

type Payload =
  | {
      readonly to: 'host';
      readonly kind: 'message';
      readonly peer: PeerId;
      readonly channel: Channel;
      readonly raw: string;
    }
  | { readonly to: 'host'; readonly kind: 'joined'; readonly peer: PeerId }
  | { readonly to: 'host'; readonly kind: 'left'; readonly peer: PeerId; readonly reason: CloseReason }
  | {
      readonly to: 'guest';
      readonly peer: PeerId;
      readonly kind: 'message';
      readonly channel: Channel;
      readonly raw: string;
    }
  | { readonly to: 'guest'; readonly peer: PeerId; readonly kind: 'closed'; readonly reason: CloseReason };

type Delivery = Payload & { readonly due: number };

interface Guest {
  readonly peer: PeerId;
  open: boolean;
  /** Host-to-guest traffic sent before a host-side close still arrives (the host lingers to flush it). */
  lingering: boolean;
  readonly messageHandlers: ((channel: Channel, raw: string) => void)[];
  readonly closedHandlers: ((reason: CloseReason) => void)[];
}

/** Small deterministic generator (mulberry32), so a fault schedule replays exactly from its seed. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * In-memory transport for tests and local development (MSC-021). Nothing is delivered until `flush`, which hands
 * over every message due at the current tick in send order, so a scenario replays identically every run; `advance`
 * moves time on for delayed traffic (`FaultPlan`, MSC-023). Reliable messages always arrive in order; disposable
 * ones are dropped when a receiver's queue is full. This is not network evidence: real connectivity is proven only
 * on the Steam path (gate T1).
 */
export class LocalNetwork {
  readonly #queue: Delivery[] = [];
  readonly #guests = new Map<PeerId, Guest>();
  readonly #maxQueued: number;
  readonly #faults: FaultPlan | undefined;
  readonly #random: () => number;
  /** Latest due tick per connection direction, so reliable traffic never overtakes earlier traffic. */
  readonly #linkDue = new Map<string, number>();
  #host: HostEndpoint | undefined;
  #nextPeer = 1;
  #dropped = 0;
  #lost = 0;
  #duplicated = 0;
  #now = 0;

  constructor(options: { maxQueued?: number; faults?: FaultPlan } = {}) {
    this.#maxQueued = options.maxQueued ?? DEFAULT_MAX_QUEUED;
    this.#faults = options.faults;
    this.#random = seededRandom(options.faults?.seed ?? 1);
  }

  /** Disposable messages dropped because a receiver's queue was full. */
  get dropped(): number {
    return this.#dropped;
  }

  /** Disposable messages lost by fault injection. */
  get lost(): number {
    return this.#lost;
  }

  /** Messages delivered twice by fault injection. */
  get duplicated(): number {
    return this.#duplicated;
  }

  get pending(): number {
    return this.#queue.length;
  }

  get now(): number {
    return this.#now;
  }

  /** Opens the hosting endpoint; one host per network. */
  host(): HostTransport {
    if (this.#host?.open) throw new Error('A host is already open on this network');
    this.#host = new HostEndpoint(this);
    return this.#host;
  }

  /**
   * Connects a new guest; the host hears about it on the next flush. `identity` models a stable account (a Steam id
   * on the real path), so the same player can leave and come back; by default each connection is a new player.
   */
  connect(identity?: string): ClientTransport {
    if (!this.#host?.open) throw new Error('No host is open on this network');
    const peer = (identity ?? `peer-${this.#nextPeer}`) as PeerId;
    if (identity === undefined) this.#nextPeer += 1;
    if (this.#guests.get(peer)?.open) throw new Error(`${peer} is already connected`);
    const guest: Guest = { peer, open: true, lingering: false, messageHandlers: [], closedHandlers: [] };
    this.#guests.set(peer, guest);
    this.#push({ to: 'host', kind: 'joined', peer }, 'reliable');
    return new ClientEndpoint(this, guest);
  }

  /**
   * Delivers every message due by now, in order, including any sent by handlers meanwhile. Returns how many were
   * delivered.
   */
  flush(maxDeliveries = 100_000): number {
    let delivered = 0;
    while (delivered < maxDeliveries) {
      const next = this.#queue[0];
      if (!next || next.due > this.#now) break;
      this.#queue.shift();
      delivered += 1;
      if (next.to === 'host') this.#host?.deliver(next);
      else this.#deliverToGuest(next);
    }
    return delivered;
  }

  /** Moves time on by `ticks`, delivering what becomes due at each tick. */
  advance(ticks = 1): number {
    let delivered = this.flush();
    for (let i = 0; i < ticks; i += 1) {
      this.#now += 1;
      delivered += this.flush();
    }
    return delivered;
  }

  /** Advances until nothing is queued (or `maxTicks` pass); returns the ticks taken. */
  settle(maxTicks = 10_000): number {
    let ticks = 0;
    this.flush();
    while (this.#queue.length > 0 && ticks < maxTicks) {
      this.advance();
      ticks += 1;
    }
    return ticks;
  }

  /** @internal */
  enqueueToHost(peer: PeerId, channel: Channel, raw: string): void {
    const guest = this.#guests.get(peer);
    if (!guest?.open || !this.#host?.open) return;
    if (this.#queuedFor('host') >= this.#maxQueued) {
      if (channel === 'disposable') this.#dropped += 1;
      else this.dropGuest(peer, 'overflow');
      return;
    }
    this.#pushMessage({ to: 'host', kind: 'message', peer, channel, raw });
  }

  /** @internal */
  enqueueToGuest(peer: PeerId, channel: Channel, raw: string): void {
    if (!this.#guests.get(peer)?.open) return;
    if (this.#queuedFor('guest', peer) >= this.#maxQueued) {
      if (channel === 'disposable') this.#dropped += 1;
      else this.dropGuest(peer, 'overflow');
      return;
    }
    this.#pushMessage({ to: 'guest', peer, kind: 'message', channel, raw });
  }

  /** @internal Closes a guest connection: the guest learns why, and the host sees it leave. */
  dropGuest(peer: PeerId, reason: CloseReason): void {
    const guest = this.#guests.get(peer);
    if (!guest?.open) return;
    guest.open = false;
    // A host-side close lingers: what the host already sent (a refusal, a kick reason) reaches the guest first.
    // Otherwise undelivered traffic of a closed connection is gone, as on a real transport.
    guest.lingering = reason === 'kicked' || reason === 'host-left';
    for (let i = this.#queue.length - 1; i >= 0; i -= 1) {
      const queued = this.#queue[i];
      if (
        queued &&
        queued.peer === peer &&
        ((queued.to === 'guest' && !guest.lingering) || (queued.to === 'host' && queued.kind === 'message'))
      ) {
        this.#queue.splice(i, 1);
      }
    }
    this.#push({ to: 'guest', peer, kind: 'closed', reason }, 'reliable');
    if (this.#host?.open) this.#push({ to: 'host', kind: 'left', peer, reason }, 'reliable');
  }

  /** @internal */
  closeHost(): void {
    for (const guest of this.#guests.values()) this.dropGuest(guest.peer, 'host-left');
  }

  /** @internal */
  openPeers(): PeerId[] {
    return [...this.#guests.values()].filter((guest) => guest.open).map((guest) => guest.peer);
  }

  #delay(range: readonly [number, number] | undefined): number {
    if (!range) return 0;
    const [min, max] = range;
    return min + Math.floor(this.#random() * (max - min + 1));
  }

  /** Queues a payload by due tick: reliable traffic keeps send order per direction, disposable is independent. */
  #push(payload: Payload, channel: Channel): void {
    const faults = this.#faults;
    let due = this.#now + this.#delay(channel === 'reliable' ? faults?.reliableDelay : faults?.disposableDelay);
    if (channel === 'reliable') {
      const link = `${payload.to}:${payload.peer}`;
      due = Math.max(due, this.#linkDue.get(link) ?? 0);
      this.#linkDue.set(link, due);
    }
    // Ordered by due tick, then by send order.
    let index = this.#queue.length;
    while (index > 0 && (this.#queue[index - 1]?.due ?? 0) > due) index -= 1;
    this.#queue.splice(index, 0, { ...payload, due });
  }

  #pushMessage(payload: Extract<Payload, { kind: 'message' }>): void {
    const faults = this.#faults;
    if (faults && payload.channel === 'disposable' && this.#random() < (faults.disposableLoss ?? 0)) {
      this.#lost += 1;
      return;
    }
    this.#push(payload, payload.channel);
    if (faults && this.#random() < (faults.duplicate ?? 0)) {
      this.#duplicated += 1;
      this.#push(payload, payload.channel);
    }
  }

  #queuedFor(to: 'host' | 'guest', peer?: PeerId): number {
    let count = 0;
    for (const delivery of this.#queue) {
      if (delivery.to === to && delivery.kind === 'message' && (peer === undefined || delivery.peer === peer))
        count += 1;
    }
    return count;
  }

  #deliverToGuest(delivery: Extract<Payload, { to: 'guest' }>): void {
    const guest = this.#guests.get(delivery.peer);
    if (!guest) return;
    if (delivery.kind === 'closed') {
      guest.lingering = false;
      for (const handler of guest.closedHandlers) handler(delivery.reason);
      return;
    }
    if (!guest.open && !guest.lingering) return;
    for (const handler of guest.messageHandlers) handler(delivery.channel, delivery.raw);
  }
}

class HostEndpoint implements HostTransport {
  readonly #network: LocalNetwork;
  readonly #messageHandlers: ((peer: PeerId, channel: Channel, raw: string) => void)[] = [];
  readonly #joinedHandlers: ((peer: PeerId) => void)[] = [];
  readonly #leftHandlers: ((peer: PeerId, reason: CloseReason) => void)[] = [];
  open = true;

  constructor(network: LocalNetwork) {
    this.#network = network;
  }

  get peers(): readonly PeerId[] {
    return this.#network.openPeers();
  }

  send(peer: PeerId, channel: Channel, raw: string): void {
    if (this.open) this.#network.enqueueToGuest(peer, channel, raw);
  }

  broadcast(channel: Channel, raw: string): void {
    for (const peer of this.peers) this.send(peer, channel, raw);
  }

  disconnect(peer: PeerId, reason: CloseReason): void {
    this.#network.dropGuest(peer, reason);
  }

  onMessage(handler: (peer: PeerId, channel: Channel, raw: string) => void): void {
    this.#messageHandlers.push(handler);
  }

  onPeerJoined(handler: (peer: PeerId) => void): void {
    this.#joinedHandlers.push(handler);
  }

  onPeerLeft(handler: (peer: PeerId, reason: CloseReason) => void): void {
    this.#leftHandlers.push(handler);
  }

  close(): void {
    if (!this.open) return;
    this.#network.closeHost();
    this.open = false;
  }

  deliver(delivery: Extract<Payload, { to: 'host' }>): void {
    if (!this.open) return;
    if (delivery.kind === 'message')
      for (const handler of this.#messageHandlers) handler(delivery.peer, delivery.channel, delivery.raw);
    else if (delivery.kind === 'joined') for (const handler of this.#joinedHandlers) handler(delivery.peer);
    else for (const handler of this.#leftHandlers) handler(delivery.peer, delivery.reason);
  }
}

class ClientEndpoint implements ClientTransport {
  readonly #network: LocalNetwork;
  readonly #guest: Guest;

  constructor(network: LocalNetwork, guest: Guest) {
    this.#network = network;
    this.#guest = guest;
  }

  get open(): boolean {
    return this.#guest.open;
  }

  send(channel: Channel, raw: string): void {
    this.#network.enqueueToHost(this.#guest.peer, channel, raw);
  }

  onMessage(handler: (channel: Channel, raw: string) => void): void {
    this.#guest.messageHandlers.push(handler);
  }

  onClosed(handler: (reason: CloseReason) => void): void {
    this.#guest.closedHandlers.push(handler);
  }

  close(): void {
    this.#network.dropGuest(this.#guest.peer, 'closed');
  }
}
