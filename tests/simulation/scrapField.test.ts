import { afterEach, describe, expect, it } from 'vitest';
import { EntityIdAllocator, contentId, type EntityId } from '../../src/domain/ids';
import type { PhysicsWorldPort } from '../../src/simulation/physics/physicsPort';
import { createRapierWorld } from '../../src/simulation/physics/rapierWorld';
import { ScrapField, type ScrapClusterSpec } from '../../src/simulation/scrap/scrapField';

const worlds: PhysicsWorldPort[] = [];
afterEach(() => {
  for (const world of worlds.splice(0)) world.dispose();
});

async function physics(): Promise<PhysicsWorldPort> {
  const world = await createRapierWorld();
  world.addBox({ kind: 'fixed', position: { x: 0, y: -0.5, z: 0 }, halfExtents: { x: 20, y: 0.5, z: 20 } });
  worlds.push(world);
  return world;
}

function clusters(): ScrapClusterSpec[] {
  const ids = new EntityIdAllocator();
  const pile = (clusterId: string, originX: number, count: number): ScrapClusterSpec => ({
    id: clusterId,
    decorativeInstances: 200,
    pieces: Array.from({ length: count }, (_, index) => ({
      id: ids.allocate(),
      materialId: contentId(index % 2 === 0 ? 'ferrous' : 'aluminum'),
      position: { x: originX + (index % 3) * 0.4, y: 0.3 + Math.floor(index / 3) * 0.35, z: 0 },
      halfExtents: { x: 0.15, y: 0.15, z: 0.15 },
      massKg: 2,
    })),
  });
  return [pile('starter-pile', 0, 9), pile('berm-pile', 6, 6)];
}

function allIds(field: ScrapField, specs: readonly ScrapClusterSpec[]): EntityId[] {
  return specs.flatMap((cluster) => cluster.pieces.map((piece) => piece.id)).filter((id) => field.piece(id));
}

describe('ScrapField', () => {
  it('starts dormant with no physics bodies and reports decorative mass separately', async () => {
    const field = new ScrapField(await physics(), clusters());
    expect(field.metrics()).toMatchObject({
      dormant: 15,
      active: 0,
      removed: 0,
      decorativeInstances: 400,
      physicsBodies: 0,
    });
  });

  it('activation creates bodies only for that cluster and awake bodies are observable', async () => {
    const world = await physics();
    const field = new ScrapField(world, clusters());
    expect(field.activateCluster('starter-pile')).toBe(9);
    expect(field.metrics()).toMatchObject({ dormant: 6, active: 9, physicsBodies: 9 });
    // Rapier refreshes its active set during a step.
    world.step();
    expect(field.metrics().awakeBodies).toBe(9);
    for (let i = 0; i < 600; i += 1) world.step();
    expect(field.metrics().awakeBodies).toBe(0);
  });

  it('keeps identity and conserves pieces across repeated activate/deactivate cycles', async () => {
    const world = await physics();
    const specs = clusters();
    const field = new ScrapField(world, specs);
    const ids = allIds(field, specs);
    const [first, second] = ids;
    if (!first || !second) throw new Error('fixture too small');
    field.activateCluster('starter-pile');
    expect(field.removePiece(first)).toBe(true);

    for (let cycle = 0; cycle < 50; cycle += 1) {
      field.activateCluster('starter-pile');
      for (let i = 0; i < 5; i += 1) world.step();
      field.deactivateCluster('starter-pile');
      const metrics = field.metrics();
      expect(metrics.dormant + metrics.active + metrics.removed).toBe(15);
      expect(metrics.removed).toBe(1);
      expect(metrics.physicsBodies).toBe(0);
    }
    expect(world.bodyCount()).toBe(1); // only the ground remains
    expect(allIds(field, specs)).toEqual(ids);
    expect(field.piece(first)?.state).toBe('removed');
    expect(field.piece(second)?.state).toBe('dormant');
  });

  it('never refills a removed piece or a cleared cluster on reactivation', async () => {
    const field = new ScrapField(await physics(), clusters());
    field.activateCluster('berm-pile');
    const bermIds = clusters()[1]?.pieces.map((piece) => piece.id) ?? [];
    for (const id of bermIds) expect(field.removePiece(id)).toBe(true);
    for (const id of bermIds) expect(field.removePiece(id)).toBe(false);
    expect(field.activateCluster('berm-pile')).toBe(0);
    expect(field.metrics()).toMatchObject({ removed: 6, decorativeInstances: 200 });
  });

  it('preserves settled poses through deactivation and a save/restore round trip', async () => {
    const world = await physics();
    const specs = clusters();
    const field = new ScrapField(world, specs);
    field.activateCluster('starter-pile');
    for (let i = 0; i < 600; i += 1) world.step();
    const [removed] = allIds(field, specs);
    if (!removed) throw new Error('fixture too small');
    field.removePiece(removed);
    const snapshot = field.snapshot();
    field.deactivateCluster('starter-pile');

    const restored = new ScrapField(await physics(), JSON.parse(JSON.stringify(snapshot)) as typeof snapshot);
    expect(restored.metrics()).toMatchObject({ dormant: 14, active: 0, removed: 1, physicsBodies: 0 });
    for (const id of allIds(restored, specs)) {
      expect(restored.piece(id)?.position).toEqual(field.piece(id)?.position);
    }
    expect(restored.piece(removed)?.state).toBe('removed');
    expect(restored.activateCluster('starter-pile')).toBe(8);
  });

  it('rejects duplicate ids, unknown clusters and invalid decorative counts', async () => {
    const world = await physics();
    const specs = clusters();
    const duplicate = { ...specs[0], id: 'copy' } as ScrapClusterSpec;
    expect(() => new ScrapField(world, [...specs, duplicate])).toThrow(/Duplicate scrap piece/);
    expect(() => new ScrapField(world, [{ ...specs[0], decorativeInstances: -1 } as ScrapClusterSpec])).toThrow(
      RangeError,
    );
    const field = new ScrapField(world, specs);
    expect(() => field.activateCluster('missing')).toThrow(RangeError);
  });
});
