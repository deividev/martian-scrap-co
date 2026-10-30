import { afterEach, describe, expect, it } from 'vitest';
import { FIRST_PASS_CONTENT } from '../../src/content/firstPass';
import { parseContentPack, type ContentPack } from '../../src/content/schema';
import { EntityIdAllocator, contentId, type EntityId } from '../../src/domain/ids';
import { PortableContainer } from '../../src/domain/container';
import { MagneticCollector } from '../../src/simulation/collection/magneticCollector';
import { TARGETING, pickTarget, type AimRay } from '../../src/simulation/collection/targeting';
import type { PhysicsWorldPort, Vec3 } from '../../src/simulation/physics/physicsPort';
import { createRapierWorld } from '../../src/simulation/physics/rapierWorld';
import { ScrapField } from '../../src/simulation/scrap/scrapField';

const MATERIALS = ['ferrous', 'aluminum', 'copper', 'polymer', 'heliofoil', 'regolith-ceramic'] as const;
const worlds: PhysicsWorldPort[] = [];
afterEach(() => {
  for (const world of worlds.splice(0)) world.dispose();
});

function pack(): ContentPack {
  const result = parseContentPack(FIRST_PASS_CONTENT);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.pack;
}

interface Placement {
  readonly material: string;
  readonly position: Vec3;
}

async function setup(
  placements: readonly Placement[],
  walls: readonly { position: Vec3; half: Vec3 }[] = [],
  capacity = 20,
) {
  const world = await createRapierWorld();
  worlds.push(world);
  world.addBox({ kind: 'fixed', position: { x: 0, y: -0.5, z: 0 }, halfExtents: { x: 20, y: 0.5, z: 20 } });
  for (const wall of walls) world.addBox({ kind: 'fixed', position: wall.position, halfExtents: wall.half });
  const allocator = new EntityIdAllocator();
  const ids: EntityId[] = [];
  const field = new ScrapField(world, [
    {
      id: 'test-pile',
      decorativeInstances: 0,
      pieces: placements.map((placement) => {
        const id = allocator.allocate();
        ids.push(id);
        return {
          id,
          materialId: contentId(placement.material),
          position: placement.position,
          halfExtents: { x: 0.12, y: 0.12, z: 0.12 },
          massKg: 1,
        };
      }),
    },
  ]);
  field.activateCluster('test-pile');
  for (let i = 0; i < 90; i += 1) world.step();
  const container = new PortableContainer(capacity);
  const sink = {
    remaining: () => container.capacity - container.count,
    canAccept: (id: EntityId) => container.canAccept(id),
    accept: (item: Parameters<PortableContainer['add']>[0]) => void container.add(item),
  };
  return { world, field, ids, container, collector: new MagneticCollector(pack(), field, world, sink) };
}

const EYE: Vec3 = { x: 0, y: 1.4, z: 0 };
function aimAt(target: Vec3, from: Vec3 = EYE): AimRay {
  const d = { x: target.x - from.x, y: target.y - from.y, z: target.z - from.z };
  const length = Math.hypot(d.x, d.y, d.z);
  return { origin: from, direction: { x: d.x / length, y: d.y / length, z: d.z / length } };
}

describe('magnetic collector compatibility', () => {
  it.each(MATERIALS)('%s: only ferrous is attracted; others stay intact with a reason', async (material) => {
    const { world, field, ids, collector } = await setup([{ material, position: { x: 0, y: 0.12, z: -2 } }]);
    const pick = pickTarget(aimAt({ x: 0, y: 0.12, z: -2 }), field.activeTargets(), world);
    const feedback = collector.evaluate(pick);
    const id = ids[0];
    if (!id) throw new Error('no piece');
    if (material === 'ferrous') {
      expect(feedback.state).toBe('compatible');
      expect(collector.tryStartPull(feedback)).toBe(true);
    } else {
      expect(feedback.state).toBe('incompatible');
      if (feedback.state !== 'incompatible') return;
      expect(feedback.reason).toBe('not-magnetic');
      expect(feedback.collectableBy).toEqual(['hands', 'grabber']);
      expect(collector.tryStartPull(feedback)).toBe(false);
      for (let i = 0; i < 60; i += 1) {
        collector.fixedUpdate(EYE);
        world.step();
      }
      expect(field.piece(id)?.state).toBe('active');
      expect(field.bodyOf(id)).toBeDefined();
    }
  });
});

