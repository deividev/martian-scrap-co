import { describe, expect, it } from 'vitest';
import { EntityIdAllocator, entityId, transactionId, type EntityId, type TransactionId } from '../../src/domain/ids';
import { LocalNetwork, type FaultPlan } from '../../src/net/localTransport';
import {
  PROTOCOL_VERSION,
  decodeHostMessage,
  encodeMessage,
  type HostMessage,
  type Intent,
  type SessionId,
  type WorldEvent,
} from '../../src/net/protocol';
import type { ClientTransport } from '../../src/net/transport';
import { SnapshotCatcher } from '../support/snapshotCatcher';
import {
  HostRouter,
  type Pose,
  type WorldAuthority,
  type WorldIntent,
  type WorldOutcome,
} from '../../src/simulation/host/hostRouter';

const SESSION = 'ses-faults001' as SessionId;
const id = (n: number): EntityId => entityId(`ent-${n.toString(36)}`);
const range = (from: number, count: number): EntityId[] => Array.from({ length: count }, (_, i) => id(from + i));

const PIECES = range(1, 40);
const ASSEMBLIES = range(100, 6);
const BALES = range(200, 6);
const FRAGMENTS_PER_CUT = 4;
const BALE_PRICE = 40;

/** Authoritative world: loose pieces, cuttable assemblies and sellable bales, with conservation counters. */
class World implements WorldAuthority {
  readonly pieces = new Set(PIECES);
  readonly assemblies = new Set(ASSEMBLIES);
  readonly bales = new Set(BALES);
  readonly collected: EntityId[] = [];
  readonly fragments: EntityId[] = [];
  readonly sold: EntityId[] = [];
  readonly ids = new EntityIdAllocator(10_000);
  credits = 0;

  checkClaim(target: EntityId) {
    return this.pieces.has(target) || this.bales.has(target) ? null : ('unavailable' as const);
  }

  settleReleased(): void {}

  apply(intent: WorldIntent, slot: number): WorldOutcome {
    if (intent.kind === 'collect') {
      if (!intent.targets.every((t) => this.pieces.has(t))) return { ok: false, reason: 'unavailable' };
      for (const t of intent.targets) this.pieces.delete(t);
      this.collected.push(...intent.targets);
      return { ok: true, events: [{ kind: 'collected', pieces: intent.targets, collector: slot }] };
    }
    if (intent.kind === 'cut') {
      if (!this.assemblies.delete(intent.target)) return { ok: false, reason: 'unavailable' };
      const fragments = Array.from({ length: FRAGMENTS_PER_CUT }, () => this.ids.allocate());
      this.fragments.push(...fragments);
      return { ok: true, events: [{ kind: 'cut', target: intent.target, fragments }] };
    }
    if (intent.kind === 'sell') {
      if (!this.bales.delete(intent.target)) return { ok: false, reason: 'unavailable' };
      this.sold.push(intent.target);
      this.credits += BALE_PRICE;
      return { ok: true, events: [{ kind: 'sold', bale: intent.target, credits: BALE_PRICE, balance: this.credits }] };
    }
    return { ok: false, reason: 'unavailable' };
  }

  snapshot(): unknown {
    return {
      pieces: [...this.pieces],
      assemblies: [...this.assemblies],
      bales: [...this.bales],
      credits: this.credits,
    };
  }
}

/**
 * A guest that retries every unanswered intent with the same transaction id, applies events in revision order and
 * keeps only the newest pose per player.
 */
class Guest {
  slot = -1;
  generation = 0;
  revision = 0;
  readonly events: WorldEvent[] = [];
  /** Tick of the newest poses message applied; an older one arriving late is ignored. */
  posesTick = 0;
  stalePosesIgnored = 0;
  readonly #waiting = new Map<TransactionId, { intent: Intent; sentAt: number }>();
  readonly answered = new Set<TransactionId>();
  #txn = 0;
  #poseTick = 0;

  constructor(
    readonly transport: ClientTransport,
    readonly tag: string,
  ) {
    transport.onMessage((channel, raw) => {
      const decoded = decodeHostMessage(raw, channel);
      if (decoded.ok) this.#apply(decoded.message);
    });
    const { channel, raw } = encodeMessage({ type: 'hello', protocol: PROTOCOL_VERSION, build: '0.0.0' });
    transport.send(channel, raw);
  }

