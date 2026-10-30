import type { ContentId, EntityId, TransactionId } from './ids';

/** Local fragment/joint ids are unique within one assembly definition. */
export interface FragmentDefinition {
  readonly id: string;
  readonly materialId: ContentId;
  readonly massKg: number;
}

export interface JointDefinition {
  readonly id: string;
  /** The two fragments this joint holds together. */
  readonly between: readonly [string, string];
  /** Joints that must be cut first because they block access (authored order, PRD-008). */
  readonly requires?: readonly string[];
}

/**
 * A large assembly that must be separated before transport (PRD-005/008). The anchor fragment is
 * attached to the yard; anything no longer connected to it is released as a loose chunk.
 */
export interface AssemblyDefinition {
  readonly id: string;
  readonly anchor: string;
  readonly fragments: readonly FragmentDefinition[];
  readonly joints: readonly JointDefinition[];
}

/** A released, connected group of fragments with its own world entity. */
export interface Chunk {
  readonly entityId: EntityId;
  readonly fragments: readonly string[];
}

export type CutResult =
  | {
      readonly ok: true;
      readonly jointId: string;
      /** Chunks created by this cut (new entities). */
      readonly created: readonly Chunk[];
      /** Chunk entities retired because this cut split them. */
      readonly retired: readonly EntityId[];
    }
  | { readonly ok: false; readonly reason: 'unknown-joint' | 'already-cut' | 'blocked' };

export interface AssemblySnapshot {
  readonly assemblyId: string;
  readonly cutJoints: readonly string[];
  readonly chunks: readonly Chunk[];
  readonly retiredEntities: readonly EntityId[];
  readonly results: readonly (readonly [TransactionId, CutResult])[];
}

/** Rejects definitions with unknown references, duplicates, dependency cycles or unreachable parts. */
export function validateAssembly(definition: AssemblyDefinition): string[] {
  const errors: string[] = [];
  const fragmentIds = new Set<string>();
  for (const fragment of definition.fragments) {
    if (fragmentIds.has(fragment.id)) errors.push(`duplicate fragment ${fragment.id}`);
    fragmentIds.add(fragment.id);
    if (!Number.isFinite(fragment.massKg) || fragment.massKg <= 0) errors.push(`invalid mass on ${fragment.id}`);
  }
  if (!fragmentIds.has(definition.anchor)) errors.push(`unknown anchor ${definition.anchor}`);
  const jointIds = new Set<string>();
  for (const joint of definition.joints) {
    if (jointIds.has(joint.id)) errors.push(`duplicate joint ${joint.id}`);
    jointIds.add(joint.id);
    for (const end of joint.between)
      if (!fragmentIds.has(end)) errors.push(`joint ${joint.id}: unknown fragment ${end}`);
    if (joint.between[0] === joint.between[1]) errors.push(`joint ${joint.id} joins a fragment to itself`);
  }
  for (const joint of definition.joints) {
    for (const required of joint.requires ?? []) {
      if (!jointIds.has(required)) errors.push(`joint ${joint.id}: unknown required joint ${required}`);
    }
  }
  // Access order must be acyclic, otherwise some joint could never be cut.
  const requires = new Map(definition.joints.map((joint) => [joint.id, joint.requires ?? []]));
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (id: string): boolean => {
    if (state.get(id) === 'done') return true;
    if (state.get(id) === 'visiting') return false;
    state.set(id, 'visiting');
    const ok = (requires.get(id) ?? []).every(visit);
    state.set(id, 'done');
    return ok;
  };
  for (const joint of definition.joints) if (!visit(joint.id)) errors.push(`access order cycle at ${joint.id}`);
  // Every fragment must start connected to the anchor.
  const connected = componentOf(definition.anchor, definition.joints, new Set());
  for (const id of fragmentIds) if (!connected.has(id)) errors.push(`fragment ${id} is not attached to the anchor`);
  return errors;
}

