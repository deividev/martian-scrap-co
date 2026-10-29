import { describe, expect, it } from 'vitest';
import { AssemblyState, validateAssembly, type AssemblyDefinition } from '../../src/domain/assembly';
import { EntityIdAllocator, contentId, transactionId, type EntityId } from '../../src/domain/ids';

/**
 * A rover chassis: frame (anchor) with a cover panel and a side panel. The copper coil sits behind
 * the cover, so its joint needs the cover off first. The side panel carries a bracket.
 */
const ROVER: AssemblyDefinition = {
  id: 'rover-chassis',
  anchor: 'frame',
  fragments: [
    { id: 'frame', materialId: contentId('ferrous'), massKg: 80 },
    { id: 'cover', materialId: contentId('aluminum'), massKg: 10 },
    { id: 'coil', materialId: contentId('copper'), massKg: 14 },
    { id: 'side', materialId: contentId('aluminum'), massKg: 9 },
    { id: 'bracket', materialId: contentId('ferrous'), massKg: 3 },
  ],
  joints: [
    { id: 'cover-left', between: ['frame', 'cover'] },
    { id: 'cover-right', between: ['frame', 'cover'] },
    { id: 'coil-mount', between: ['frame', 'coil'], requires: ['cover-left', 'cover-right'] },
    { id: 'side-bolt', between: ['frame', 'side'] },
    { id: 'bracket-weld', between: ['side', 'bracket'] },
  ],
};

let txnCounter = 0;
const txn = () => transactionId(`txn-${(txnCounter += 1).toString(36)}`);

function freshState() {
  const allocator = new EntityIdAllocator();
  return new AssemblyState(ROVER, () => allocator.allocate());
}

/** Final layout as fragment groups, independent of entity ids and cut order. */
function layout(state: AssemblyState): string[] {
  return [
    `anchor:${state.anchoredFragments().sort().join('+')}`,
    ...state
      .chunks()
      .map((chunk) => [...chunk.fragments].sort().join('+'))
      .sort(),
  ];
}

describe('validateAssembly', () => {
  it('accepts the authored rover', () => {
    expect(validateAssembly(ROVER)).toEqual([]);
  });

  it('rejects cycles, unknown references, detached fragments and bad masses', () => {
    const broken: AssemblyDefinition = {
      ...ROVER,
      fragments: [...ROVER.fragments, { id: 'floating', materialId: contentId('polymer'), massKg: -1 }],
      joints: [
        { id: 'a', between: ['frame', 'cover'], requires: ['b'] },
        { id: 'b', between: ['frame', 'cover'], requires: ['a'] },
        { id: 'c', between: ['frame', 'ghost'] },
      ],
    };
    const errors = validateAssembly(broken).join('\n');
    expect(errors).toMatch(/cycle/);
    expect(errors).toMatch(/unknown fragment ghost/);
    expect(errors).toMatch(/floating is not attached/);
    expect(errors).toMatch(/invalid mass on floating/);
    expect(() => new AssemblyState(broken, () => 'ent-1' as EntityId)).toThrow(/Invalid assembly/);
  });
});

describe('AssemblyState cutting', () => {
  it('enforces authored access order', () => {
    const state = freshState();
    expect(state.availableJoints()).toEqual(['cover-left', 'cover-right', 'side-bolt', 'bracket-weld']);
    expect(state.cut('coil-mount', txn())).toEqual({ ok: false, reason: 'blocked' });
    state.cut('cover-left', txn());
    expect(state.cut('coil-mount', txn())).toEqual({ ok: false, reason: 'blocked' });
    const cover = state.cut('cover-right', txn());
    expect(cover.ok && cover.created.map((chunk) => chunk.fragments)).toEqual([['cover']]);
    expect(state.availableJoints()).toContain('coil-mount');
  });

  it('releases a sub-assembly as one chunk and splits it later into new entities', () => {
    const state = freshState();
    const side = state.cut('side-bolt', txn());
    if (!side.ok) throw new Error('cut failed');
    expect(side.created.map((chunk) => chunk.fragments)).toEqual([['side', 'bracket']]);
    const chunkId = side.created[0]?.entityId;
    const split = state.cut('bracket-weld', txn());
    if (!split.ok) throw new Error('split failed');
    expect(split.retired).toEqual([chunkId]);
    expect(split.created.map((chunk) => chunk.fragments).sort()).toEqual([['bracket'], ['side']]);
    expect(split.created.map((chunk) => chunk.entityId)).not.toContain(chunkId);
  });

  it('reaches the same final layout through alternative valid orders', () => {
    const orders = [
      ['cover-left', 'cover-right', 'coil-mount', 'side-bolt', 'bracket-weld'],
      ['bracket-weld', 'side-bolt', 'cover-right', 'cover-left', 'coil-mount'],
      ['side-bolt', 'cover-right', 'bracket-weld', 'cover-left', 'coil-mount'],
    ];
    const layouts = orders.map((order) => {
      const state = freshState();
      for (const joint of order) expect(state.cut(joint, txn()).ok).toBe(true);
      expect(state.availableJoints()).toEqual([]);
      return layout(state);
    });
    expect(layouts[1]).toEqual(layouts[0]);
    expect(layouts[2]).toEqual(layouts[0]);
    expect(layouts[0]).toEqual(['anchor:frame', 'bracket', 'coil', 'cover', 'side']);
  });

  it('cuts each joint at most once and returns the recorded result for a retried transaction', () => {
    const state = freshState();
    const id = txn();
    const first = state.cut('side-bolt', id);
    const retry = state.cut('side-bolt', id);
    expect(retry).toBe(first);
    expect(state.chunks()).toHaveLength(1);
    expect(state.cut('side-bolt', txn())).toEqual({ ok: false, reason: 'already-cut' });
    expect(state.cut('nope', txn())).toEqual({ ok: false, reason: 'unknown-joint' });
    expect(state.chunks()).toHaveLength(1);
  });

  it('never reuses entity ids and conserves every fragment', () => {
    const state = freshState();
    const seen = new Set<string>();
    for (const joint of ['side-bolt', 'bracket-weld', 'cover-left', 'cover-right', 'coil-mount']) {
      const result = state.cut(joint, txn());
      if (!result.ok) throw new Error(joint);
      for (const chunk of result.created) {
        expect(seen.has(chunk.entityId)).toBe(false);
        seen.add(chunk.entityId);
      }
    }
    const fragments = [...state.anchoredFragments(), ...state.chunks().flatMap((chunk) => chunk.fragments)].sort();
    expect(fragments).toEqual(['bracket', 'coil', 'cover', 'frame', 'side']);
  });

  it('restores from a snapshot without re-creating chunks or forgetting transactions', () => {
    const allocator = new EntityIdAllocator();
    const state = new AssemblyState(ROVER, () => allocator.allocate());
    const id = txn();
    const first = state.cut('side-bolt', id);
    const snapshot = JSON.parse(JSON.stringify(state.snapshot())) as ReturnType<AssemblyState['snapshot']>;
    const restored = new AssemblyState(ROVER, () => allocator.allocate(), snapshot);
    expect(restored.chunks()).toEqual(state.chunks());
    expect(restored.cut('side-bolt', id)).toEqual(first);
    expect(restored.cut('side-bolt', txn())).toEqual({ ok: false, reason: 'already-cut' });
  });
});