  /** Welcomed and caught up: the snapshot loaded and the host told. */
  get welcomed(): boolean {
    return this.ready;
  }

  ready = false;
  readonly #snapshots = new SnapshotCatcher();

  get idle(): boolean {
    return this.#waiting.size === 0;
  }

  #apply(message: HostMessage): void {
    if (message.type === 'welcome') {
      this.slot = message.slot;
      this.generation = message.generation;
      this.revision = message.revision;
    } else if (message.type === 'snapshot-begin' || message.type === 'snapshot-chunk') {
      const loaded = this.#snapshots.feed(message);
      if (!loaded) return;
      this.revision = loaded.revision;
      this.ready = true;
      const { channel, raw } = encodeMessage({
        type: 'ready',
        session: SESSION,
        generation: this.generation,
        revision: this.revision,
      });
      this.transport.send(channel, raw);
    } else if (message.type === 'event') {
      if (message.txn) this.#answer(message.txn);
      if (message.revision <= this.revision) return;
      expect(message.revision).toBe(this.revision + 1);
      this.revision = message.revision;
      this.events.push(message.event);
    } else if (message.type === 'reject') {
      this.#answer(message.txn);
    } else if (message.type === 'poses') {
      if (message.tick <= this.posesTick) this.stalePosesIgnored += 1;
      else this.posesTick = message.tick;
    }
  }

  #answer(txn: TransactionId): void {
    if (this.#waiting.delete(txn)) this.answered.add(txn);
  }

  #send(txn: TransactionId, intent: Intent): void {
    const { channel, raw } = encodeMessage({
      type: 'intent',
      session: SESSION,
      generation: this.generation,
      txn,
      basis: this.revision,
      intent,
    });
    this.transport.send(channel, raw);
  }

  act(intent: Intent, now: number): void {
    this.#txn += 1;
    const txn = transactionId(`txn-${this.tag}${this.#txn}`);
    this.#waiting.set(txn, { intent, sentAt: now });
    this.#send(txn, intent);
  }

  /** Resends, with the same transaction id, whatever has gone unanswered for `after` ticks. */
  retry(now: number, after: number): number {
    let resent = 0;
    for (const [txn, entry] of this.#waiting) {
      if (now - entry.sentAt < after) continue;
      entry.sentAt = now;
      this.#send(txn, entry.intent);
      resent += 1;
    }
    return resent;
  }

  sendPose(): void {
    this.#poseTick += 1;
    const pose: Pose = { position: [this.#poseTick * 0.1, 0, this.slot], yaw: 0, pitch: 0 };
    const { channel, raw } = encodeMessage({
      type: 'pose',
      session: SESSION,
      generation: this.generation,
      tick: this.#poseTick,
      pose,
    });
    this.transport.send(channel, raw);
  }

  get lastPoseTick(): number {
    return this.#poseTick;
  }
}

interface RunResult {
  readonly world: World;
  readonly router: HostRouter;
  readonly crew: Guest[];
  readonly network: LocalNetwork;
  readonly resent: number;
  readonly hostPoseRegressions: number;
}

/**
 * Three guests and the host work the same objects at once under a fixed fault schedule: every guest tries to
 * collect, cut and sell overlapping targets, unanswered intents are retried with the same id, and poses flow every
 * tick over a lossy, reordering channel.
 */
function run(faults: FaultPlan): RunResult {
  const network = new LocalNetwork({ faults });
  const world = new World();
  const router = new HostRouter(network.host(), { session: SESSION, world, maxIntentsPerStep: 1000 });
  const crew = ['a', 'b', 'c'].map((tag, i) => new Guest(network.connect(`steam-${i + 1}`), tag));
  let ticks = 0;
  while (!crew.every((g) => g.welcomed) && ticks < 200) {
    network.advance();
    ticks += 1;
  }
  expect(crew.every((g) => g.welcomed)).toBe(true);

  let resent = 0;
  let hostPoseRegressions = 0;
  const lastHostPoseTick = new Map<number, number>();
  for (let tick = 0; tick < 120; tick += 1) {
    const now = network.now;
    for (const [i, guest] of crew.entries()) {
      // Overlapping targets so guests race for the same objects, sometimes several in one intent.
      if (tick % 3 === i % 3)
        guest.act({ kind: 'collect', targets: [PIECES[(tick + i) % PIECES.length] as EntityId] }, now);
      if (tick % 7 === i)
        guest.act({ kind: 'cut', target: ASSEMBLIES[(tick + i) % ASSEMBLIES.length] as EntityId }, now);
      if (tick % 11 === i)
        guest.act({ kind: 'sell', target: BALES[(tick + i) % BALES.length] as EntityId, machine: id(900) }, now);
      if (tick % 13 === i) {
        const pair = [PIECES[(tick * 3) % PIECES.length], PIECES[(tick * 3 + 1) % PIECES.length]] as EntityId[];
        guest.act({ kind: 'collect', targets: pair }, now);
      }
      guest.sendPose();
      resent += guest.retry(now, 6);
    }
    // The host acts too, and repeats its own transaction once.
    if (tick % 17 === 0)
      router.submit(
        { kind: 'cut', target: ASSEMBLIES[tick % ASSEMBLIES.length] as EntityId },
        transactionId(`txn-h${tick}`),
      );
    if (tick % 17 === 0)
      router.submit(
        { kind: 'cut', target: ASSEMBLIES[tick % ASSEMBLIES.length] as EntityId },
        transactionId(`txn-h${tick}`),
      );
    router.broadcastPoses(tick + 1);
    router.beginStep();
    network.advance();
    for (const slot of [1, 2, 3]) {
      const held = router.poseOf(slot)?.tick ?? 0;
      if (held < (lastHostPoseTick.get(slot) ?? 0)) hostPoseRegressions += 1;
      lastHostPoseTick.set(slot, held);
    }
  }
  // Let every retry finish.
  for (let i = 0; i < 400 && !crew.every((g) => g.idle); i += 1) {
    for (const guest of crew) resent += guest.retry(network.now, 6);
    router.beginStep();
    network.advance();
  }
  network.settle();
  return { world, router, crew, network, resent, hostPoseRegressions };
}

const SCHEDULE: FaultPlan = {
  seed: 20261031,
  reliableDelay: [0, 4],
  disposableDelay: [0, 5],
  disposableLoss: 0.3,
  duplicate: 0.2,
};

function checkInvariants(result: RunResult): void {
  const { world, router, crew } = result;
  // Conservation: every piece is either still loose or collected exactly once.
  expect(new Set(world.collected).size).toBe(world.collected.length);
  expect(world.pieces.size + world.collected.length).toBe(PIECES.length);
  // Each assembly is cut at most once into exactly one fragment set; fragments are never reused.
  const cutTargets = ASSEMBLIES.filter((a) => !world.assemblies.has(a));
  expect(world.fragments).toHaveLength(cutTargets.length * FRAGMENTS_PER_CUT);
  expect(new Set(world.fragments).size).toBe(world.fragments.length);
  // Each bale is paid once, and credits match the bales sold.
  expect(new Set(world.sold).size).toBe(world.sold.length);
  expect(world.bales.size + world.sold.length).toBe(BALES.length);
  expect(world.credits).toBe(world.sold.length * BALE_PRICE);
  // Every guest saw the same events in the same order as the host committed them.
  for (const guest of crew) {
    expect(guest.idle).toBe(true);
    expect(guest.revision).toBe(router.revision);
    const collectedSeen = guest.events.flatMap((e) => (e.kind === 'collected' ? e.pieces : []));
    expect(collectedSeen.sort()).toEqual([...world.collected].sort());
    expect(guest.events.filter((e) => e.kind === 'sold')).toHaveLength(world.sold.length);
    expect(guest.events.filter((e) => e.kind === 'cut')).toHaveLength(cutTargets.length);
  }
  expect(crew[0]?.events).toEqual(crew[1]?.events);
  expect(crew[1]?.events).toEqual(crew[2]?.events);
}

describe('fault schedule (MSC-023)', () => {
  it('keeps every authoritative invariant under delay, duplication, retries, loss and reorder', () => {
    const result = run(SCHEDULE);
    // The schedule really exercised the faults.
    expect(result.network.duplicated).toBeGreaterThan(50);
    expect(result.network.lost).toBeGreaterThan(50);
    expect(result.resent).toBeGreaterThan(0);
    // And there was real contention: some intents won, some lost.
    expect(result.world.collected.length).toBeGreaterThan(10);
    expect(result.world.sold.length).toBeGreaterThan(0);
    expect(result.world.fragments.length).toBeGreaterThan(0);
    checkInvariants(result);
  });

  it('replays the same schedule to the same world, event for event', () => {
    const first = run(SCHEDULE);
    const second = run(SCHEDULE);
    expect(second.crew[0]?.events).toEqual(first.crew[0]?.events);
    expect(second.world.credits).toBe(first.world.credits);
    expect(second.network.lost).toBe(first.network.lost);
  });

  it.each([1, 7, 42, 1234])('holds the invariants for seed %i', (seed) => {
    checkInvariants(run({ ...SCHEDULE, seed }));
  });

  it('tolerates lost and reordered poses: the newest pose always wins', () => {
    const result = run(SCHEDULE);
    expect(result.hostPoseRegressions).toBe(0);
    for (const guest of result.crew) {
      const held = result.router.poseOf(guest.slot);
      // Poses are disposable: the host may miss the very last ones, but never goes back to an older one.
      expect(held?.tick).toBeGreaterThan(guest.lastPoseTick - 10);
      // Late, older pose messages did reach guests and were ignored rather than applied.
      expect(guest.posesTick).toBeGreaterThan(100);
    }
    expect(result.crew.reduce((sum, g) => sum + g.stalePosesIgnored, 0)).toBeGreaterThan(0);
  });

  it('answers a repeated transaction with its first result, without a second output', () => {
    const network = new LocalNetwork();
    const world = new World();
    const router = new HostRouter(network.host(), { session: SESSION, world });
    const txn = transactionId('txn-h1');
    const first = router.submit({ kind: 'cut', target: ASSEMBLIES[0] as EntityId }, txn);
    const again = router.submit({ kind: 'cut', target: ASSEMBLIES[0] as EntityId }, txn);
    expect(again).toEqual(first);
    expect(world.fragments).toHaveLength(FRAGMENTS_PER_CUT);
    // A new transaction on the same, already cut assembly is refused by the world.
    expect(router.submit({ kind: 'cut', target: ASSEMBLIES[0] as EntityId }, transactionId('txn-h2'))).toEqual({
      status: 'rejected',
      reason: 'unavailable',
    });
  });

  it('remembers answers across a reconnect, so a resent intent cannot pay twice', () => {
    const network = new LocalNetwork();
    const world = new World();
    const router = new HostRouter(network.host(), { session: SESSION, world });
    const first = new Guest(network.connect('steam-1'), 'a');
    network.flush();
    first.act({ kind: 'sell', target: BALES[0] as EntityId, machine: id(900) }, 0);
    network.flush();
    expect(world.credits).toBe(BALE_PRICE);
    first.transport.close();
    network.flush();
    // The player comes back and resends the same transaction from before the disconnect.
    const back = network.connect('steam-1');
    const answers: string[] = [];
    const snapshots = new SnapshotCatcher();
    back.onMessage((channel, raw) => {
      const decoded = decodeHostMessage(raw, channel);
      if (!decoded.ok) return;
      answers.push(decoded.message.type);
      const loaded = snapshots.feed(decoded.message);
      if (loaded) {
        back.send(
          'reliable',
          encodeMessage({ type: 'ready', session: SESSION, generation: 2, revision: loaded.revision }).raw,
        );
      }
    });
    back.send('reliable', encodeMessage({ type: 'hello', protocol: PROTOCOL_VERSION, build: '0.0.0' }).raw);
    network.flush();
    back.send(
      'reliable',
      encodeMessage({
        type: 'intent',
        session: SESSION,
        generation: 2,
        txn: transactionId('txn-a1'),
        basis: router.revision,
        intent: { kind: 'sell', target: BALES[0] as EntityId, machine: id(900) },
      }).raw,
    );
    network.flush();
    expect(world.credits).toBe(BALE_PRICE);
    expect(world.sold).toHaveLength(1);
    expect(answers).toEqual(['welcome', 'snapshot-begin', 'snapshot-chunk', 'event']);
  });
});
