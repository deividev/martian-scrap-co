import { describe, expect, it } from 'vitest';
import {
  BoundedQueue,
  STEAM_LOBBY_MAX_MEMBERS,
  STEAM_MESSAGE_LIMITS,
  connectLobbyFromArgv,
  decodePacket,
  encodePacket,
  isSteamId,
  resolveSteamConfig,
} from '../../electron/steam/steamPolicy';
import { MAX_PLAYERS, MESSAGE_LIMITS } from '../../src/net/protocol';

const LOBBY = '109775241021923456';

describe('resolveSteamConfig', () => {
  it('has no built-in App ID: a Steam launch or MSC_STEAM_APP_ID supplies it', () => {
    expect(resolveSteamConfig({})).toEqual({ enabled: true, appId: undefined });
    expect(resolveSteamConfig({ MSC_STEAM_APP_ID: '480' })).toEqual({ enabled: true, appId: 480 });
  });

  it('can be turned off on purpose', () => {
    expect(resolveSteamConfig({ MSC_NO_STEAM: '1', MSC_STEAM_APP_ID: '480' })).toEqual({
      enabled: false,
      reason: 'disabled',
    });
  });

  it.each(['abc', '0', '-1', '12.5', '99999999999'])('refuses App ID %j', (raw) => {
    expect(resolveSteamConfig({ MSC_STEAM_APP_ID: raw })).toEqual({ enabled: false, reason: 'invalid-app-id' });
  });
});

describe('connectLobbyFromArgv', () => {
  it('reads an accepted invite passed on launch', () => {
    expect(connectLobbyFromArgv(['game.exe', '+connect_lobby', LOBBY])).toBe(LOBBY);
  });

  it.each([[['game.exe']], [['game.exe', '+connect_lobby']], [['game.exe', '+connect_lobby', '../x']]])(
    'ignores a missing or malformed lobby %j',
    (argv) => {
      expect(connectLobbyFromArgv(argv)).toBeNull();
    },
  );
});

describe('isSteamId', () => {
  it('accepts 64-bit decimal ids only', () => {
    expect(isSteamId(LOBBY)).toBe(true);
    expect(isSteamId('76561198000000000')).toBe(true);
    for (const bad of ['', '0', '123', '0123456789012345', '7656119800000000a', 76561198000000000]) {
      expect(isSteamId(bad)).toBe(false);
    }
  });
});

describe('packet framing', () => {
  it('matches the protocol limits and player count', () => {
    expect(STEAM_MESSAGE_LIMITS).toEqual(MESSAGE_LIMITS);
    expect(STEAM_LOBBY_MAX_MEMBERS).toBe(MAX_PLAYERS);
  });

  it.each(['reliable', 'disposable'] as const)('round-trips a %s message', (channel) => {
    const raw = '{"type":"pose","note":"Martian ñ"}';
    const packet = encodePacket(channel, raw);
    expect(packet).not.toBeNull();
    expect(decodePacket(packet as Uint8Array)).toEqual({ channel, raw });
  });

  it('refuses a message over its channel limit instead of truncating it', () => {
    expect(encodePacket('disposable', 'x'.repeat(1025))).toBeNull();
    expect(encodePacket('disposable', 'x'.repeat(1024))).not.toBeNull();
    expect(encodePacket('reliable', 'ñ'.repeat(8193))).toBeNull();
  });

  it('drops unknown tags, oversize bodies and invalid UTF-8', () => {
    expect(decodePacket(new Uint8Array([0x58, 0x41]))).toBeNull();
    expect(decodePacket(new Uint8Array())).toBeNull();
    expect(decodePacket(new Uint8Array(1026).fill(0x44))).toBeNull();
    expect(decodePacket(new Uint8Array([0x52, 0xff, 0xfe]))).toBeNull();
  });
});

describe('BoundedQueue', () => {
  it('drops the oldest item past its limit and counts it', () => {
    const queue = new BoundedQueue<number>(2);
    queue.push(1);
    queue.push(2);
    queue.push(3);
    expect(queue.dropped).toBe(1);
    expect(queue.drain()).toEqual([2, 3]);
    expect(queue.size).toBe(0);
  });
});
