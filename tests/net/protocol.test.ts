import { describe, expect, it } from 'vitest';
import {
  MAX_IDS_PER_MESSAGE,
  MESSAGE_LIMITS,
  PROTOCOL_VERSION,
  channelOf,
  decodeClientMessage,
  decodeHostMessage,
  encodeMessage,
  type ClientMessage,
  type HostMessage,
  type SessionId,
} from '../../src/net/protocol';
import { contentId, entityId, transactionId } from '../../src/domain/ids';

const session = 'ses-abcdef12' as SessionId;
const binding = { session, generation: 1 };
const piece = entityId('ent-1');
const machine = entityId('ent-2');
const txn = transactionId('txn-1');
const pose = { position: [1, 2, 3] as [number, number, number], yaw: 0.5, pitch: -0.2 };

const clientMessages: ClientMessage[] = [
  { type: 'hello', protocol: PROTOCOL_VERSION, build: '0.0.0' },
  { type: 'intent', ...binding, txn, basis: 4, intent: { kind: 'claim', target: piece } },
  { type: 'intent', ...binding, txn, basis: 4, intent: { kind: 'release', target: piece } },
  { type: 'intent', ...binding, txn, basis: 4, intent: { kind: 'collect', targets: [piece] } },
  { type: 'intent', ...binding, txn, basis: 4, intent: { kind: 'unload', machine } },
  { type: 'intent', ...binding, txn, basis: 4, intent: { kind: 'compact', machine } },
  { type: 'intent', ...binding, txn, basis: 4, intent: { kind: 'sell', target: piece, machine } },
  { type: 'intent', ...binding, txn, basis: 4, intent: { kind: 'cut', target: piece } },
  { type: 'intent', ...binding, txn, basis: 4, intent: { kind: 'purchase', offer: contentId('collector-tier-2') } },
  { type: 'pose', ...binding, tick: 9, pose },
  { type: 'resync', ...binding, fromRevision: 3 },
  { type: 'leave', ...binding },
  { type: 'snapshot-request', ...binding },
  { type: 'snapshot-missing', ...binding, snapshot: 2, indices: [0, 5] },
  { type: 'ready', ...binding, revision: 12 },
];

const hostMessages: HostMessage[] = [
  { type: 'welcome', protocol: PROTOCOL_VERSION, ...binding, slot: 1, revision: 0 },
  { type: 'incompatible', protocol: PROTOCOL_VERSION },
  { type: 'event', session, revision: 1, txn, actor: 1, event: { kind: 'claimed', target: piece, holder: 1 } },
  { type: 'event', session, revision: 2, txn: null, actor: 0, event: { kind: 'released', target: piece } },
  {
    type: 'event',
    session,
    revision: 3,
    txn,
    actor: 2,
    event: { kind: 'sold', bale: piece, credits: 40, balance: 80 },
  },
  { type: 'reject', session, txn, reason: 'claimed-by-other', revision: 3 },
  { type: 'poses', session, tick: 9, players: [{ slot: 0, pose }] },
  { type: 'closed', reason: 'host-left' },
  { type: 'snapshot-begin', session, snapshot: 2, revision: 12, bytes: 9001, chunks: 2, checksum: 123456 },
  { type: 'snapshot-chunk', session, snapshot: 2, index: 1, data: 'QUJD' },
];

