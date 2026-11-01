import type { SteamBridge, SteamPoll } from '../platform/types';
import type { Channel } from './protocol';
import type { ClientTransport, CloseReason, HostTransport, PeerId } from './transport';

/**
 * Steam adapters for the transport ports (MSC-026). They sit on the preload bridge: lobby membership comes from
 * Steam, packets are addressed by SteamID and authenticated by Steam, so a `PeerId` is the sender's SteamID. The
 * game calls `pump()` once per frame; only one adapter is active at a time. Delivery is the legacy Steam P2P API
 * through steamworks.js (owner decision 2026-10-31); the protocol does not depend on it.
 */

abstract class SteamEndpoint {
  protected readonly bridge: SteamBridge;
  #polling = false;
  /** Packets main dropped because polling fell behind; a non-zero value means the session is unreliable. */
  dropped = 0;

  constructor(bridge: SteamBridge) {
    this.bridge = bridge;
  }

  /** Polls main once; a poll still in flight is not overlapped. */
  async pump(): Promise<void> {
    if (this.#polling) return;
    this.#polling = true;
    try {
      const poll = await this.bridge.poll();
      this.dropped += poll.dropped;
      this.deliver(poll);
    } finally {
      this.#polling = false;
    }
  }

  protected abstract deliver(poll: SteamPoll): void;
}

export class SteamHostTransport extends SteamEndpoint implements HostTransport {
  readonly #self: string;
  readonly #peers = new Set<PeerId>();
  /** Disconnected by the host; ignored until they leave the lobby and come back. */
  readonly #removed = new Set<PeerId>();
  readonly #messageHandlers: ((peer: PeerId, channel: Channel, raw: string) => void)[] = [];
  readonly #joinedHandlers: ((peer: PeerId) => void)[] = [];
  readonly #leftHandlers: ((peer: PeerId, reason: CloseReason) => void)[] = [];
  #open = true;

  constructor(bridge: SteamBridge, self: string) {
    super(bridge);
    this.#self = self;
  }

  get peers(): readonly PeerId[] {
    return [...this.#peers];
  }

  send(peer: PeerId, channel: Channel, raw: string): void {
    if (this.#open && this.#peers.has(peer)) void this.bridge.send(peer, channel, raw);
  }

  broadcast(channel: Channel, raw: string): void {
    for (const peer of this.#peers) this.send(peer, channel, raw);
  }

  disconnect(peer: PeerId, reason: CloseReason): void {
    if (!this.#peers.delete(peer)) return;
    this.#removed.add(peer);
    for (const handler of this.#leftHandlers) handler(peer, reason);
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
    if (!this.#open) return;
    this.#open = false;
    this.#peers.clear();
    void this.bridge.leaveLobby();
  }

  protected deliver(poll: SteamPoll): void {
    if (!this.#open) return;
    for (const event of poll.events) {
      if (event.type === 'member-joined') {
        this.#removed.delete(event.steamId as PeerId);
        this.#join(event.steamId as PeerId);
      } else if (event.type === 'member-left') {
        const peer = event.steamId as PeerId;
        this.#removed.delete(peer);
        if (this.#peers.delete(peer)) for (const handler of this.#leftHandlers) handler(peer, 'closed');
      }
    }
    for (const packet of poll.packets) {
      const peer = packet.from as PeerId;
      // A packet can overtake its member-joined event; main already checked that the sender is in the lobby.
      this.#join(peer);
      if (!this.#peers.has(peer)) continue;
      for (const handler of this.#messageHandlers) handler(peer, packet.channel, packet.raw);
    }
  }

  #join(peer: PeerId): void {
    if (peer === this.#self || this.#peers.has(peer) || this.#removed.has(peer)) return;
    this.#peers.add(peer);
    for (const handler of this.#joinedHandlers) handler(peer);
  }
}

export class SteamClientTransport extends SteamEndpoint implements ClientTransport {
  readonly #host: string;
  readonly #messageHandlers: ((channel: Channel, raw: string) => void)[] = [];
  readonly #closedHandlers: ((reason: CloseReason) => void)[] = [];
  #open = true;

  /** `host` is the lobby owner's SteamID: the only sender a guest listens to. */
  constructor(bridge: SteamBridge, host: string) {
    super(bridge);
    this.#host = host;
  }

  get open(): boolean {
    return this.#open;
  }

  send(channel: Channel, raw: string): void {
    if (this.#open) void this.bridge.send(this.#host, channel, raw);
  }

  onMessage(handler: (channel: Channel, raw: string) => void): void {
    this.#messageHandlers.push(handler);
  }

  onClosed(handler: (reason: CloseReason) => void): void {
    this.#closedHandlers.push(handler);
  }

  close(): void {
    if (!this.#open) return;
    void this.bridge.leaveLobby();
    this.#end('closed');
  }

  protected deliver(poll: SteamPoll): void {
    if (!this.#open) return;
    // Messages already received are delivered before a departure is processed, like the local transport.
    for (const packet of poll.packets) {
      if (packet.from !== this.#host) continue;
      for (const handler of this.#messageHandlers) handler(packet.channel, packet.raw);
    }
    for (const event of poll.events) {
      const hostGone = event.type === 'lobby-closed' || (event.type === 'member-left' && event.steamId === this.#host);
      if (hostGone || (event.type === 'session-failed' && event.steamId === this.#host)) {
        this.#end('host-left');
        return;
      }
    }
  }

  #end(reason: CloseReason): void {
    this.#open = false;
    for (const handler of this.#closedHandlers) handler(reason);
  }
}
