import { z } from 'zod';
import {
  isContentId,
  isEntityId,
  isTransactionId,
  type ContentId,
  type EntityId,
  type TransactionId,
} from '../domain/ids';

/**
 * Co-op wire protocol (MSC-021). Guests send intents, the host validates them and answers with committed events or
 * a rejection; poses are disposable. Every message is a bounded, strictly validated JSON object, and nothing here
 * depends on Steam or any other transport. Bump `PROTOCOL_VERSION` whenever a message shape changes, so mismatched
 * builds are refused before they can interact.
 */
export const PROTOCOL_VERSION = 3;

/** Players per session, host included (PRD-016). */
export const MAX_PLAYERS = 4;

export type Channel = 'reliable' | 'disposable';

/** Encoded size limits in UTF-8 bytes. Snapshots travel in their own bounded chunks (MSC-024), not as one message. */
export const MESSAGE_LIMITS = Object.freeze({ reliable: 16 * 1024, disposable: 1024 });

/**
 * Late-join snapshots (MSC-024): the world state at one revision, as UTF-8 JSON split into base64 chunks that each
 * fit one reliable message. A snapshot larger than `maxBytes` is never sent or assembled.
 */
export const SNAPSHOT_LIMITS = Object.freeze({ maxBytes: 4 * 1024 * 1024, chunkBase64: 12_000, maxChunks: 1024 });

/** Chunk indices a guest may ask to have sent again in one message. */
export const MAX_MISSING_PER_REQUEST = 64;

/** Pieces or fragments named in one intent or event. */
export const MAX_IDS_PER_MESSAGE = 64;

/** Session id, issued by the host for one hosted session; packets from another session are dropped. */
export type SessionId = string & { readonly __session: true };
const SESSION_ID_PATTERN = /^ses-[0-9a-z]{8,32}$/;
export const isSessionId = (value: unknown): value is SessionId =>
  typeof value === 'string' && SESSION_ID_PATTERN.test(value);

/** Positions are meters inside the walkable world, with margin. */
const WORLD_COORD_LIMIT = 1000;

const entityIdSchema = z.string().refine(isEntityId, 'invalid entity id') as unknown as z.ZodType<EntityId>;
const contentIdSchema = z.string().refine(isContentId, 'invalid content id') as unknown as z.ZodType<ContentId>;
const transactionIdSchema = z
  .string()
  .refine(isTransactionId, 'invalid transaction id') as unknown as z.ZodType<TransactionId>;
const sessionIdSchema = z.string().refine(isSessionId, 'invalid session id') as unknown as z.ZodType<SessionId>;
const entityIdsSchema = z.array(entityIdSchema).min(1).max(MAX_IDS_PER_MESSAGE);
const slotSchema = z
  .number()
  .int()
  .min(0)
  .max(MAX_PLAYERS - 1);
const revisionSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const generationSchema = z.number().int().min(1).max(0xffff);
const coordSchema = z.number().min(-WORLD_COORD_LIMIT).max(WORLD_COORD_LIMIT);
const angleSchema = z
  .number()
  .min(-Math.PI * 4)
  .max(Math.PI * 4);
const creditsSchema = z.number().int().min(0).max(1_000_000_000);
const buildSchema = z
  .string()
  .min(1)
  .max(32)
  .regex(/^[0-9A-Za-z.+-]+$/);

/** What a guest asks the host to do. The host decides the outcome; a guest never states a result. */
const intentSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('claim'), target: entityIdSchema }),
  z.strictObject({ kind: z.literal('release'), target: entityIdSchema }),
  z.strictObject({ kind: z.literal('collect'), targets: entityIdsSchema }),
  z.strictObject({ kind: z.literal('unload'), machine: entityIdSchema }),
  z.strictObject({ kind: z.literal('compact'), machine: entityIdSchema }),
  z.strictObject({ kind: z.literal('sell'), target: entityIdSchema, machine: entityIdSchema }),
  z.strictObject({ kind: z.literal('cut'), target: entityIdSchema }),
  z.strictObject({ kind: z.literal('purchase'), offer: contentIdSchema }),
]);
export type Intent = z.infer<typeof intentSchema>;

