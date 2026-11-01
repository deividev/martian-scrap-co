// The single Steam lifecycle (MSC-026): steamworks.js lives only in the main process. The renderer reaches it
// through the typed preload bridge and polls; it never receives Steam handles, only decimal SteamID strings.
import { createRequire } from 'node:module';
import type * as SteamworksModule from 'steamworks.js';
import type { SteamEvent, SteamLobbyInfo, SteamPacket, SteamPoll, SteamStatus } from '../../src/platform/types.js';
import {
  BoundedQueue,
  STEAM_LOBBY_MAX_MEMBERS,
  STEAM_MAX_QUEUED_PACKETS,
  STEAM_MAX_READ_PER_TICK,
  decodePacket,
  encodePacket,
  isSteamId,
  type SteamChannel,
  type SteamConfig,
} from './steamPolicy.js';

type Steamworks = typeof SteamworksModule;
type Client = ReturnType<Steamworks['init']>;
type Lobby = Awaited<ReturnType<Client['matchmaking']['createLobby']>>;

// steamworks.js ships these as ambient const enums, which isolated modules cannot read; values from client.d.ts.
const LOBBY_FRIENDS_ONLY = 1;
const SEND_UNRELIABLE = 0;
const SEND_RELIABLE = 2;
const CALLBACK = { lobbyChatUpdate: 5, p2pSessionRequest: 6, p2pSessionConnectFail: 7, joinRequested: 8 } as const;
const MEMBER_ENTERED = 0;

/** Packets are pumped faster than the library's own 30 Hz callback loop to keep latency low (guide risk). */
const PUMP_INTERVAL_MS = 1000 / 60;
const MAX_QUEUED_EVENTS = 64;

export interface SteamService {
  status(): SteamStatus;
  createLobby(): Promise<SteamLobbyInfo | null>;
  joinLobby(lobbyId: string): Promise<SteamLobbyInfo | null>;
  leaveLobby(): void;
  setJoinable(joinable: boolean): boolean;
  openInviteDialog(): boolean;
  send(to: string, channel: SteamChannel, raw: string): boolean;
  poll(): SteamPoll;
  shutdown(): void;
}

export function unavailableSteam(reason: Extract<SteamStatus, { available: false }>['reason']): SteamService {
  const status: SteamStatus = { available: false, reason };
  return {
    status: () => status,
    createLobby: () => Promise.resolve(null),
    joinLobby: () => Promise.resolve(null),
    leaveLobby: () => undefined,
    setJoinable: () => false,
    openInviteDialog: () => false,
    send: () => false,
    poll: () => ({ packets: [], events: [], dropped: 0 }),
    shutdown: () => undefined,
  };
}

/**
 * Loads steamworks.js and initializes Steam synchronously, before the app is ready, so the overlay switches can
 * depend on the result. Any failure leaves the game running without Steam.
 */
export function startSteam(config: SteamConfig, pendingLobby: string | null): SteamService {
  if (!config.enabled) return unavailableSteam(config.reason);
  let steamworks: Steamworks;
  try {
    steamworks = createRequire(import.meta.url)('steamworks.js') as Steamworks;
  } catch {
    return unavailableSteam('not-installed');
  }
  let client: Client;
  try {
    client = steamworks.init(config.appId);
  } catch {
    return unavailableSteam('init-failed');
  }
  return new LiveSteamService(client, pendingLobby);
}

class LiveSteamService implements SteamService {
  readonly #client: Client;
  readonly #self: string;
  readonly #packets = new BoundedQueue<SteamPacket>(STEAM_MAX_QUEUED_PACKETS);
  readonly #events = new BoundedQueue<SteamEvent>(MAX_QUEUED_EVENTS);
  readonly #handles: { disconnect(): void }[] = [];
  readonly #pump: ReturnType<typeof setInterval>;
  #lobby: Lobby | null = null;
  /** Current lobby members; packets and P2P sessions from anyone else are refused. */
  #members = new Set<string>();