function componentOf(start: string, joints: readonly JointDefinition[], cut: ReadonlySet<string>): Set<string> {
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.pop() as string;
    for (const joint of joints) {
      if (cut.has(joint.id)) continue;
      const [a, b] = joint.between;
      const next = a === current ? b : b === current ? a : null;
      if (next !== null && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

/**
 * Cutting state machine (MSC-018). Each joint is cut at most once, each chunk entity is created at
 * most once and never reused, and a repeated transaction returns its recorded result.
 */
export class AssemblyState {
  readonly #definition: AssemblyDefinition;
  readonly #allocate: () => EntityId;
  readonly #cut = new Set<string>();
  readonly #chunks = new Map<EntityId, Chunk>();
  readonly #retired: EntityId[] = [];
  readonly #results = new Map<TransactionId, CutResult>();

  constructor(definition: AssemblyDefinition, allocate: () => EntityId, snapshot?: AssemblySnapshot) {
    const errors = validateAssembly(definition);
    if (errors.length > 0) throw new Error(`Invalid assembly ${definition.id}: ${errors.join('; ')}`);
    this.#definition = definition;
    this.#allocate = allocate;
    if (snapshot) {
      if (snapshot.assemblyId !== definition.id) throw new Error('Snapshot belongs to another assembly');
      for (const id of snapshot.cutJoints) this.#cut.add(id);
      for (const chunk of snapshot.chunks) this.#chunks.set(chunk.entityId, chunk);
      this.#retired.push(...snapshot.retiredEntities);
      for (const [txn, result] of snapshot.results) this.#results.set(txn, result);
    }
  }

  get definition(): AssemblyDefinition {
    return this.#definition;
  }

  isCut(jointId: string): boolean {
    return this.#cut.has(jointId);
  }

  /** Joints that can be cut right now: uncut, with every access requirement already cut. */
  availableJoints(): string[] {
    return this.#definition.joints
      .filter((joint) => !this.#cut.has(joint.id) && (joint.requires ?? []).every((id) => this.#cut.has(id)))
      .map((joint) => joint.id);
  }

  /** Fragments still attached to the anchor. */
  anchoredFragments(): string[] {
    return [...componentOf(this.#definition.anchor, this.#definition.joints, this.#cut)];
  }

  chunks(): Chunk[] {
    return [...this.#chunks.values()];
  }

  cut(jointId: string, txn: TransactionId): CutResult {
    const recorded = this.#results.get(txn);
    if (recorded) return recorded;
    const result = this.#applyCut(jointId);
    this.#results.set(txn, result);
    return result;
  }

  snapshot(): AssemblySnapshot {
    return {
      assemblyId: this.#definition.id,
      cutJoints: [...this.#cut],
      chunks: this.chunks(),
      retiredEntities: [...this.#retired],
      results: [...this.#results],
    };
  }

  #applyCut(jointId: string): CutResult {
    const joint = this.#definition.joints.find((candidate) => candidate.id === jointId);
    if (!joint) return { ok: false, reason: 'unknown-joint' };
    if (this.#cut.has(jointId)) return { ok: false, reason: 'already-cut' };
    if (!(joint.requires ?? []).every((id) => this.#cut.has(id))) return { ok: false, reason: 'blocked' };

    const owner = this.#ownerOf(joint.between[0]);
    this.#cut.add(jointId);
    const [a, b] = joint.between;
    const sideA = componentOf(a, this.#definition.joints, this.#cut);
    if (sideA.has(b)) return { ok: true, jointId, created: [], retired: [] };

    const sideB = componentOf(b, this.#definition.joints, this.#cut);
    const created: Chunk[] = [];
    const retired: EntityId[] = [];
    if (owner === 'anchor') {
      // The side without the anchor breaks free as one new chunk.
      const loose = sideA.has(this.#definition.anchor) ? sideB : sideA;
      created.push(this.#createChunk(loose));
    } else {
      // A loose chunk split in two: retire it and create both halves.
      this.#chunks.delete(owner);
      this.#retired.push(owner);
      retired.push(owner);
      created.push(this.#createChunk(sideA), this.#createChunk(sideB));
    }
    return { ok: true, jointId, created, retired };
  }

  #ownerOf(fragmentId: string): EntityId | 'anchor' {
    for (const chunk of this.#chunks.values()) if (chunk.fragments.includes(fragmentId)) return chunk.entityId;
    return 'anchor';
  }

  #createChunk(fragments: ReadonlySet<string>): Chunk {
    const order = this.#definition.fragments.map((fragment) => fragment.id);
    const chunk: Chunk = {
      entityId: this.#allocate(),
      fragments: [...fragments].sort((x, y) => order.indexOf(x) - order.indexOf(y)),
    };
    this.#chunks.set(chunk.entityId, chunk);
    return chunk;
  }
}