/** A committed world change, applied by every client in revision order. */
const worldEventSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('claimed'), target: entityIdSchema, holder: slotSchema }),
  z.strictObject({ kind: z.literal('released'), target: entityIdSchema }),
  z.strictObject({ kind: z.literal('collected'), pieces: entityIdsSchema, collector: slotSchema }),
  z.strictObject({ kind: z.literal('unloaded'), pieces: entityIdsSchema, machine: entityIdSchema }),
  z.strictObject({
    kind: z.literal('compacted'),
    machine: entityIdSchema,
    bale: entityIdSchema,
    pieces: entityIdsSchema,
  }),
  z.strictObject({ kind: z.literal('sold'), bale: entityIdSchema, credits: creditsSchema, balance: creditsSchema }),
  z.strictObject({ kind: z.literal('cut'), target: entityIdSchema, fragments: entityIdsSchema }),
  z.strictObject({ kind: z.literal('purchased'), offer: contentIdSchema, balance: creditsSchema }),
]);
export type WorldEvent = z.infer<typeof worldEventSchema>;

export const REJECT_REASONS = [
  'not-member',
  'stale-revision',
  'claimed-by-other',
  'not-held',
  'out-of-reach',
  'incompatible',
  'unavailable',
  'insufficient-credits',
  /** The guest lacks the permission for this action (MSC-003 P2). */
  'not-permitted',
  /** Sent to the host for approval instead of being applied (guest purchase without "Can spend"). */
  'awaiting-host',
  'rate-limited',
  /** The guest has not finished loading the world yet (MSC-024): nothing it asks for can apply. */
  'joining',
  'invalid',
] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];

/** Why the host ends a guest's connection; `removed` and `locked` follow the approved session policy (MSC-003 P1, P3). */
export const CLOSE_REASONS = ['host-left', 'kicked', 'removed', 'locked', 'full', 'protocol-error'] as const;
export type SessionCloseReason = (typeof CLOSE_REASONS)[number];

const poseSchema = z.strictObject({
  position: z.tuple([coordSchema, coordSchema, coordSchema]),
  yaw: angleSchema,
  pitch: angleSchema,
});

/** Session binding carried by every guest message after `hello`: a reconnect gets a new generation. */
const bindingShape = { session: sessionIdSchema, generation: generationSchema };

const clientMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('hello'), protocol: z.number().int().min(0).max(0xffff), build: buildSchema }),
  z.strictObject({
    type: z.literal('intent'),
    ...bindingShape,
    txn: transactionIdSchema,
    /** World revision the guest acted on; the host may reject intents based on an outdated view. */
    basis: revisionSchema,
    intent: intentSchema,
  }),
  z.strictObject({ type: z.literal('pose'), ...bindingShape, tick: revisionSchema, pose: poseSchema }),
  z.strictObject({ type: z.literal('resync'), ...bindingShape, fromRevision: revisionSchema }),
  z.strictObject({ type: z.literal('leave'), ...bindingShape }),
  /** Asks for a fresh snapshot (first join failed, expired or was corrupt, or a gap is too old to replay). */
  z.strictObject({ type: z.literal('snapshot-request'), ...bindingShape }),
  z.strictObject({
    type: z.literal('snapshot-missing'),
    ...bindingShape,
    snapshot: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    indices: z
      .array(
        z
          .number()
          .int()
          .min(0)
          .max(SNAPSHOT_LIMITS.maxChunks - 1),
      )
      .min(1)
      .max(MAX_MISSING_PER_REQUEST),
  }),
  /** The guest has the world at `revision` and is caught up; only now may it act. */
  z.strictObject({ type: z.literal('ready'), ...bindingShape, revision: revisionSchema }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

const hostMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('welcome'),
    protocol: z.literal(PROTOCOL_VERSION),
    ...bindingShape,
    slot: slotSchema,
    revision: revisionSchema,
  }),
  z.strictObject({ type: z.literal('incompatible'), protocol: z.number().int().min(0).max(0xffff) }),
  z.strictObject({
    type: z.literal('event'),
    session: sessionIdSchema,
    revision: revisionSchema,
    /** The intent this event answers, so its sender can match it; null for host-originated changes. */
    txn: transactionIdSchema.nullable(),
    actor: slotSchema,
    event: worldEventSchema,
  }),
  z.strictObject({
    type: z.literal('reject'),
    session: sessionIdSchema,
    txn: transactionIdSchema,
    reason: z.enum(REJECT_REASONS),
    revision: revisionSchema,
  }),
  z.strictObject({
    type: z.literal('poses'),
    session: sessionIdSchema,
    tick: revisionSchema,
    players: z.array(z.strictObject({ slot: slotSchema, pose: poseSchema })).max(MAX_PLAYERS),
  }),
  z.strictObject({ type: z.literal('closed'), reason: z.enum(CLOSE_REASONS) }),
  z.strictObject({
    type: z.literal('snapshot-begin'),
    session: sessionIdSchema,
    snapshot: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    revision: revisionSchema,
    bytes: z.number().int().min(2).max(SNAPSHOT_LIMITS.maxBytes),
    chunks: z.number().int().min(1).max(SNAPSHOT_LIMITS.maxChunks),
    /** FNV-1a 32-bit checksum of the UTF-8 bytes: catches corruption and mixed-up chunks, not tampering. */
    checksum: z.number().int().min(0).max(0xffffffff),
  }),
  z.strictObject({
    type: z.literal('snapshot-chunk'),
    session: sessionIdSchema,
    snapshot: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    index: z
      .number()
      .int()
      .min(0)
      .max(SNAPSHOT_LIMITS.maxChunks - 1),
    data: z
      .string()
      .min(1)
      .max(SNAPSHOT_LIMITS.chunkBase64)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  }),
]);
export type HostMessage = z.infer<typeof hostMessageSchema>;

