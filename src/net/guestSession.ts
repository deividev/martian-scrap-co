import type { TransactionId } from '../domain/ids';
import {
  MAX_MISSING_PER_REQUEST,
  PROTOCOL_VERSION,
  decodeHostMessage,
  encodeMessage,
  type ClientMessage,
  type HostMessage,
  type Intent,
  type SessionId,
} from './protocol';
import { SnapshotAssembler } from './snapshot';
import type { ClientTransport } from './transport';

export type EventMessage = Extract<HostMessage, { type: 'event' }>;

export interface GuestHandlers {
  /** Replace the local world with the host's state at `revision` (JSON from the host's `SessionSnapshot`). */
  load(state: unknown, revision: number): void;
  /** Apply one committed event; called strictly in revision order, only on top of a loaded world. */
  apply(event: EventMessage): void;
  reject?(message: Extract<HostMessage, { type: 'reject' }>): void;
  poses?(message: Extract<HostMessage, { type: 'poses' }>): void;
  closed?(reason: string): void;
}

export interface GuestSessionOptions {
  readonly build: string;
  /** Network time, in the same units as the timeouts below. */
  readonly clock: () => number;
  /** A snapshot not complete within this time is discarded and requested again. */
  readonly snapshotTimeout?: number;
  /** Time without a new chunk before the missing ones are requested again. */
  readonly stallAfter?: number;
  /** Events held while loading; more than this and the load starts over (the host is far ahead). */
  readonly maxBuffered?: number;
}

export type GuestState = 'connecting' | 'loading' | 'ready' | 'closed';

/**
 * A guest's side of joining and staying in step (MSC-024). After the welcome the guest loads a snapshot and holds the
 * events that arrive meanwhile; only when every chunk is present and verified does it load the world, apply the held
 * events on top, tell the host it is ready and allow actions. A partial, oversize, corrupt or expired snapshot is
 * discarded and a new one requested; it never becomes a playable world. Once ready, a gap in event revisions asks the
 * host to replay what is missing (or to send a new snapshot when the gap is too old).
 */
export class GuestSession {
  readonly #transport: ClientTransport;
  readonly #handlers: GuestHandlers;
  readonly #clock: () => number;
  readonly #snapshotTimeout: number;
  readonly #stallAfter: number;
  readonly #maxBuffered: number;
  readonly #buffer = new Map<number, EventMessage>();
  #state: GuestState = 'connecting';
  #assembler: SnapshotAssembler | undefined;
  #lastProgress = 0;
  #session: SessionId | undefined;
  #generation = 0;
  #slot = -1;
  #revision = 0;
  #nextTxn = 1;
  #resyncAsked = false;
  /** Why each discarded snapshot was refused (expired, size, checksum, …). */
  readonly discarded: string[] = [];
  missingRequests = 0;

  constructor(transport: ClientTransport, handlers: GuestHandlers, options: GuestSessionOptions) {
    this.#transport = transport;
    this.#handlers = handlers;
    this.#clock = options.clock;
    this.#snapshotTimeout = options.snapshotTimeout ?? 600;
    this.#stallAfter = options.stallAfter ?? 30;
    this.#maxBuffered = options.maxBuffered ?? 4096;
    transport.onMessage((channel, raw) => {
      const decoded = decodeHostMessage(raw, channel);
      if (decoded.ok) this.#receive(decoded.message);
    });
    transport.onClosed((reason) => {
      this.#state = 'closed';
      this.#handlers.closed?.(reason);
    });
    this.#send({ type: 'hello', protocol: PROTOCOL_VERSION, build: options.build });
  }

  get state(): GuestState {
    return this.#state;
  }

  get slot(): number {
    return this.#slot;
  }

  get generation(): number {
    return this.#generation;
  }

  get session(): SessionId | undefined {
    return this.#session;
  }

  /** Last revision applied to the local world. */
  get revision(): number {
    return this.#revision;
  }