describe('protocol messages', () => {
  it.each(clientMessages.map((message) => [message.type, message] as const))('round-trips client %s', (_, message) => {
    const { channel, raw } = encodeMessage(message);
    expect(decodeClientMessage(raw, channel)).toEqual({ ok: true, message });
  });

  it.each(hostMessages.map((message) => [message.type, message] as const))('round-trips host %s', (_, message) => {
    const { channel, raw } = encodeMessage(message);
    expect(decodeHostMessage(raw, channel)).toEqual({ ok: true, message });
  });

  it('sends poses as disposable and every world change as reliable', () => {
    expect(clientMessages.filter((m) => channelOf(m) === 'disposable').map((m) => m.type)).toEqual(['pose']);
    expect(hostMessages.filter((m) => channelOf(m) === 'disposable').map((m) => m.type)).toEqual(['poses']);
  });

  it('refuses a message on the wrong channel, so a lossy path can never carry a world change', () => {
    const intent = encodeMessage(clientMessages[1] as ClientMessage).raw;
    expect(decodeClientMessage(intent, 'disposable')).toEqual({ ok: false, error: 'wrong-channel' });
    const poseRaw = encodeMessage(clientMessages[9] as ClientMessage).raw;
    expect(decodeClientMessage(poseRaw, 'reliable')).toEqual({ ok: false, error: 'wrong-channel' });
  });

  it('never lets a guest send a result: host-only messages are not client messages', () => {
    for (const message of hostMessages) {
      expect(decodeClientMessage(JSON.stringify(message), channelOf(message)).ok).toBe(false);
    }
  });

  const intentWith = (patch: Record<string, unknown>): string =>
    JSON.stringify({ type: 'intent', ...binding, txn, basis: 0, intent: { kind: 'claim', target: piece }, ...patch });

  it.each([
    ['an unknown field', intentWith({ credits: 9999 })],
    ['an unknown intent', intentWith({ intent: { kind: 'spawn', target: piece } })],
    ['a result field inside an intent', intentWith({ intent: { kind: 'claim', target: piece, holder: 0 } })],
    ['a numeric entity id (render or physics handle)', intentWith({ intent: { kind: 'claim', target: 7 } })],
    ['a malformed transaction id', intentWith({ txn: 'TXN 1' })],
    ['a session from another format', intentWith({ session: 'lobby-1' })],
    ['generation zero', intentWith({ generation: 0 })],
    ['a fractional revision', intentWith({ basis: 1.5 })],
    ['a negative revision', intentWith({ basis: -1 })],
    [
      'too many targets',
      intentWith({ intent: { kind: 'collect', targets: Array(MAX_IDS_PER_MESSAGE + 1).fill(piece) } }),
    ],
    ['an empty target list', intentWith({ intent: { kind: 'collect', targets: [] } })],
  ])('rejects %s', (_, raw) => {
    expect(decodeClientMessage(raw, 'reliable')).toEqual({ ok: false, error: 'schema' });
  });

  it('rejects non-finite and out-of-world numbers', () => {
    const base = { type: 'pose', ...binding, tick: 1, pose: { position: [0, 0, 0], yaw: 0, pitch: 0 } };
    const raw = JSON.stringify(base).replace('"position":[0,0,0]', '"position":[1e999,0,0]');
    expect(decodeClientMessage(raw, 'disposable')).toEqual({ ok: false, error: 'schema' });
    const far = JSON.stringify({ ...base, pose: { position: [5000, 0, 0], yaw: 0, pitch: 0 } });
    expect(decodeClientMessage(far, 'disposable')).toEqual({ ok: false, error: 'schema' });
  });

  it('rejects malformed JSON and oversize input before parsing it', () => {
    expect(decodeClientMessage('{"type":', 'reliable')).toEqual({ ok: false, error: 'malformed' });
    const huge = `{"type":"hello","build":"${'a'.repeat(MESSAGE_LIMITS.reliable)}"}`;
    expect(decodeClientMessage(huge, 'reliable')).toEqual({ ok: false, error: 'too-large' });
    // Multi-byte text counts in UTF-8 bytes, not characters.
    const wide = `"${'é'.repeat(MESSAGE_LIMITS.disposable / 2 + 1)}"`;
    expect(wide.length).toBeLessThan(MESSAGE_LIMITS.disposable + 3);
    expect(decodeClientMessage(wide, 'disposable')).toEqual({ ok: false, error: 'too-large' });
  });

  it('refuses to encode an invalid message', () => {
    const bad = { type: 'event', session, revision: 1, txn, actor: 9, event: { kind: 'released', target: piece } };
    expect(() => encodeMessage(bad as HostMessage)).toThrow(TypeError);
  });

  it('carries the protocol version so mismatched builds are refused before interacting', () => {
    const old = JSON.stringify({ type: 'welcome', protocol: PROTOCOL_VERSION + 1, ...binding, slot: 1, revision: 0 });
    expect(decodeHostMessage(old, 'reliable')).toEqual({ ok: false, error: 'schema' });
  });
});