const DISPOSABLE_TYPES: ReadonlySet<string> = new Set(['pose', 'poses']);

/** The channel a message type must travel on: poses are disposable, everything else is reliable. */
export function channelOf(message: ClientMessage | HostMessage): Channel {
  return DISPOSABLE_TYPES.has(message.type) ? 'disposable' : 'reliable';
}

export type DecodeResult<T> =
  | { readonly ok: true; readonly message: T }
  | { readonly ok: false; readonly error: 'too-large' | 'malformed' | 'schema' | 'wrong-channel' };

const encoder = new TextEncoder();

function decodeWith<T extends ClientMessage | HostMessage>(
  schema: z.ZodType<T>,
  raw: string,
  channel: Channel,
): DecodeResult<T> {
  const limit = MESSAGE_LIMITS[channel];
  // UTF-8 never takes fewer bytes than UTF-16 code units, so the cheap check rejects most oversize input first.
  if (raw.length > limit || encoder.encode(raw).length > limit) return { ok: false, error: 'too-large' };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'malformed' };
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) return { ok: false, error: 'schema' };
  if (channelOf(parsed.data) !== channel) return { ok: false, error: 'wrong-channel' };
  return { ok: true, message: parsed.data };
}

export const decodeClientMessage = (raw: string, channel: Channel): DecodeResult<ClientMessage> =>
  decodeWith(clientMessageSchema as z.ZodType<ClientMessage>, raw, channel);

export const decodeHostMessage = (raw: string, channel: Channel): DecodeResult<HostMessage> =>
  decodeWith(hostMessageSchema as z.ZodType<HostMessage>, raw, channel);

const CLIENT_TYPES = {
  hello: true,
  intent: true,
  pose: true,
  resync: true,
  leave: true,
  'snapshot-request': true,
  'snapshot-missing': true,
  ready: true,
} as const;

/** Serializes a message after checking it against its schema and size limit, so a host never sends what it would refuse. */
export function encodeMessage(message: ClientMessage | HostMessage): {
  readonly channel: Channel;
  readonly raw: string;
} {
  const channel = channelOf(message);
  const schema = (message.type in CLIENT_TYPES ? clientMessageSchema : hostMessageSchema) as z.ZodType;
  if (!schema.safeParse(message).success) throw new TypeError(`Invalid ${message.type} message`);
  const raw = JSON.stringify(message);
  if (encoder.encode(raw).length > MESSAGE_LIMITS[channel]) throw new RangeError(`${message.type} message too large`);
  return { channel, raw };
}
