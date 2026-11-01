import { describe, expect, it } from 'vitest';
import { entityId, type EntityId } from '../../src/domain/ids';
import { GuestSession } from '../../src/net/guestSession';
import type { SessionId } from '../../src/net/protocol';
import { SteamClientTransport, SteamHostTransport } from '../../src/net/steamTransport';
import type { PeerId } from '../../src/net/transport';
import type {
  SteamBridge,
  SteamEvent,
  SteamLobbyInfo,
  SteamPacket,
  SteamPoll,
  SteamStatus,
} from '../../src/platform/types';
import {
  HostRouter,
  type SessionSnapshot,
  type WorldAuthority,
  type WorldIntent,
  type WorldOutcome,
} from '../../src/simulation/host/hostRouter';

const HOST = '76561198000000001';
const GUEST = '76561198000000002';
const STRANGER = '76561198000000009';
const LOBBY = '109775241021923456';

/** One fake Steam lobby: what main would report to each member's bridge after its own membership checks. */
class FakeSteam {
  readonly members = new Set<string>();
  readonly inbox = new Map<string, { packets: SteamPacket[]; events: SteamEvent[] }>();
  owner = HOST;

  bridge(self: string): SteamBridge {
    const box = { packets: [] as SteamPacket[], events: [] as SteamEvent[] };
    this.inbox.set(self, box);
    const info = (): SteamLobbyInfo => ({ id: LOBBY, owner: this.owner, members: [...this.members] });
    return {
      status: (): Promise<SteamStatus> => Promise.resolve({ available: true, self, lobby: info() }),
      createLobby: () => Promise.resolve(this.enter(self)),
      joinLobby: () => Promise.resolve(this.enter(self)),
      leaveLobby: () => Promise.resolve(this.leave(self)),
      setJoinable: () => Promise.resolve(true),
      openInviteDialog: () => Promise.resolve(true),
      send: (to, channel, raw) => {
        const target = this.inbox.get(to);
        if (!this.members.has(self) || !this.members.has(to) || !target) return Promise.resolve(false);
        target.packets.push({ from: self, channel, raw });
        return Promise.resolve(true);
      },
      poll: (): Promise<SteamPoll> =>
        Promise.resolve({ packets: box.packets.splice(0), events: box.events.splice(0), dropped: 0 }),
    };
  }

  enter(self: string): SteamLobbyInfo {
    this.members.add(self);
    this.broadcast(self, { type: 'member-joined', steamId: self });
    return { id: LOBBY, owner: this.owner, members: [...this.members] };
  }

  leave(self: string): void {
    this.members.delete(self);
    this.broadcast(self, { type: 'member-left', steamId: self });
  }

  broadcast(except: string, event: SteamEvent): void {
    for (const [id, box] of this.inbox) if (id !== except && this.members.has(id)) box.events.push(event);
  }
}

const id = (n: number): EntityId => entityId(`ent-${n.toString(36)}`);

class World implements WorldAuthority {
  readonly pieces = new Set([id(1), id(2), id(3)]);
  checkClaim(target: EntityId) {
    return this.pieces.has(target) ? null : ('unavailable' as const);
  }
  settleReleased(): void {}
  apply(intent: WorldIntent, slot: number): WorldOutcome {
    if (intent.kind !== 'collect' || !intent.targets.every((t) => this.pieces.has(t))) {
      return { ok: false, reason: 'unavailable' };
    }
    for (const t of intent.targets) this.pieces.delete(t);
    return { ok: true, events: [{ kind: 'collected', pieces: intent.targets, collector: slot }] };
  }
  snapshot(): unknown {
    return { pieces: [...this.pieces] };
  }
}

async function pumpAll(endpoints: { pump(): Promise<void> }[], rounds = 12): Promise<void> {
  for (let i = 0; i < rounds; i += 1) for (const endpoint of endpoints) await endpoint.pump();
}

