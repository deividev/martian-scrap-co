import { describe, expect, it } from 'vitest';
import { Compactor } from '../../src/domain/compactor';
import { contentId, entityId, EntityIdAllocator, type EntityId } from '../../src/domain/ids';
import { BaseIntake } from '../../src/domain/intake';
import type { ScrapClusterSpec } from '../../src/simulation/scrap/scrapField';
import { ScrapField } from '../../src/simulation/scrap/scrapField';
import { createRapierWorld } from '../../src/simulation/physics/rapierWorld';
import { ScrapMountain, createScrapMountainLayout } from '../../src/simulation/yard/scrapMountain';
import { applyScrapDelta, parseYardSave, poseOf, scrapDelta, type YardSave } from '../../src/simulation/yard/yardSave';

const IRON = contentId('ferrous');
const errorOf = (result: ReturnType<typeof parseYardSave>): string => (result.ok ? '' : result.error);
const id = (n: number): EntityId => entityId(`ent-${n.toString(36)}`);

function authored(): ScrapClusterSpec[] {
  const piece = (n: number, x: number) => ({
    id: id(n),
    materialId: IRON,
    position: { x, y: 0.1, z: 0 },
    halfExtents: { x: 0.1, y: 0.06, z: 0.1 },
    massKg: 1,
  });
  return [
    { id: 'a', pieces: [piece(1, 0), piece(2, 1), piece(3, 2)], decorativeInstances: 5 },
    { id: 'b', pieces: [piece(4, 10)], decorativeInstances: 3 },
  ];
}

function baseSave(overrides: Partial<YardSave> = {}): YardSave {
  return {
    layout: { startSequence: 10, mountainPieces: 0, smallPieces: 4 },
    nextEntitySequence: 20,
    transactions: { sale: 1, buy: 0, cut: 0 },
    credits: 40,
    upgrades: { collectorTier: 1, cutterTier: 0 },
    campaign: { stationMarkerRevealed: false },
    container: [],
    bins: [],
    compactorBale: null,
    bales: [],
    props: [],
    cart: { pose: [2, 0.4, 5, 0, 0, 0, 1], loads: [] },
    mountain: { released: [], removed: [] },
    scrap: { removed: [], moved: [], clusters: [] },
    rover: {
      snapshot: { assemblyId: 'rover', cutJoints: [], chunks: [], retiredEntities: [], results: [] },
      cutAnchors: [],
    },
    ...overrides,
  };
}

describe('scrap delta', () => {
  it('records consumed, moved and runtime pieces and rebuilds the same field from them', async () => {
    const world = await createRapierWorld();
    const field = new ScrapField(world, authored());
    field.removePiece(id(1));
    field.removePiece(id(4));
    field.addCluster({
      id: 'broken-x',
      decorativeInstances: 0,
      pieces: [
        {
          id: id(9),
          materialId: IRON,
          position: { x: 5, y: 0.2, z: 1 },
          halfExtents: { x: 0.1, y: 0.1, z: 0.1 },
          massKg: 2,
        },
      ],
    });
    const before = field.snapshot();
    const moved = before.clusters[0]?.pieces[1];
    const shifted = {
      clusters: before.clusters.map((cluster) => ({
        ...cluster,
        pieces: cluster.pieces.map((piece) =>
          piece.id === moved?.id ? { ...piece, position: { x: 1.4, y: 0.1, z: 0.3 } } : piece,
        ),
      })),
    };
    const delta = scrapDelta(authored(), shifted);
    expect(delta.removed).toEqual([id(1), id(4)]);
    expect(delta.moved).toEqual([{ id: id(2), pose: poseOf({ x: 1.4, y: 0.1, z: 0.3 }, { x: 0, y: 0, z: 0, w: 1 }) }]);
    expect(delta.clusters.map((cluster) => cluster.id)).toEqual(['broken-x']);

    const rebuilt = new ScrapField(world, { clusters: applyScrapDelta(authored(), delta) });
    expect(rebuilt.piece(id(1))?.state).toBe('removed');
    expect(rebuilt.piece(id(2))?.position).toEqual({ x: 1.4, y: 0.1, z: 0.3 });
    expect(rebuilt.piece(id(9))?.massKg).toBe(2);
    // A fully cleared cluster keeps no decorative mass, so the cleared area stays cleared.
    expect(applyScrapDelta(authored(), delta).find((cluster) => cluster.id === 'b')?.decorativeInstances).toBe(0);
    expect(scrapDelta(authored(), rebuilt.snapshot())).toEqual(delta);
    world.dispose();
  });

  it('refuses a delta that names pieces the layout does not have', () => {
    expect(() => applyScrapDelta(authored(), { removed: [id(77)], moved: [], clusters: [] })).toThrow(/unknown/);
  });
});

