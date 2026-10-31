import type { ContentId, EntityId, TransactionId } from '../../domain/ids';
import {
  MAX_PLAYERS,
  PROTOCOL_VERSION,
  decodeClientMessage,
  encodeMessage,
  type ClientMessage,
  type HostMessage,
  type Intent,
  type RejectReason,
  type SessionCloseReason,
  type SessionId,
  type WorldEvent,
} from '../../net/protocol';
import type { HostTransport, PeerId } from '../../net/transport';
import { ClaimRegistry, type HolderId } from '../handling/claims';

/** The host plays in slot 0 and never travels over the transport. */
export const HOST_SLOT = 0;

/** Intents that change the world beyond claims; the game's world adapter validates and applies them. */
export type WorldIntent = Exclude<Intent, { kind: 'claim' | 'release' }>;

export type WorldOutcome =
  { readonly ok: true; readonly events: readonly WorldEvent[] } | { readonly ok: false; readonly reason: RejectReason };

/**
 * The authoritative world as the router sees it. The game implements this over its simulation: existence, reach,
 * material compatibility, funds and prerequisites are checked there, and a successful `apply` has already changed
 * the world when it returns the events that describe the change.
 */
export interface WorldAuthority {
  /** Why `slot` may not claim `target` now (missing, out of reach, not claimable), or null if it may. */
  checkClaim(target: EntityId, slot: number): RejectReason | null;
  /** A released object needs a safe resting place (MSC-003 P3: removed or departed players). */
  settleReleased(target: EntityId): void;
  apply(intent: WorldIntent, slot: number): WorldOutcome;
}

export interface HostRouterOptions {
  readonly session: SessionId;
  readonly world: WorldAuthority;
  /** Committed events kept for gap recovery (`resync`); older gaps need a snapshot (MSC-024). */
  readonly eventLogSize?: number;
  /** Frames that fail to decode before the guest is disconnected. */
  readonly maxInvalidFrames?: number;
  /** Intents accepted from one guest per simulation step; the rest are rejected as rate-limited. */
  readonly maxIntentsPerStep?: number;
  /**
   * Answered transactions remembered for repeats (MSC-023). A repeat older than this is decided again; the world then
   * refuses anything already consumed, so it still cannot duplicate an output.
   */
  readonly resultCacheSize?: number;
}

export type Pose = Extract<ClientMessage, { type: 'pose' }>['pose'];

export type RouteResult =
  | { readonly status: 'committed'; readonly revision: number }
  | { readonly status: 'rejected'; readonly reason: RejectReason }
  | { readonly status: 'dropped' };

interface Member {
  readonly peer: PeerId;
  readonly slot: number;
  readonly generation: number;
  canSpend: boolean;
  intentsThisStep: number;
  invalidFrames: number;
}

export interface PurchaseRequest {
  readonly slot: number;
  readonly offer: ContentId;
  readonly txn: TransactionId;
}

const holderOf = (slot: number): HolderId => `player-${slot}`;

/**
 * Host command router (MSC-022). Every guest frame is decoded, bound to a current member, rate-limited and checked
 * against the world revision before a claim or world change is decided; committed changes are numbered events sent
 * to every member, and refusals go back to the sender only. The host's own actions take the same path, so a host
 * never bypasses the rules it enforces on guests. Session policy follows MSC-003: invite-only, lockable, at most four
 * players, removal until re-invited, purchases by guests only with "Can spend" (otherwise a request to the host).
 */
export class HostRouter {
  readonly session: SessionId;
  readonly claims = new ClaimRegistry();
  readonly #world: WorldAuthority;
  readonly #transport: HostTransport;
  readonly #members = new Map<PeerId, Member>();
  readonly #pending = new Set<PeerId>();
  /** Last slot and generation per identity, so a returning player gets their slot back with a new generation. */
  readonly #history = new Map<PeerId, { slot: number; generation: number }>();
  readonly #removed = new Set<PeerId>();
  readonly #lastChanged = new Map<EntityId, number>();
  readonly #log: Extract<HostMessage, { type: 'event' }>[] = [];
  readonly #eventLogSize: number;
  readonly #maxInvalidFrames: number;
  readonly #maxIntentsPerStep: number;
  readonly #purchaseListeners: ((request: PurchaseRequest) => void)[] = [];
  readonly #snapshotListeners: ((slot: number) => void)[] = [];
  /** Answers per transaction, keyed by sender identity so one player's ids never answer another's. */
  readonly #answered = new Map<string, { result: RouteResult; replies: HostMessage[] }>();
  readonly #resultCacheSize: number;
  /** Replies produced while one intent is decided, for the result cache. */
  #replies: HostMessage[] | undefined;
  /** Latest pose per slot; an older pose arriving late never replaces a newer one. */
  readonly #poses = new Map<number, { tick: number; pose: Pose }>();
  #revision = 0;
  #locked = false;