  constructor(client: Client, pendingLobby: string | null) {
    this.#client = client;
    this.#self = client.localplayer.getSteamId().steamId64.toString();
    if (pendingLobby) this.#events.push({ type: 'join-requested', lobby: pendingLobby });
    const { callback } = client;
    this.#handles.push(
      callback.register(CALLBACK.p2pSessionRequest, ({ remote }) => {
        // Accept a P2P session only from a member of our current lobby (guide §2.4); others time out unanswered.
        if (this.#members.has(remote.toString())) client.networking.acceptP2PSession(remote);
      }),
      callback.register(CALLBACK.p2pSessionConnectFail, ({ remote }) => {
        this.#events.push({ type: 'session-failed', steamId: remote.toString() });
      }),
      callback.register(CALLBACK.lobbyChatUpdate, (update) => this.#memberChange(update)),
      callback.register(CALLBACK.joinRequested, ({ lobby_steam_id }) => {
        this.#events.push({ type: 'join-requested', lobby: lobby_steam_id.toString() });
      }),
    );
    this.#pump = setInterval(() => this.#read(), PUMP_INTERVAL_MS);
  }

  status(): SteamStatus {
    return { available: true, self: this.#self, lobby: this.#info() };
  }

  async createLobby(): Promise<SteamLobbyInfo | null> {
    this.leaveLobby();
    try {
      this.#enter(await this.#client.matchmaking.createLobby(LOBBY_FRIENDS_ONLY, STEAM_LOBBY_MAX_MEMBERS));
    } catch {
      return null;
    }
    return this.#info();
  }

  async joinLobby(lobbyId: string): Promise<SteamLobbyInfo | null> {
    if (!isSteamId(lobbyId)) return null;
    this.leaveLobby();
    try {
      this.#enter(await this.#client.matchmaking.joinLobby(BigInt(lobbyId)));
    } catch {
      return null;
    }
    return this.#info();
  }

  leaveLobby(): void {
    if (!this.#lobby) return;
    this.#lobby.leave();
    this.#lobby = null;
    this.#members.clear();
    this.#packets.clear();
    this.#client.localplayer.setRichPresence('connect', null);
    this.#client.localplayer.setRichPresence('steam_player_group', null);
  }

  setJoinable(joinable: boolean): boolean {
    return this.#isOwner() && this.#lobby !== null && this.#lobby.setJoinable(joinable);
  }

  openInviteDialog(): boolean {
    if (!this.#lobby) return false;
    this.#client.overlay.activateInviteDialog(this.#lobby.id);
    return true;
  }

  send(to: string, channel: SteamChannel, raw: string): boolean {
    if (!this.#members.has(to) || to === this.#self) return false;
    const packet = encodePacket(channel, raw);
    if (!packet) return false;
    const type = channel === 'reliable' ? SEND_RELIABLE : SEND_UNRELIABLE;
    return this.#client.networking.sendP2PPacket(BigInt(to), type, Buffer.from(packet));
  }

  poll(): SteamPoll {
    const dropped = this.#packets.dropped;
    this.#packets.dropped = 0;
    return { packets: this.#packets.drain(), events: this.#events.drain(), dropped };
  }

  shutdown(): void {
    clearInterval(this.#pump);
    this.leaveLobby();
    for (const handle of this.#handles) handle.disconnect();
  }

  #enter(lobby: Lobby): void {
    this.#lobby = lobby;
    this.#refreshMembers();
    const id = lobby.id.toString();
    // "Join game" from the friends list, and party grouping (guide §2.6); cleared on leave.
    this.#client.localplayer.setRichPresence('connect', `+connect_lobby ${id}`);
    this.#client.localplayer.setRichPresence('steam_player_group', id);
  }

  #info(): SteamLobbyInfo | null {
    if (!this.#lobby) return null;
    return { id: this.#lobby.id.toString(), owner: this.#owner(), members: [...this.#members] };
  }

  #owner(): string {
    return this.#lobby ? this.#lobby.getOwner().steamId64.toString() : '';
  }

  #isOwner(): boolean {
    return this.#owner() === this.#self;
  }

  #refreshMembers(): void {
    this.#members = new Set(this.#lobby ? this.#lobby.getMembers().map((m) => m.steamId64.toString()) : []);
  }

  #memberChange(update: { lobby: bigint; user_changed: bigint; member_state_change: number }): void {
    if (!this.#lobby || update.lobby !== this.#lobby.id) return;
    const steamId = update.user_changed.toString();
    const ownerBefore = this.#owner();
    this.#refreshMembers();
    if (update.member_state_change === MEMBER_ENTERED) {
      this.#events.push({ type: 'member-joined', steamId });
      return;
    }
    this.#events.push({ type: 'member-left', steamId });
    // No host migration: when the owner leaves, the guest's session ends (guide §2.4, AGENT.md).
    if (steamId === ownerBefore && steamId !== this.#self) {
      this.leaveLobby();
      this.#events.push({ type: 'lobby-closed' });
    }
  }

  #read(): void {
    const { networking } = this.#client;
    for (let i = 0; i < STEAM_MAX_READ_PER_TICK; i += 1) {
      const size = networking.isP2PPacketAvailable();
      if (size <= 0) return;
      const packet = networking.readP2PPacket(size);
      const from = packet.steamId.steamId64.toString();
      if (!this.#members.has(from)) continue;
      const decoded = decodePacket(packet.data);
      if (decoded) this.#packets.push({ from, ...decoded });
    }
  }
}