describe('parseYardSave', () => {
  it('accepts a consistent save', () => {
    const save = baseSave({
      scrap: { removed: [id(1), id(2), id(3)], moved: [], clusters: [] },
      container: [{ id: id(1), materialId: IRON, massKg: 1 }],
      bins: [{ id: id(2), materialId: IRON, massKg: 1 }],
      bales: [{ id: id(11), materialId: IRON, pieceIds: [id(3)], massKg: 1 }],
      props: [{ id: id(11), pose: [0, 0.3, 0, 0, 0, 0, 1] }],
    });
    expect(parseYardSave(JSON.parse(JSON.stringify(save)))).toEqual({ ok: true, save });
  });

  it('never loads a piece twice or a held piece that is still loose in the field', () => {
    const twice = baseSave({
      scrap: { removed: [id(1)], moved: [], clusters: [] },
      container: [{ id: id(1), materialId: IRON, massKg: 1 }],
      bins: [{ id: id(1), materialId: IRON, massKg: 1 }],
    });
    expect(errorOf(parseYardSave(twice))).toContain('twice');
    const loose = baseSave({ container: [{ id: id(1), materialId: IRON, massKg: 1 }] });
    expect(errorOf(parseYardSave(loose))).toContain('loose');
    const ghost = baseSave({ bales: [{ id: id(11), materialId: IRON, pieceIds: [id(3)], massKg: 1 }] });
    expect(parseYardSave(ghost).ok).toBe(false);
  });

  it('rejects malformed payloads instead of misapplying them', () => {
    expect(parseYardSave({}).ok).toBe(false);
    expect(parseYardSave({ ...baseSave(), credits: -5 }).ok).toBe(false);
    expect(parseYardSave({ ...baseSave(), extra: true }).ok).toBe(false);
    expect(parseYardSave({ ...baseSave(), cart: { pose: [0, 0, 0], loads: [] } }).ok).toBe(false);
  });
});

describe('restore hooks', () => {
  it('the id allocator continues a saved world and never goes back', () => {
    const allocator = new EntityIdAllocator();
    allocator.allocate();
    allocator.advanceTo(40);
    expect(allocator.allocate()).toBe(`ent-${(40).toString(36)}`);
    expect(() => allocator.advanceTo(5)).toThrow(RangeError);
  });

  it('an unpressed compactor load is saved as bin pieces and a finished bale resumes inside', () => {
    const intake = new BaseIntake();
    const allocator = new EntityIdAllocator(100);
    const compactor = new Compactor(intake, [IRON], () => allocator.allocate());
    intake.receive(Array.from({ length: 12 }, (_, n) => ({ id: id(n + 1), materialId: IRON, massKg: 1 })));
    compactor.update(0.1, true);
    expect(compactor.state.kind).toBe('loading');
    const saved = [...compactor.reserved(), ...intake.items()];
    expect(saved.map((item) => item.id)).toEqual(Array.from({ length: 12 }, (_, n) => id(n + 1)));

    const restored = new BaseIntake();
    restored.receive(saved);
    expect(restored.binCount(IRON)).toBe(12);
    const again = new Compactor(restored, [IRON], () => allocator.allocate());
    const bale = { id: id(500), materialId: IRON, pieceIds: [id(1)], massKg: 1 };
    expect(again.resumeBlocked(bale)).toBe(true);
    expect(again.update(0.1, false)).toBeNull();
    expect(again.update(0.1, true)).toEqual(bale);
  });

  it('the mountain restores released and removed parts without cascading', async () => {
    const world = await createRapierWorld();
    const layout = createScrapMountainLayout(new EntityIdAllocator());
    const mountain = new ScrapMountain(world, layout.pieces);
    const exposed = layout.pieces.find((piece) => mountain.exposed(piece.id) && piece.size === 'medium');
    const left = exposed ? mountain.release(exposed.id) : null;
    expect(left).not.toBeNull();
    const changed = mountain.changed();

    const rebuilt = new ScrapMountain(world, layout.pieces);
    const version = rebuilt.version;
    rebuilt.restore(changed);
    expect(rebuilt.changed()).toEqual(changed);
    expect(rebuilt.version).toBeGreaterThan(version);
    expect(() => rebuilt.restore(changed)).toThrow(/unknown mountain part/);
    world.dispose();
  });
});