  constructor(transport: HostTransport, options: HostRouterOptions) {
    this.session = options.session;
    this.#world = options.world;
    this.#transport = transport;
    this.#eventLogSize = options.eventLogSize ?? 256;
    this.#maxInvalidFrames = options.maxInvalidFrames ?? 8;
    this.#maxIntentsPerStep = options.maxIntentsPerStep ?? 32;
    this.#resultCacheSize = options.resultCacheSize ?? 4096;
    transport.onPeerJoined((peer) => this.#pending.add(peer));
    transport.onMessage((peer, channel, raw) => {
      const decoded = decodeClientMessage(raw, channel);
      if (decoded.ok) this.#route(peer, decoded.message);
      else this.#invalidFrame(peer);
    });
    transport.onPeerLeft((peer) => this.#forget(peer));
  }

  get revision(): number {
    return this.#revision;
  }

  get locked(): boolean {
    return this.#locked;
  }

  /** Occupied slots, host included. */
  get slots(): number[] {
    return [HOST_SLOT, ...[...this.#members.values()].map((member) => member.slot)].sort((a, b) => a - b);
  }

  /** Guest purchases waiting for the host's approval (MSC-003 P2, scenario T5). */
  onPurchaseRequest(listener: (request: PurchaseRequest) => void): void {
    this.#purchaseListeners.push(listener);
  }

  /** A guest asked to recover from a gap older than the event log; it needs a snapshot (MSC-024). */
  onSnapshotNeeded(listener: (slot: number) => void): void {
    this.#snapshotListeners.push(listener);
  }

  /** Call once per simulation step: per-guest intent budgets start over. */
  beginStep(): void {
    for (const member of this.#members.values()) member.intentsThisStep = 0;
  }

  /** The host's own action, decided by the same rules as a guest's; a repeated transaction id returns its first result. */
  submit(intent: Intent, txn: TransactionId): RouteResult {
    return this.#once(`host|${txn}`, undefined, () => this.#decide(HOST_SLOT, txn, this.#revision, intent, undefined));
  }

  /** The host's own pose, sent with the guests' poses. */
  setHostPose(tick: number, pose: Pose): void {
    this.#storePose(HOST_SLOT, tick, pose);
  }

  /** Sends every member the latest poses, on the disposable channel: a lost or late pose is simply superseded. */
  broadcastPoses(tick: number): void {
    const players = [...this.#poses].map(([slot, entry]) => ({ slot, pose: entry.pose }));
    const { channel, raw } = encodeMessage({ type: 'poses', session: this.session, tick, players });
    for (const member of this.#members.values()) this.#transport.send(member.peer, channel, raw);
  }

  /** The latest pose the host holds for a slot. */
  poseOf(slot: number): { tick: number; pose: Pose } | undefined {
    return this.#poses.get(slot);
  }

  #storePose(slot: number, tick: number, pose: Pose): void {
    const current = this.#poses.get(slot);
    if (!current || tick > current.tick) this.#poses.set(slot, { tick, pose });
  }

  /**
   * Decides a transaction once (MSC-023). A repeat (a retry, a duplicated packet, a resend after reconnecting) gets
   * the first answer again and changes nothing. Rate-limited refusals are not remembered, so a retry can succeed.
   */
  #once(key: string, member: Member | undefined, decide: () => RouteResult): RouteResult {
    const known = this.#answered.get(key);
    if (known) {
      if (member) for (const reply of known.replies) this.#send(member.peer, reply);
      return known.result;
    }
    this.#replies = [];
    const result = decide();
    const replies = this.#replies;
    this.#replies = undefined;
    if (result.status !== 'rejected' || result.reason !== 'rate-limited') {
      this.#answered.set(key, { result, replies });
      if (this.#answered.size > this.#resultCacheSize) {
        const oldest = this.#answered.keys().next();
        if (!oldest.done) this.#answered.delete(oldest.value);
      }
    }
    return result;
  }

  /** Host-only (MSC-003 P1): close or reopen the session to new joins. */
  setLocked(locked: boolean): void {
    this.#locked = locked;
  }

  /** Host-only (MSC-003 P2): let a guest spend shared credits directly for this session. */
  setCanSpend(slot: number, canSpend: boolean): void {
    const member = this.#memberAt(slot);
    if (member) member.canSpend = canSpend;
  }

  /** Host-only (MSC-003 P3): remove a guest; they cannot rejoin until invited again. */
  remove(slot: number): void {
    const member = this.#memberAt(slot);
    if (!member) return;
    this.#removed.add(member.peer);
    this.#close(member.peer, 'removed');
  }

  /** A new invitation lifts an earlier removal (MSC-003 P3). */
  invite(peer: PeerId): void {
    this.#removed.delete(peer);
  }

  #memberAt(slot: number): Member | undefined {
    for (const member of this.#members.values()) if (member.slot === slot) return member;
    return undefined;
  }

  #send(peer: PeerId, message: HostMessage): void {
    const { channel, raw } = encodeMessage(message);
    this.#transport.send(peer, channel, raw);
  }

  #close(peer: PeerId, reason: SessionCloseReason): void {
    this.#send(peer, { type: 'closed', reason });
    this.#transport.disconnect(peer, 'kicked');
    this.#forget(peer);
  }

  #invalidFrame(peer: PeerId): void {
    const member = this.#members.get(peer);
    if (!member) {
      // Before a valid hello nothing is trusted: one bad frame ends the connection.
      if (this.#pending.has(peer)) this.#close(peer, 'protocol-error');
      return;
    }
    member.invalidFrames += 1;
    if (member.invalidFrames > this.#maxInvalidFrames) this.#close(peer, 'protocol-error');
  }

  #route(peer: PeerId, message: ClientMessage): RouteResult {
    if (message.type === 'hello') return this.#hello(peer, message);
    const member = this.#members.get(peer);
    // Membership is the transport identity plus the current binding; a packet from another session or an earlier
    // connection of the same player is ignored.
    if (!member || message.session !== this.session || message.generation !== member.generation) {
      if (!member) this.#invalidFrame(peer);
      return { status: 'dropped' };
    }
    if (message.type === 'leave') {
      this.#transport.disconnect(peer, 'closed');
      this.#forget(peer);
      return { status: 'dropped' };
    }
    if (message.type === 'resync') {
      this.#resync(member, message.fromRevision);
      return { status: 'dropped' };
    }
    if (message.type === 'pose') {
      this.#storePose(member.slot, message.tick, message.pose);
      return { status: 'dropped' };
    }
    const intent = message;
    return this.#once(`${member.peer}|${intent.txn}`, member, () => {
      member.intentsThisStep += 1;
      if (member.intentsThisStep > this.#maxIntentsPerStep) return this.#reject(member, intent.txn, 'rate-limited');
      return this.#decide(member.slot, intent.txn, intent.basis, intent.intent, member);
    });
  }

  #hello(peer: PeerId, message: Extract<ClientMessage, { type: 'hello' }>): RouteResult {
    const existing = this.#members.get(peer);
    if (existing) {
      // A repeated hello on a live connection gets the same welcome again; nothing changes.
      this.#welcome(existing);
      return { status: 'dropped' };
    }
    if (!this.#pending.has(peer)) return { status: 'dropped' };
    if (message.protocol !== PROTOCOL_VERSION) {
      this.#send(peer, { type: 'incompatible', protocol: PROTOCOL_VERSION });
      this.#transport.disconnect(peer, 'kicked');
      this.#pending.delete(peer);
      return { status: 'dropped' };
    }
    if (this.#removed.has(peer)) return this.#refuse(peer, 'removed');
    if (this.#locked) return this.#refuse(peer, 'locked');
    const used = new Set(this.slots);
    const previous = this.#history.get(peer);
    const free = Array.from({ length: MAX_PLAYERS }, (_, slot) => slot).filter((slot) => !used.has(slot));
    const slot = previous && free.includes(previous.slot) ? previous.slot : this.#freshSlot(free);
    if (slot === undefined) return this.#refuse(peer, 'full');
    const generation = (previous?.generation ?? 0) + 1;
    const member: Member = { peer, slot, generation, canSpend: false, intentsThisStep: 0, invalidFrames: 0 };
    this.#pending.delete(peer);
    this.#members.set(peer, member);
    this.#history.set(peer, { slot, generation });
    this.#welcome(member);
    return { status: 'dropped' };
  }

  /** Prefers a slot nobody has used, so a player who left can come back to theirs. */
  #freshSlot(free: number[]): number | undefined {
    const remembered = new Set([...this.#history.values()].map((entry) => entry.slot));
    return free.find((slot) => !remembered.has(slot)) ?? free[0];
  }

  #refuse(peer: PeerId, reason: SessionCloseReason): RouteResult {
    this.#pending.delete(peer);
    this.#close(peer, reason);
    return { status: 'dropped' };
  }

  #welcome(member: Member): void {
    this.#send(member.peer, {
      type: 'welcome',
      protocol: PROTOCOL_VERSION,
      session: this.session,
      generation: member.generation,
      slot: member.slot,
      revision: this.#revision,
    });
  }

  #forget(peer: PeerId): void {
    this.#pending.delete(peer);
    const member = this.#members.get(peer);
    if (!member) return;
    this.#members.delete(peer);
    // Anything the player held is released at a safe place; nothing stays claimed by someone who is gone.
    for (const target of this.claims.releaseAll(holderOf(member.slot))) {
      this.#world.settleReleased(target);
      this.#commit(null, member.slot, { kind: 'released', target });
    }
  }