describe('Steam transport adapters', () => {
  it('carry a full join, snapshot load and committed intent between two SteamIDs', async () => {
    const steam = new FakeSteam();
    const hostBridge = steam.bridge(HOST);
    await hostBridge.createLobby();
    const hostTransport = new SteamHostTransport(hostBridge, HOST);
    const world = new World();
    const router = new HostRouter(hostTransport, { session: 'ses-steamtest1' as SessionId, world });

    const guestBridge = steam.bridge(GUEST);
    const lobby = await guestBridge.joinLobby(LOBBY);
    const guestTransport = new SteamClientTransport(guestBridge, lobby?.owner ?? '');
    let pieces: EntityId[] = [];
    let tick = 0;
    const guest = new GuestSession(
      guestTransport,
      {
        load: (state) => (pieces = ((state as SessionSnapshot).world as { pieces: EntityId[] }).pieces),
        apply: ({ event }) => {
          if (event.kind === 'collected') pieces = pieces.filter((p) => !event.pieces.includes(p));
        },
      },
      { build: '0.0.0', clock: () => tick },
    );

    await pumpAll([hostTransport, guestTransport]);
    expect(hostTransport.peers).toEqual([GUEST]);
    expect(guest.state).toBe('ready');
    expect(pieces).toHaveLength(3);

    guest.act({ kind: 'collect', targets: [id(2)] });
    tick += 1;
    await pumpAll([hostTransport, guestTransport]);
    expect(world.pieces.has(id(2))).toBe(false);
    expect(pieces).toEqual([id(1), id(3)]);
    expect(router.revision).toBeGreaterThan(0);
  });

  it('host announces a member whose first packet overtakes its join event', async () => {
    const steam = new FakeSteam();
    const hostBridge = steam.bridge(HOST);
    await hostBridge.createLobby();
    const host = new SteamHostTransport(hostBridge, HOST);
    const order: string[] = [];
    host.onPeerJoined((peer) => order.push(`joined:${peer}`));
    host.onMessage((peer, _channel, raw) => order.push(`message:${peer}:${raw}`));
    const guestBridge = steam.bridge(GUEST);
    steam.members.add(GUEST);
    await guestBridge.send(HOST, 'reliable', 'hi');
    await host.pump();
    expect(order).toEqual([`joined:${GUEST}`, `message:${GUEST}:hi`]);
  });

  it('host ignores a removed guest until it leaves the lobby and comes back', async () => {
    const steam = new FakeSteam();
    const hostBridge = steam.bridge(HOST);
    await hostBridge.createLobby();
    const host = new SteamHostTransport(hostBridge, HOST);
    const messages: string[] = [];
    const left: string[] = [];
    host.onMessage((_peer, _channel, raw) => messages.push(raw));
    host.onPeerLeft((peer, reason) => left.push(`${peer}:${reason}`));
    const guestBridge = steam.bridge(GUEST);
    await guestBridge.joinLobby(LOBBY);
    await host.pump();

    host.disconnect(GUEST as PeerId, 'kicked');
    expect(left).toEqual([`${GUEST}:kicked`]);
    await guestBridge.send(HOST, 'reliable', 'after-kick');
    await host.pump();
    expect(messages).toEqual([]);
    expect(host.peers).toEqual([]);

    await guestBridge.leaveLobby();
    await guestBridge.joinLobby(LOBBY);
    await guestBridge.send(HOST, 'reliable', 'rejoined');
    await host.pump();
    expect(messages).toEqual(['rejoined']);
  });

  it('guest listens only to the host and closes with host-left when the host goes', async () => {
    const steam = new FakeSteam();
    const hostBridge = steam.bridge(HOST);
    await hostBridge.createLobby();
    const strangerBridge = steam.bridge(STRANGER);
    await strangerBridge.joinLobby(LOBBY);
    const guestBridge = steam.bridge(GUEST);
    await guestBridge.joinLobby(LOBBY);
    const guest = new SteamClientTransport(guestBridge, HOST);
    const received: string[] = [];
    const closed: string[] = [];
    guest.onMessage((_channel, raw) => received.push(raw));
    guest.onClosed((reason) => closed.push(reason));

    await strangerBridge.send(GUEST, 'reliable', 'spoof');
    await hostBridge.send(GUEST, 'reliable', 'from-host');
    await hostBridge.leaveLobby();
    await guest.pump();

    expect(received).toEqual(['from-host']);
    expect(closed).toEqual(['host-left']);
    expect(guest.open).toBe(false);
  });
});
