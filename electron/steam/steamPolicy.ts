// Pure Steam policy shared by the main process and its tests: no Electron or steamworks.js imports here.

/** Mirrors `MESSAGE_LIMITS` in src/net/protocol.ts (a test keeps them equal); bytes of UTF-8 payload. */
export const STEAM_MESSAGE_LIMITS = Object.freeze({ reliable: 16 * 1024, disposable: 1024 });

export type SteamChannel = keyof typeof STEAM_MESSAGE_LIMITS;

/** Friends-only invite lobbies with at most four players (MSC-003 P1). */
export const STEAM_LOBBY_MAX_MEMBERS = 4;

/** Packets held in main between two renderer polls; beyond this the oldest are dropped and counted. */
export const STEAM_MAX_QUEUED_PACKETS = 1024;

/** Packets read from Steam per pump tick, so a flood cannot stall the main process. */
export const STEAM_MAX_READ_PER_TICK = 256;

/** One leading byte on the wire tells the receiver which protocol channel a packet belongs to. */
const CHANNEL_TAG: Readonly<Record<SteamChannel, number>> = { reliable: 0x52, disposable: 0x44 };

const STEAM_ID = /^[1-9][0-9]{15,19}$/;

export function isSteamId(value: unknown): value is string {
  return typeof value === 'string' && STEAM_ID.test(value);
}

export type SteamConfig =
  | { readonly enabled: true; readonly appId: number | undefined }
  | { readonly enabled: false; readonly reason: 'disabled' | 'invalid-app-id' };

/**
 * Steam is optional: the game runs without it. `MSC_NO_STEAM=1` turns it off on purpose. No App ID is built in
 * (blocker A1): a Steam launch supplies its own, and a local run takes one from `MSC_STEAM_APP_ID`.
 */
export function resolveSteamConfig(env: Readonly<Record<string, string | undefined>>): SteamConfig {
  if (env['MSC_NO_STEAM'] === '1') return { enabled: false, reason: 'disabled' };
  const raw = env['MSC_STEAM_APP_ID'];
  if (raw === undefined || raw === '') return { enabled: true, appId: undefined };
  if (!/^[1-9][0-9]{0,9}$/.test(raw)) return { enabled: false, reason: 'invalid-app-id' };
  const appId = Number(raw);
  return appId <= 0xffffffff ? { enabled: true, appId } : { enabled: false, reason: 'invalid-app-id' };
}

/** A Steam launch from an accepted invite passes `+connect_lobby <id>` (co-op guide §2.5). */
export function connectLobbyFromArgv(argv: readonly string[]): string | null {
  const index = argv.indexOf('+connect_lobby');
  const id = index >= 0 ? argv[index + 1] : undefined;
  return isSteamId(id) ? id : null;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

/** Frames one protocol message; `null` when it exceeds the channel limit (it is never truncated). */
export function encodePacket(channel: SteamChannel, raw: string): Uint8Array | null {
  const body = encoder.encode(raw);
  if (body.length > STEAM_MESSAGE_LIMITS[channel]) return null;
  const packet = new Uint8Array(body.length + 1);
  packet[0] = CHANNEL_TAG[channel];
  packet.set(body, 1);
  return packet;
}

/** Reads one received packet; anything malformed or oversize is `null` and dropped by the caller. */
export function decodePacket(packet: Uint8Array): { readonly channel: SteamChannel; readonly raw: string } | null {
  const tag = packet[0];
  const channel: SteamChannel | undefined =
    tag === CHANNEL_TAG.reliable ? 'reliable' : tag === CHANNEL_TAG.disposable ? 'disposable' : undefined;
  if (!channel || packet.length - 1 > STEAM_MESSAGE_LIMITS[channel]) return null;
  try {
    return { channel, raw: decoder.decode(packet.subarray(1)) };
  } catch {
    return null;
  }
}

/** Bounded FIFO of received items; overflow drops the oldest and is counted, never grows without limit. */
export class BoundedQueue<T> {
  readonly #items: T[] = [];
  readonly #limit: number;
  dropped = 0;

  constructor(limit: number) {
    this.#limit = limit;
  }

  get size(): number {
    return this.#items.length;
  }

  push(item: T): void {
    if (this.#items.length >= this.#limit) {
      this.#items.shift();
      this.dropped += 1;
    }
    this.#items.push(item);
  }

  drain(): T[] {
    return this.#items.splice(0, this.#items.length);
  }

  clear(): void {
    this.#items.length = 0;
  }
}
