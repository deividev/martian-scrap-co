import type { Channel } from './protocol';

/**
 * Transport ports (MSC-021). Gameplay and the protocol talk to these interfaces only; a local deterministic
 * transport backs tests and development, and the Steam adapter (MSC-026) will implement the same ports. Payloads
 * are raw strings: decoding and validation belong to the protocol, never to a transport.
 */

/**
 * Who sent a message, as authenticated by the transport (a Steam identity on the real path). Never taken from a
 * payload: a guest cannot claim to be someone else by writing a name into a message.
 */
export type PeerId = string & { readonly __peer: true };

export type CloseReason = 'host-left' | 'kicked' | 'overflow' | 'closed';

/** The host side: one endpoint that talks to every connected guest. */
export interface HostTransport {
  readonly peers: readonly PeerId[];
  send(peer: PeerId, channel: Channel, raw: string): void;
  broadcast(channel: Channel, raw: string): void;
  /** Drops a guest's connection (protocol error, kick or full session). */
  disconnect(peer: PeerId, reason: CloseReason): void;
  onMessage(handler: (peer: PeerId, channel: Channel, raw: string) => void): void;
  onPeerJoined(handler: (peer: PeerId) => void): void;
  onPeerLeft(handler: (peer: PeerId, reason: CloseReason) => void): void;
  close(): void;
}

/** A guest's connection to the host. */
export interface ClientTransport {
  readonly open: boolean;
  send(channel: Channel, raw: string): void;
  onMessage(handler: (channel: Channel, raw: string) => void): void;
  onClosed(handler: (reason: CloseReason) => void): void;
  close(): void;
}
