import { afterEach, describe, expect, it } from 'vitest';
import { AssemblyState } from '../../src/domain/assembly';
import { EntityIdAllocator, transactionId, type EntityId } from '../../src/domain/ids';
import { AssemblyBody } from '../../src/simulation/handling/assemblyBody';
import { MediumPropSet } from '../../src/simulation/handling/mediumProps';
import type { PhysicsWorldPort, Vec3 } from '../../src/simulation/physics/physicsPort';
import { createRapierWorld } from '../../src/simulation/physics/rapierWorld';
import { TEST_YARD_ROVER, TEST_YARD_ROVER_LAYOUT } from '../../src/simulation/yard/testYard';

const worlds: PhysicsWorldPort[] = [];
afterEach(() => {
  for (const world of worlds.splice(0)) world.dispose();
});

let counter = 0;
const txn = () => transactionId(`txn-t${(counter += 1).toString(36)}`);

async function setup() {
  const world = await createRapierWorld();
  worlds.push(world);
  world.addBox({ kind: 'fixed', position: { x: -6, y: -0.5, z: 4 }, halfExtents: { x: 10, y: 0.5, z: 10 } });
  const allocator = new EntityIdAllocator();
  const props = new MediumPropSet(world, []);
  const rover = new AssemblyBody(
    world,
    props,
    new AssemblyState(TEST_YARD_ROVER, () => allocator.allocate()),
    TEST_YARD_ROVER_LAYOUT,
  );
  return { world, props, rover };
}

function aimAt(target: Vec3, from: Vec3) {
  const d = { x: target.x - from.x, y: target.y - from.y, z: target.z - from.z };
  const length = Math.hypot(d.x, d.y, d.z);
  return { origin: from, direction: { x: d.x / length, y: d.y / length, z: d.z / length } };
}

describe('AssemblyBody', () => {
  it('starts as fixed bodies with no loose props', async () => {
    const { world, props } = await setup();
    expect(props.all()).toEqual([]);
    expect(world.bodyCount()).toBe(1 + TEST_YARD_ROVER.fragments.length);
  });

  it('turns a released sub-assembly into one prop at its authored place, then splits it', async () => {
    const { world, props, rover } = await setup();
    const side = rover.cut('side-bolt', txn());
    if (!side.ok) throw new Error('cut failed');
    const chunkId = side.created[0]?.entityId as EntityId;
    const chunk = props.get(chunkId);
    expect(chunk?.displayName).toBe('Side panel + Bracket');
    expect(chunk?.massKg).toBe(12);
    const at = world.bodyPosition(chunk?.body ?? (0 as never));
    // Bounds of side (z 4.60–4.70) and bracket (z 4.70–4.80).
    expect(at.z).toBeCloseTo(4.7, 2);

    for (let i = 0; i < 120; i += 1) world.step();
    const split = rover.cut('bracket-weld', txn());
    if (!split.ok) throw new Error('split failed');
    expect(props.get(chunkId)).toBeUndefined();
    const names = split.created.map((created) => props.get(created.entityId)?.displayName).sort();
    expect(names).toEqual(['Bracket', 'Side panel']);
  });

  it('does not spawn duplicates when a cut transaction is retried', async () => {
    const { props, rover } = await setup();
    const id = txn();
    rover.cut('side-bolt', id);
    rover.cut('side-bolt', id);
    expect(props.all()).toHaveLength(1);
  });

  it('keeps fragment conservation through a full dismantle', async () => {
    const { world, props, rover } = await setup();
    for (const joint of ['cover-left', 'cover-right', 'coil-mount', 'side-bolt', 'bracket-weld']) {
      expect(rover.cut(joint, txn()).ok).toBe(true);
      for (let i = 0; i < 30; i += 1) world.step();
    }
    expect(
      props
        .all()
        .map((prop) => prop.displayName)
        .sort(),
    ).toEqual(['Bracket', 'Copper coil', 'Cover panel', 'Side panel']);
    expect(rover.state.anchoredFragments()).toEqual(['frame']);
  });

  it('picks joints in reach and reports blocked ones', async () => {
    const { rover } = await setup();
    const eye = { x: -6.3, y: 1.4, z: 6 };
    const coil = rover.pickJoint(aimAt(TEST_YARD_ROVER_LAYOUT.joints['coil-mount'] as Vec3, eye));
    expect(coil).toEqual({ jointId: 'coil-mount', available: false });
    const bolt = rover.pickJoint(aimAt(TEST_YARD_ROVER_LAYOUT.joints['side-bolt'] as Vec3, eye));
    expect(bolt).toEqual({ jointId: 'side-bolt', available: true });
    expect(
      rover.pickJoint(aimAt(TEST_YARD_ROVER_LAYOUT.joints['side-bolt'] as Vec3, { x: -6.7, y: 1.4, z: 12 })),
    ).toBeNull();
  });
});