describe('targeting', () => {
  it('does not target through a wall', async () => {
    const piece = { x: 0, y: 0.12, z: -3 };
    const { world, field } = await setup(
      [{ material: 'ferrous', position: piece }],
      [{ position: { x: 0, y: 1, z: -1.5 }, half: { x: 2, y: 1, z: 0.1 } }],
    );
    expect(pickTarget(aimAt(piece), field.activeTargets(), world)).toBeNull();
  });

  it('ignores pieces beyond reach or outside the aim cone', async () => {
    const far = { x: 0, y: 0.12, z: -(TARGETING.reachMeters + 1) };
    const side = { x: 2.5, y: 0.12, z: -1 };
    const { world, field } = await setup([
      { material: 'ferrous', position: far },
      { material: 'ferrous', position: side },
    ]);
    expect(pickTarget(aimAt(far), field.activeTargets(), world)).toBeNull();
    expect(pickTarget(aimAt({ x: 0, y: 0.12, z: -2 }), field.activeTargets(), world)).toBeNull();
  });

  it('picks the competing target closest to the aim, then switches when the aim moves', async () => {
    const left = { x: -0.3, y: 0.12, z: -2 };
    const right = { x: 0.3, y: 0.12, z: -2 };
    const { world, field, ids } = await setup([
      { material: 'ferrous', position: left },
      { material: 'aluminum', position: right },
    ]);
    expect(pickTarget(aimAt(left), field.activeTargets(), world)?.candidate.id).toBe(ids[0]);
    expect(pickTarget(aimAt(right), field.activeTargets(), world)?.candidate.id).toBe(ids[1]);
  });
});

describe('pull and ownership transfer', () => {
  it('pulls a ferrous piece in and collects it exactly once', async () => {
    const { world, field, ids, collector } = await setup([
      { material: 'ferrous', position: { x: 0, y: 0.12, z: -2.5 } },
    ]);
    const feedback = collector.evaluate(pickTarget(aimAt({ x: 0, y: 0.12, z: -2.5 }), field.activeTargets(), world));
    expect(collector.tryStartPull(feedback)).toBe(true);
    expect(collector.tryStartPull(feedback)).toBe(false);
    const collected: EntityId[] = [];
    for (let i = 0; i < 120; i += 1) {
      for (const outcome of collector.fixedUpdate(EYE)) {
        if (outcome.kind === 'collected') collected.push(outcome.id);
      }
      world.step();
    }
    expect(collected).toEqual([ids[0]]);
    expect(field.piece(ids[0] as EntityId)?.state).toBe('removed');
    expect(collector.pulling).toEqual([]);
    // Retrying on the removed piece does nothing.
    expect(collector.evaluate(null)).toEqual({ state: 'none' });
  });

  it('confirms nothing at button press: the piece is still active until it arrives', async () => {
    const { world, field, ids, collector } = await setup([{ material: 'ferrous', position: { x: 0, y: 0.12, z: -3 } }]);
    collector.tryStartPull(
      collector.evaluate(pickTarget(aimAt({ x: 0, y: 0.12, z: -3 }), field.activeTargets(), world)),
    );
    collector.fixedUpdate(EYE);
    expect(field.piece(ids[0] as EntityId)?.state).toBe('active');
  });

  it('drops the pull and leaves the piece intact if it is carried out of range', async () => {
    const { world, field, ids, collector } = await setup([{ material: 'ferrous', position: { x: 0, y: 0.12, z: -2 } }]);
    collector.tryStartPull(
      collector.evaluate(pickTarget(aimAt({ x: 0, y: 0.12, z: -2 }), field.activeTargets(), world)),
    );
    expect(collector.fixedUpdate({ x: 0, y: 1.4, z: 30 })).toEqual([
      { kind: 'dropped', id: ids[0], reason: 'out-of-range' },
    ]);
    expect(collector.pulling).toEqual([]);
    expect(field.piece(ids[0] as EntityId)?.state).toBe('active');
  });
});

