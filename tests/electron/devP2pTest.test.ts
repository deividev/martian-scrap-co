import { describe, expect, it } from 'vitest';
import { resolveDevP2pTest, runDevP2pTest, type DevP2pOptions } from '../../electron/steam/devP2pTest';
import type { SteamService } from '../../electron/steam/steamService';
import type { SteamEvent, SteamPacket } from '../../src/platform/types';

const HOST = '76561198000000001';
const GUEST = '76561198000000002';
const LOBBY = '109775241021923456';
const ENV = { MSC_DEV_STEAM_TEST: '1', MSC_STEAM_APP_ID: '480' };

/** One fake lobby shared by two services, with an optional loss rate on the disposable channel. */
class FakeLobby {
  readonly members = new Set<string>();
  readonly boxes = new Map<string, { packets: SteamPacket[]; events: SteamEvent[] }>();
  dropDisposable = false;

  service(self: string): SteamService {
    const box = { packets: [] as SteamPacket[], events: [] as SteamEvent[] };
    this.boxes.set(self, box);
    const info = () => ({ id: LOBBY, owner: HOST, members: [...this.members] });
    const notify = (event: SteamEvent) => {
      for (const [id, other] of this.boxes) if (id !== self && this.members.has(id)) other.events.push(event);
    };
    return {
      status: () => ({ available: true, self, lobby: this.members.has(self) ? info() : null }),
      createLobby: () => {
        this.members.add(self);
        return Promise.resolve(info());
      },
      joinLobby: () => {
        this.members.add(self);
        notify({ type: 'member-joined', steamId: self });
        return Promise.resolve(info());
      },
      leaveLobby: () => {
        if (this.members.delete(self)) notify({ type: 'member-left', steamId: self });
      },
      setJoinable: () => true,
      openInviteDialog: () => true,
      send: (to, channel, raw) => {
        if (!this.members.has(self) || !this.members.has(to)) return false;
        if (!(this.dropDisposable && channel === 'disposable')) {
          this.boxes.get(to)?.packets.push({ from: self, channel, raw });
        }
        return true;
      },
      poll: () => ({ packets: box.packets.splice(0), events: box.events.splice(0), dropped: 0 }),
      shutdown: () => undefined,
    };
  }
}

function harness(lines: unknown[]): DevP2pOptions {
  let time = 0;
  return {
    log: (line) => lines.push(line),
    now: () => time,
    sleep: async (ms) => {
      time += ms;
      await new Promise((resolve) => setImmediate(resolve));
    },
    rounds: 5,
    peerWaitMs: 60_000,
    exchangeMs: 30_000,
  };
}

describe('dev two-account P2P test', () => {
  it('stays off unless both dev variables are set', () => {
    expect(resolveDevP2pTest(['--steam-p2p-test=host'], {})).toBeNull();
    expect(resolveDevP2pTest(['--steam-p2p-test=host'], { MSC_DEV_STEAM_TEST: '1' })).toBeNull();
    expect(resolveDevP2pTest(['--steam-p2p-test=host'], { MSC_STEAM_APP_ID: '480' })).toBeNull();
    expect(resolveDevP2pTest(['--steam-p2p-test=host'], ENV)).toEqual({ role: 'host' });
    expect(resolveDevP2pTest([`--steam-p2p-test=join:${LOBBY}`], ENV)).toEqual({ role: 'join', lobby: LOBBY });
    expect(resolveDevP2pTest(['--steam-p2p-test=join:12'], ENV)).toBeNull();
    expect(resolveDevP2pTest([], ENV)).toBeNull();
  });

  it('exchanges reliable and disposable pings both ways and reports no SteamIDs', async () => {
    const lobby = new FakeLobby();
    const hostLines: unknown[] = [];
    const guestLines: unknown[] = [];
    const host = runDevP2pTest(lobby.service(HOST), { role: 'host' }, harness(hostLines));
    await new Promise((resolve) => setImmediate(resolve));
    const guest = runDevP2pTest(lobby.service(GUEST), { role: 'join', lobby: LOBBY }, harness(guestLines));

    expect(await Promise.all([host, guest])).toEqual(['ok', 'ok']);
    expect(hostLines[0]).toEqual({ p2pTest: { role: 'host', phase: 'lobby-ready', lobby: LOBBY } });
    expect(hostLines.at(-1)).toMatchObject({
      p2pTest: { result: 'ok', reliable: { sent: 5, answered: 5, received: 5 } },
    });
    const text = JSON.stringify([...hostLines, ...guestLines]);
    expect(text).not.toContain(HOST);
    expect(text).not.toContain(GUEST);
  });

  it('passes with disposable loss, since only the reliable channel is required', async () => {
    const lobby = new FakeLobby();
    lobby.dropDisposable = true;
    const lines: unknown[] = [];
    const host = runDevP2pTest(lobby.service(HOST), { role: 'host' }, harness(lines));
    await new Promise((resolve) => setImmediate(resolve));
    const guest = runDevP2pTest(lobby.service(GUEST), { role: 'join', lobby: LOBBY }, harness([]));
    expect(await Promise.all([host, guest])).toEqual(['ok', 'ok']);
    expect(lines.at(-1)).toMatchObject({ p2pTest: { disposable: { answered: 0, received: 0 } } });
  });

  it('reports no-peer when nobody joins in time', async () => {
    const lines: unknown[] = [];
    const result = await runDevP2pTest(new FakeLobby().service(HOST), { role: 'host' }, harness(lines));
    expect(result).toBe('no-peer');
  });
});
