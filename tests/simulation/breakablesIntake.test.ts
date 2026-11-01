import { afterEach, describe, expect, it } from 'vitest';
import { PortableContainer } from '../../src/domain/container';
import { EntityIdAllocator, contentId, type EntityId } from '../../src/domain/ids';
import { BaseIntake } from '../../src/domain/intake';
import { Breakables, cutYields, type BreakableSpec } from '../../src/simulation/handling/breakables';
import { ClaimRegistry } from '../../src/simulation/handling/claims';
import { MediumPropSet } from '../../src/simulation/handling/mediumProps';
import type { PhysicsWorldPort } from '../../src/simulation/physics/physicsPort';
import { createRapierWorld } from '../../src/simulation/physics/rapierWorld';
import { ScrapField } from '../../src/simulation/scrap/scrapField';

const worlds: PhysicsWorldPort[] = [];
afterEach(() => {
  for (const world of worlds.splice(0)) world.dispose();
});

async function setup() {
  const world = await createRapierWorld();
  worlds.push(world);
  world.addBox({ kind: 'fixed', position: { x: 0, y: -0.5, z: 0 }, halfExtents: { x: 20, y: 0.5, z: 20 } });
  const allocator = new EntityIdAllocator();
  const field = new ScrapField(world, []);
  const props = new MediumPropSet(world, []);
  const claims = new ClaimRegistry();
  const housing: BreakableSpec = {
    id: allocator.allocate(),
    materialId: contentId('polymer'),
    displayName: 'Old machine housing',
    position: { x: 0, y: 0.4, z: -2 },
    halfExtents: { x: 0.35, y: 0.35, z: 0.35 },
    massKg: 14,
    yields: [
      { materialId: contentId('ferrous'), count: 4 },
      { materialId: contentId('copper'), count: 2 },
      { materialId: contentId('polymer'), count: 3 },
    ],
  };
  const breakables = new Breakables(props, field, world, claims, () => allocator.allocate(), [housing]);
  for (let i = 0; i < 60; i += 1) world.step();
  return { world, field, props, claims, breakables, housing };
}

describe('Breakables', () => {
  it('turns a medium object into small pieces of several materials, once', async () => {
    const { world, field, props, breakables, housing } = await setup();
    expect(breakables.isBreakable(housing.id)).toBe(true);
    const result = breakables.break(housing.id);
    if (!result.ok) throw new Error(result.reason);
    expect(result.created).toHaveLength(9);
    expect(props.get(housing.id)).toBeUndefined();
    const materials = result.created.map((id) => field.piece(id)?.materialId).sort();
    expect(materials).toEqual([
      'copper',
      'copper',
      'ferrous',
      'ferrous',
      'ferrous',
      'ferrous',
      'polymer',
      'polymer',
      'polymer',
    ]);
    for (const id of result.created) expect(field.piece(id)?.state).toBe('active');
    expect(breakables.break(housing.id)).toEqual({ ok: false, reason: 'already-broken' });
    for (let i = 0; i < 240; i += 1) world.step();
    for (const id of result.created) {
      const body = field.bodyOf(id);
      expect(world.bodyPosition(body ?? (0 as never)).y).toBeGreaterThan(0);
    }
  });

  it('refuses to break an object someone is holding', async () => {
    const { claims, breakables, housing } = await setup();
    claims.claim(housing.id, 'player-1');
    expect(breakables.break(housing.id)).toEqual({ ok: false, reason: 'claimed' });
  });

  it('rejects invalid yields', async () => {
    const { world, field, props, claims } = await setup();
    const bad = {
      id: 'ent-zz' as EntityId,
      materialId: contentId('polymer'),
      displayName: 'bad',
      position: { x: 3, y: 0.4, z: 0 },
      halfExtents: { x: 0.3, y: 0.3, z: 0.3 },
      massKg: 5,
      yields: [{ materialId: contentId('ferrous'), count: 0 }],
    };
    expect(() => new Breakables(props, field, world, claims, () => 'ent-zy' as EntityId, [bad])).toThrow(RangeError);
  });
});

describe('cutting large parts into small pieces', () => {
  it('yields roughly one piece per 3 kg of each material, 2 to 12 per part', () => {
    expect(
      cutYields([
        { materialId: contentId('ferrous'), massKg: 80 },
        { materialId: contentId('aluminum'), massKg: 10 },
        { materialId: contentId('ferrous'), massKg: 3 },
      ]),
    ).toEqual([
      { materialId: 'ferrous', count: 14 },
      { materialId: 'aluminum', count: 3 },
    ]);
  });

  it('makes an existing prop cuttable into small pieces of its own material', async () => {
    const { field, props, breakables, world } = await setup();
    const chunk = props.add({
      id: 'ent-chunk' as EntityId,
      materialId: contentId('aluminum'),
      displayName: 'Cover panel',
      position: { x: 2, y: 0.3, z: 0 },
      halfExtents: { x: 0.5, y: 0.05, z: 0.4 },
      massKg: 10,
    });
    breakables.registerExisting(chunk.id, cutYields([{ materialId: contentId('aluminum'), massKg: 10 }]));
    expect(breakables.method(chunk.id)).toBe('cut');
    const result = breakables.break(chunk.id);
    if (!result.ok) throw new Error(result.reason);
    expect(result.created.map((id) => field.piece(id)?.materialId)).toEqual(['aluminum', 'aluminum', 'aluminum']);
    for (let i = 0; i < 120; i += 1) world.step();
    expect(props.get(chunk.id)).toBeUndefined();
  });

  it('forgets a chunk that another cut retired', async () => {
    const { props, breakables } = await setup();
    const chunk = props.add({
      id: 'ent-chunk2' as EntityId,
      materialId: contentId('ferrous'),
      displayName: 'Bracket',
      position: { x: -2, y: 0.3, z: 0 },
      halfExtents: { x: 0.1, y: 0.1, z: 0.1 },
      massKg: 3,
    });
    breakables.registerExisting(chunk.id, [{ materialId: contentId('ferrous'), count: 2 }]);
    breakables.forget(chunk.id);
    expect(breakables.isBreakable(chunk.id)).toBe(false);
    expect(breakables.break(chunk.id)).toEqual({ ok: false, reason: 'unknown' });
  });
});

describe('BaseIntake', () => {
  it('receives a whole container once and tallies per material', () => {
    const allocator = new EntityIdAllocator();
    const container = new PortableContainer(10);
    for (const material of ['ferrous', 'ferrous', 'copper']) {
      container.add({ id: allocator.allocate(), materialId: contentId(material), massKg: 2 });
    }
    const intake = new BaseIntake();
    const items = container.unloadAll();
    expect(intake.receive(items)).toEqual({ accepted: 3, duplicates: 0, kept: [] });
    expect(intake.receive(items)).toEqual({ accepted: 0, duplicates: 3, kept: [] });
    expect(container.count).toBe(0);
    expect(intake.batches()).toEqual([
      { materialId: 'ferrous', count: 2, massKg: 4 },
      { materialId: 'copper', count: 1, massKg: 2 },
    ]);
  });
});
