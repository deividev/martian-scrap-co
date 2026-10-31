// DEV-ONLY two-account Steam P2P check (MSC-026/027). It runs only when MSC_DEV_STEAM_TEST=1 and a local
// MSC_STEAM_APP_ID are both set, so a real Steam launch never reaches it. REMOVE BEFORE RELEASE: delete this file,
// its test, tools/dev-p2p/ and the lines marked "DEV-ONLY" in main.ts.
import type { SteamService } from './steamService.js';
import { isSteamId, type SteamChannel } from './steamPolicy.js';

export const DEV_P2P_TEST_ENV = 'MSC_DEV_STEAM_TEST';

export type DevP2pTest = { readonly role: 'host' } | { readonly role: 'join'; readonly lobby: string };

/** `--steam-p2p-test=host` or `--steam-p2p-test=join:<lobby id>`; `null` unless the dev variables are set. */
export function resolveDevP2pTest(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): DevP2pTest | null {
  if (env[DEV_P2P_TEST_ENV] !== '1' || !env['MSC_STEAM_APP_ID']) return null;
  const value = argv.find((arg) => arg.startsWith('--steam-p2p-test='))?.slice('--steam-p2p-test='.length);
  if (value === 'host') return { role: 'host' };
  const lobby = value?.startsWith('join:') ? value.slice('join:'.length) : undefined;
  return isSteamId(lobby) ? { role: 'join', lobby } : null;
}

export interface DevP2pOptions {
  /** Receives JSON-ready lines; SteamIDs are never included, only the shareable lobby id. */
  log: (line: unknown) => void;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  rounds?: number;
  peerWaitMs?: number;
  exchangeMs?: number;
}

export type DevP2pResult =
  'ok' | 'steam-unavailable' | 'lobby-failed' | 'join-failed' | 'no-peer' | 'peer-left' | 'timeout';

interface ChannelStats {
  sent: number;
  pongs: Set<number>;
  pings: Set<number>;
}

const CHANNELS: readonly SteamChannel[] = ['reliable', 'disposable'];
const TICK_MS = 20;
/** The guest waits so the host has seen it join (and will accept its P2P session) before the first packet. */
const GUEST_START_DELAY_MS = 3000;
/** After both directions complete, keep answering so the other side can finish too. */
const GRACE_MS = 3000;
const MESSAGE = /^(ping|pong):(reliable|disposable):(\d{1,4})$/;

export async function runDevP2pTest(
  steam: SteamService,
  test: DevP2pTest,
  options: DevP2pOptions,
): Promise<DevP2pResult> {
  const { log, now, sleep } = options;
  const rounds = options.rounds ?? 20;
  const finish = (result: DevP2pResult, details: Record<string, unknown> = {}): DevP2pResult => {
    log({ p2pTest: { role: test.role, result, ...details } });
    return result;
  };

  const status = steam.status();
  if (!status.available) return finish('steam-unavailable', { reason: status.reason });
  const self = status.self;

  let peer: string | undefined;
  if (test.role === 'host') {
    const lobby = await steam.createLobby();
    if (!lobby) return finish('lobby-failed');
    log({ p2pTest: { role: 'host', phase: 'lobby-ready', lobby: lobby.id } });
    const deadline = now() + (options.peerWaitMs ?? 5 * 60_000);
    while (!peer && now() < deadline) {
      await sleep(TICK_MS);
      for (const event of steam.poll().events) {
        if (event.type === 'member-joined' && event.steamId !== self) peer = event.steamId;
      }
    }
    if (!peer) {
      steam.leaveLobby();
      return finish('no-peer');
    }
  } else {
    const lobby = await steam.joinLobby(test.lobby);
    if (!lobby || lobby.owner === self) return finish('join-failed');
    peer = lobby.owner;
    await sleep(GUEST_START_DELAY_MS);
  }
  log({ p2pTest: { role: test.role, phase: 'peer-connected' } });

  const stats: Record<SteamChannel, ChannelStats> = {
    reliable: { sent: 0, pongs: new Set(), pings: new Set() },
    disposable: { sent: 0, pongs: new Set(), pings: new Set() },
  };
  const sentAt = new Map<number, number>();
  const rtts: number[] = [];
  let dropped = 0;
  let next = 0;
  let closed = false;
  let completeAt: number | null = null;
  const deadline = now() + (options.exchangeMs ?? 60_000);

  while (now() < deadline) {
    if (next < rounds) {
      for (const channel of CHANNELS)
        if (steam.send(peer, channel, `ping:${channel}:${next}`)) stats[channel].sent += 1;
      sentAt.set(next, now());
      next += 1;
    }
    const poll = steam.poll();
    dropped += poll.dropped;
    for (const packet of poll.packets) {
      const match = packet.from === peer ? MESSAGE.exec(packet.raw) : null;
      if (match?.[2] !== packet.channel) continue;
      const index = Number(match[3]);
      const channelStats = stats[packet.channel];
      if (match[1] === 'ping') {
        channelStats.pings.add(index);
        steam.send(peer, packet.channel, `pong:${packet.channel}:${index}`);
      } else if (!channelStats.pongs.has(index) && index < next) {
        channelStats.pongs.add(index);
        const started = sentAt.get(index);
        if (packet.channel === 'reliable' && started !== undefined) rtts.push(now() - started);
      }
    }
    for (const event of poll.events) {
      const gone =
        event.type === 'lobby-closed' ||
        ((event.type === 'member-left' || event.type === 'session-failed') && event.steamId === peer);
      if (gone) closed = true;
    }
    const complete = stats.reliable.pongs.size >= rounds && stats.reliable.pings.size >= rounds;
    if (complete && completeAt === null) completeAt = now();
    if (closed || (completeAt !== null && now() - completeAt >= GRACE_MS)) break;
    await sleep(TICK_MS);
  }
  steam.leaveLobby();

  const complete = completeAt !== null;
  const sorted = [...rtts].sort((a, b) => a - b);
  const summary = (channel: SteamChannel) => ({
    sent: stats[channel].sent,
    answered: stats[channel].pongs.size,
    received: stats[channel].pings.size,
  });
  return finish(complete ? 'ok' : closed ? 'peer-left' : 'timeout', {
    rounds,
    reliable: summary('reliable'),
    disposable: summary('disposable'),
    reliableRttMs: sorted.length
      ? { median: Math.round(sorted[Math.floor(sorted.length / 2)] ?? 0), max: Math.round(sorted.at(-1) ?? 0) }
      : null,
    dropped,
  });
}