  /** Sends an intent; refused locally (undefined) until the world is loaded and caught up. */
  act(intent: Intent, txn: TransactionId = this.#txn()): TransactionId | undefined {
    if (this.#state !== 'ready') return undefined;
    this.#send({ type: 'intent', ...this.#binding(), txn, basis: this.#revision, intent });
    return txn;
  }

  /** Sends a pose (disposable) once ready. */
  pose(tick: number, pose: Extract<ClientMessage, { type: 'pose' }>['pose']): void {
    if (this.#state === 'ready') this.#send({ type: 'pose', ...this.#binding(), tick, pose });
  }

  leave(): void {
    if (this.#session) this.#send({ type: 'leave', ...this.#binding() });
  }

  /** Call regularly: discards an expired snapshot and asks again for chunks that stopped arriving. */
  tick(): void {
    const assembler = this.#assembler;
    if (this.#state !== 'loading' || !assembler) return;
    const now = this.#clock();
    if (assembler.expired(now)) {
      this.#discard('expired');
      return;
    }
    if (now - this.#lastProgress < this.#stallAfter) return;
    const missing = assembler.missing(MAX_MISSING_PER_REQUEST);
    if (missing.length === 0) return;
    this.#lastProgress = now;
    this.missingRequests += 1;
    this.#send({ type: 'snapshot-missing', ...this.#binding(), snapshot: assembler.header.snapshot, indices: missing });
  }

  #txn(): TransactionId {
    const txn = `txn-s${this.#generation}g${this.#nextTxn}` as TransactionId;
    this.#nextTxn += 1;
    return txn;
  }

  #binding(): { session: SessionId; generation: number } {
    if (!this.#session) throw new Error('Not welcomed yet');
    return { session: this.#session, generation: this.#generation };
  }

  #send(message: ClientMessage): void {
    const { channel, raw } = encodeMessage(message);
    this.#transport.send(channel, raw);
  }

  #receive(message: HostMessage): void {
    switch (message.type) {
      case 'welcome':
        this.#session = message.session;
        this.#generation = message.generation;
        this.#slot = message.slot;
        if (this.#state === 'connecting') this.#state = 'loading';
        return;
      case 'snapshot-begin':
        this.#begin(message);
        return;
      case 'snapshot-chunk':
        this.#chunk(message);
        return;
      case 'event':
        this.#event(message);
        return;
      case 'reject':
        this.#handlers.reject?.(message);
        return;
      case 'poses':
        if (this.#state === 'ready') this.#handlers.poses?.(message);
        return;
      case 'closed':
      case 'incompatible':
        this.#state = 'closed';
        this.#handlers.closed?.(message.type === 'closed' ? message.reason : 'incompatible');
        return;
    }
  }

  #begin(message: Extract<HostMessage, { type: 'snapshot-begin' }>): void {
    if (message.session !== this.#session) return;
    const now = this.#clock();
    const assembler = new SnapshotAssembler(message, now, this.#snapshotTimeout);
    this.#state = 'loading';
    this.#lastProgress = now;
    if (!assembler.plausible) {
      this.#assembler = undefined;
      this.#discard('size');
      return;
    }
    this.#assembler = assembler;
  }

  #chunk(message: Extract<HostMessage, { type: 'snapshot-chunk' }>): void {
    const assembler = this.#assembler;
    if (!assembler || message.session !== this.#session) return;
    if (assembler.add(message.snapshot, message.index, message.data) !== 'accepted') return;
    this.#lastProgress = this.#clock();
    if (assembler.received < assembler.header.chunks) return;
    const result = assembler.complete(this.#clock());
    if (!result.ok) {
      this.#discard(result.error);
      return;
    }
    this.#assembler = undefined;
    this.#handlers.load(result.state, result.revision);
    this.#revision = result.revision;
    for (const revision of [...this.#buffer.keys()]) if (revision <= this.#revision) this.#buffer.delete(revision);
    this.#state = 'ready';
    this.#drain();
    this.#send({ type: 'ready', ...this.#binding(), revision: this.#revision });
  }

  /** Drops the snapshot being loaded and asks for a new one; the world stays unloaded meanwhile. */
  #discard(reason: string): void {
    this.discarded.push(reason);
    this.#assembler = undefined;
    this.#state = 'loading';
    if (this.#session) this.#send({ type: 'snapshot-request', ...this.#binding() });
  }

  #event(message: EventMessage): void {
    if (message.session !== this.#session || message.revision <= this.#revision) return;
    this.#buffer.set(message.revision, message);
    if (this.#state !== 'ready') {
      if (this.#buffer.size > this.#maxBuffered) {
        this.#buffer.clear();
        this.#discard('behind');
      }
      return;
    }
    this.#drain();
  }

  /** Applies held events in order; a hole asks the host once to replay from the last applied revision. */
  #drain(): void {
    for (;;) {
      const next = this.#buffer.get(this.#revision + 1);
      if (!next) break;
      this.#buffer.delete(next.revision);
      this.#revision = next.revision;
      this.#resyncAsked = false;
      this.#handlers.apply(next);
    }
    if (this.#buffer.size > 0 && !this.#resyncAsked) {
      this.#resyncAsked = true;
      this.#send({ type: 'resync', ...this.#binding(), fromRevision: this.#revision });
    }
  }
}