describe('collector and portable container', () => {
  const near = { x: 0, y: 0.12, z: -2 };

  it('reports a full container as blocked and does not start a pull', async () => {
    const { world, field, ids, container, collector } = await setup([{ material: 'ferrous', position: near }], [], 1);
    container.add({ id: 'ent-zz' as EntityId, materialId: contentId('ferrous'), massKg: 1 });
    const feedback = collector.evaluate(pickTarget(aimAt(near), field.activeTargets(), world));
    expect(feedback.state).toBe('blocked');
    if (feedback.state === 'blocked') expect(feedback.reason).toBe('container-full');
    expect(collector.tryStartPull(feedback)).toBe(false);
    expect(field.piece(ids[0] as EntityId)?.state).toBe('active');
  });

  it('leaves the piece in the world if the container fills during the pull', async () => {
    const { world, field, ids, container, collector } = await setup([{ material: 'ferrous', position: near }], [], 1);
    collector.tryStartPull(collector.evaluate(pickTarget(aimAt(near), field.activeTargets(), world)));
    container.add({ id: 'ent-zz' as EntityId, materialId: contentId('ferrous'), massKg: 1 });
    const outcomes = [];
    for (let i = 0; i < 120; i += 1) {
      outcomes.push(...collector.fixedUpdate(EYE));
      world.step();
    }
    expect(outcomes).toEqual([{ kind: 'dropped', id: ids[0], reason: 'sink-full' }]);
    expect(field.piece(ids[0] as EntityId)?.state).toBe('active');
    expect(container.count).toBe(1);
    expect(container.has(ids[0] as EntityId)).toBe(false);
  });

  it('transfers each collected piece into the container exactly once', async () => {
    const pieces = [
      { material: 'ferrous', position: { x: -0.2, y: 0.12, z: -2 } },
      { material: 'ferrous', position: { x: 0.2, y: 0.12, z: -2 } },
    ];
    const { world, field, ids, container, collector } = await setup(pieces);
    for (const piece of pieces) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        collector.tryStartPull(collector.evaluate(pickTarget(aimAt(piece.position), field.activeTargets(), world)));
      }
      for (let i = 0; i < 120; i += 1) {
        collector.fixedUpdate(EYE);
        world.step();
      }
    }
    expect(container.count).toBe(2);
    expect(container.batches()).toEqual([{ materialId: 'ferrous', count: 2, massKg: 2 }]);
    for (const id of ids) expect(field.piece(id)?.state).toBe('removed');
    expect(field.metrics().removed).toBe(container.count);
  });
});

describe('vacuum suction', () => {
  const pile = [
    { material: 'ferrous', position: { x: -0.4, y: 0.12, z: -2.2 } },
    { material: 'ferrous', position: { x: 0, y: 0.12, z: -2.4 } },
    { material: 'ferrous', position: { x: 0.4, y: 0.12, z: -2.2 } },
    { material: 'copper', position: { x: 0.2, y: 0.12, z: -2 } },
    { material: 'ferrous', position: { x: 0, y: 0.12, z: -9 } },
  ];

  it('pulls every compatible piece in the cone at once and leaves the rest', async () => {
    const { world, field, ids, container, collector } = await setup(pile);
    const aim = aimAt({ x: 0, y: 0.12, z: -2.3 });
    expect(collector.suck(aim)).toBe(3);
    for (let i = 0; i < 120; i += 1) {
      collector.suck(aim);
      collector.fixedUpdate(EYE);
      world.step();
    }
    expect(container.count).toBe(3);
    expect(field.piece(ids[3] as EntityId)?.state).toBe('active'); // copper is not magnetic
    expect(field.piece(ids[4] as EntityId)?.state).toBe('active'); // out of reach
  });

  it('never pulls more than the container can still take', async () => {
    const { world, container, collector } = await setup(pile, [], 2);
    const aim = aimAt({ x: 0, y: 0.12, z: -2.3 });
    expect(collector.suck(aim)).toBe(2);
    for (let i = 0; i < 120; i += 1) {
      collector.suck(aim);
      collector.fixedUpdate(EYE);
      world.step();
    }
    expect(container.count).toBe(2);
    expect(collector.pulling).toEqual([]);
  });

  it('stops pulling when the button is released', async () => {
    const { collector } = await setup(pile);
    collector.suck(aimAt({ x: 0, y: 0.12, z: -2.3 }));
    collector.cancelPull();
    expect(collector.pulling).toEqual([]);
  });
});