  #resync(member: Member, fromRevision: number): void {
    const oldest = this.#log[0]?.revision ?? this.#revision + 1;
    if (fromRevision > this.#revision) return;
    if (fromRevision + 1 < oldest) {
      for (const listener of this.#snapshotListeners) listener(member.slot);
      return;
    }
    for (const event of this.#log) if (event.revision > fromRevision) this.#send(member.peer, event);
  }

  #reject(member: Member | undefined, txn: TransactionId, reason: RejectReason): RouteResult {
    const message: HostMessage = { type: 'reject', session: this.session, txn, reason, revision: this.#revision };
    this.#replies?.push(message);
    if (member) this.#send(member.peer, message);
    return { status: 'rejected', reason };
  }

  #decide(slot: number, txn: TransactionId, basis: number, intent: Intent, member: Member | undefined): RouteResult {
    if (basis > this.#revision) return this.#reject(member, txn, 'invalid');
    // An intent about an object that changed after the sender last saw it was based on an outdated view.
    const stale = targetsOf(intent).some((target) => (this.#lastChanged.get(target) ?? 0) > basis);
    if (intent.kind === 'claim') {
      const holder = this.claims.holderOf(intent.target);
      // Losing a race for an object reads better as "someone holds it" than as an outdated view.
      if (holder !== undefined && holder !== holderOf(slot)) return this.#reject(member, txn, 'claimed-by-other');
      if (holder === holderOf(slot)) return { status: 'committed', revision: this.#revision };
      if (stale) return this.#reject(member, txn, 'stale-revision');
      const refusal = this.#world.checkClaim(intent.target, slot);
      if (refusal) return this.#reject(member, txn, refusal);
      this.claims.claim(intent.target, holderOf(slot));
      return this.#committed(this.#commit(txn, slot, { kind: 'claimed', target: intent.target, holder: slot }));
    }
    if (stale) return this.#reject(member, txn, 'stale-revision');
    if (intent.kind === 'release') {
      if (!this.claims.release(intent.target, holderOf(slot))) return this.#reject(member, txn, 'not-held');
      return this.#committed(this.#commit(txn, slot, { kind: 'released', target: intent.target }));
    }
    if (intent.kind === 'purchase' && member && !member.canSpend) {
      for (const listener of this.#purchaseListeners) listener({ slot, offer: intent.offer, txn });
      return this.#reject(member, txn, 'awaiting-host');
    }
    // A held object belongs to its holder: nobody else may sell or cut it.
    for (const target of targetsOf(intent)) {
      const holder = this.claims.holderOf(target);
      if (holder !== undefined && holder !== holderOf(slot)) return this.#reject(member, txn, 'claimed-by-other');
    }
    const outcome = this.#world.apply(intent, slot);
    if (!outcome.ok) return this.#reject(member, txn, outcome.reason);
    let revision = this.#revision;
    for (const event of outcome.events) revision = this.#commit(txn, slot, event);
    return { status: 'committed', revision };
  }

  #committed(revision: number): RouteResult {
    return { status: 'committed', revision };
  }

  #commit(txn: TransactionId | null, actor: number, event: WorldEvent): number {
    this.#revision += 1;
    for (const id of entitiesOf(event)) this.#lastChanged.set(id, this.#revision);
    const message: Extract<HostMessage, { type: 'event' }> = {
      type: 'event',
      session: this.session,
      revision: this.#revision,
      txn,
      actor,
      event,
    };
    this.#log.push(message);
    this.#replies?.push(message);
    if (this.#log.length > this.#eventLogSize) this.#log.shift();
    const { channel, raw } = encodeMessage(message);
    for (const member of this.#members.values()) this.#transport.send(member.peer, channel, raw);
    return this.#revision;
  }
}

/** Objects an intent acts on, whose ownership or existence must not have changed since the sender's view. */
function targetsOf(intent: Intent): EntityId[] {
  switch (intent.kind) {
    case 'claim':
    case 'release':
    case 'cut':
    case 'sell':
      return [intent.target];
    case 'collect':
      return [...intent.targets];
    default:
      return [];
  }
}

function entitiesOf(event: WorldEvent): EntityId[] {
  switch (event.kind) {
    case 'claimed':
    case 'released':
      return [event.target];
    case 'collected':
      return [...event.pieces];
    case 'unloaded':
      return [...event.pieces];
    case 'compacted':
      return [event.bale, ...event.pieces];
    case 'sold':
      return [event.bale];
    case 'cut':
      return [event.target, ...event.fragments];
    case 'purchased':
      return [];
  }
}
