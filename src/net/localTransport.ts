import type { Channel } from './protocol';
import type { ClientTransport, CloseReason, HostTransport, PeerId } from './transport';

/** Messages waiting for one endpoint before reliable traffic overflows (the connection closes) or poses drop. */
const DEFAULT_MAX_QUEUED = 512;

type Delivery =
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

interface Guest {
  readonly peer: PeerId;
  open: boolean;
  /** Host-to-guest traffic sent before a host-side close still arrives (the host lingers to flush it). */
  lingering: boolean;
  readonly messageHandlers: ((channel: Channel, raw: string) => void)[];
  readonly closedHandlers: ((reason: CloseReason) => void)[];
}

/**
 * In-memory transport for tests and local development (MSC-021). Nothing is delivered until `flush`, which hands
 * queued messages over strictly in send order, so a scenario replays identically every run. Reliable messages
 * always arrive in order; disposable ones are dropped when a receiver's queue is full. This is not network evidence:
 * real connectivity is proven only on the Steam path (gate T1).
 */
export class LocalNetwork {
  readonly #queue: Delivery[] = [];
  readonly #guests = new Map<PeerId, Guest>();
  readonly #maxQueued: number;
  #host: HostEndpoint | undefined;
  #nextPeer = 1;
  #dropped = 0;

  constructor(options: { maxQueued?: number } = {}) {
    this.#maxQueued = options.maxQueued ?? DEFAULT_MAX_QUEUED;
  }

  /** Disposable messages dropped because a receiver's queue was full. */
  get dropped(): number {
    return this.#dropped;
  }

  get pending(): number {
    return this.#queue.length;
  }

  /** Opens the hosting endpoint; one host per network. */
  host(): HostTransport {
    if (this.#host?.open) throw new Error('A host is already open on this network');
    this.#host = new HostEndpoint(this);
    return this.#host;
  }

  /** Connects a new guest; the host hears about it on the next flush. */
  connect(): ClientTransport {
    if (!this.#host?.open) throw new Error('No host is open on this network');
    const peer = `peer-${this.#nextPeer}` as PeerId;
    this.#nextPeer += 1;
    const guest: Guest = { peer, open: true, lingering: false, messageHandlers: [], closedHandlers: [] };
    this.#guests.set(peer, guest);
    this.#queue.push({ to: 'host', kind: 'joined', peer });
    return new ClientEndpoint(this, guest);
  }

  /** Delivers queued messages in order, including any sent by handlers meanwhile. Returns how many were delivered. */
  flush(maxDeliveries = 100_000): number {
    let delivered = 0;
    while (this.#queue.length > 0 && delivered < maxDeliveries) {
      const delivery = this.#queue.shift();
      if (!delivery) break;
      delivered += 1;
      if (delivery.to === 'host') this.#host?.deliver(delivery);
      else this.#deliverToGuest(delivery);
    }
    return delivered;
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
    this.#queue.push({ to: 'host', kind: 'message', peer, channel, raw });
  }

  /** @internal */
  enqueueToGuest(peer: PeerId, channel: Channel, raw: string): void {
    if (!this.#guests.get(peer)?.open) return;
    if (this.#queuedFor('guest', peer) >= this.#maxQueued) {
      if (channel === 'disposable') this.#dropped += 1;
      else this.dropGuest(peer, 'overflow');
      return;
    }
    this.#queue.push({ to: 'guest', peer, kind: 'message', channel, raw });
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
    this.#queue.push({ to: 'guest', peer, kind: 'closed', reason });
    if (this.#host?.open) this.#queue.push({ to: 'host', kind: 'left', peer, reason });
  }

  /** @internal */
  closeHost(): void {
    for (const guest of this.#guests.values()) this.dropGuest(guest.peer, 'host-left');
  }

  /** @internal */
  openPeers(): PeerId[] {
    return [...this.#guests.values()].filter((guest) => guest.open).map((guest) => guest.peer);
  }

  #queuedFor(to: 'host' | 'guest', peer?: PeerId): number {
    let count = 0;
    for (const delivery of this.#queue) {
      if (delivery.to === to && delivery.kind === 'message' && (peer === undefined || delivery.peer === peer))
        count += 1;
    }
    return count;
  }

  #deliverToGuest(delivery: Extract<Delivery, { to: 'guest' }>): void {
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

  deliver(delivery: Extract<Delivery, { to: 'host' }>): void {
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
