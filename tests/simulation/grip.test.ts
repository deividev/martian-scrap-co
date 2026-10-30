import { afterEach, describe, expect, it } from 'vitest';
import { EntityIdAllocator, contentId, type EntityId } from '../../src/domain/ids';
import { pickTarget } from '../../src/simulation/collection/targeting';
import { ClaimRegistry } from '../../src/simulation/handling/claims';
import { GRIP_TUNING, GripController } from '../../src/simulation/handling/gripController';
import { MediumPropSet } from '../../src/simulation/handling/mediumProps';
import type { PhysicsWorldPort, Vec3 } from '../../src/simulation/physics/physicsPort';
import { createRapierWorld } from '../../src/simulation/physics/rapierWorld';

const worlds: PhysicsWorldPort[] = [];
afterEach(() => {
  for (const world of worlds.splice(0)) world.dispose();
});

const EYE: Vec3 = { x: 0, y: 1.4, z: 0 };
const FEET: Vec3 = { x: 0, y: 0.8, z: 0 };

async function setup(extra: (world: PhysicsWorldPort) => void = () => undefined) {
  const world = await createRapierWorld();
  worlds.push(world);
  // Ground with an edge at z = -6 and a pit beyond it.
  world.addBox({ kind: 'fixed', position: { x: 0, y: -0.5, z: 4 }, halfExtents: { x: 10, y: 0.5, z: 10 } });
  extra(world);
  const allocator = new EntityIdAllocator();
  const panelId = allocator.allocate();
  const crateId = allocator.allocate();
  const props = new MediumPropSet(world, [
    {
      id: panelId,
      materialId: contentId('aluminum'),
      displayName: 'Aluminum panel',
      position: { x: 0, y: 0.3, z: -1.5 },
      halfExtents: { x: 0.4, y: 0.05, z: 0.3 },
      massKg: 6,
    },
    {
      id: crateId,
      materialId: contentId('polymer'),
      displayName: 'Polymer housing',
      position: { x: 1.5, y: 0.3, z: -1.5 },
      halfExtents: { x: 0.3, y: 0.3, z: 0.3 },
      massKg: 8,
    },
  ]);
  for (let i = 0; i < 60; i += 1) world.step();
  const claims = new ClaimRegistry();
  return { world, props, claims, panelId, crateId, grip: new GripController(world, props, claims, 'player-0') };
}

function aimAt(target: Vec3, from: Vec3 = EYE) {
  const d = { x: target.x - from.x, y: target.y - from.y, z: target.z - from.z };
  const length = Math.hypot(d.x, d.y, d.z);
  return { origin: from, direction: { x: d.x / length, y: d.y / length, z: d.z / length } };
}

function hold(world: PhysicsWorldPort, grip: GripController, seconds: number, eye: Vec3 = EYE, yaw = 0): void {
  for (let i = 0; i < Math.round(seconds * 60); i += 1) {
    grip.fixedUpdate(eye, yaw);
    world.step();
  }
}

describe('medium-object grip', () => {
  it('claims the targeted prop and carries it to a readable hold point', async () => {
    const { world, props, claims, panelId, grip } = await setup();
    const pick = pickTarget(aimAt({ x: 0, y: 0.3, z: -1.5 }), props.targets(), world);
    expect(grip.tryGrab(pick, 0)).toEqual({ ok: true, id: panelId });
    expect(claims.holderOf(panelId)).toBe('player-0');
    hold(world, grip, 1);
    const position = world.bodyPosition(props.get(panelId)?.body ?? (0 as never));
    expect(position.z).toBeCloseTo(-GRIP_TUNING.holdDistance, 1);
    expect(position.y).toBeCloseTo(EYE.y - GRIP_TUNING.holdDrop, 1);
  });

  it('refuses to grab an object another player holds', async () => {
    const { world, props, claims, panelId, grip } = await setup();
    claims.claim(panelId, 'player-1');
    const pick = pickTarget(aimAt({ x: 0, y: 0.3, z: -1.5 }), props.targets(), world);
    expect(grip.tryGrab(pick, 0)).toEqual({ ok: false, reason: 'claimed' });
    expect(claims.holderOf(panelId)).toBe('player-1');
  });

  it('rotates the held object in 45° steps', async () => {
    const { world, props, panelId, grip } = await setup();
    grip.tryGrab(pickTarget(aimAt({ x: 0, y: 0.3, z: -1.5 }), props.targets(), world), 0);
    grip.rotate(1);
    grip.rotate(1);
    hold(world, grip, 1.5);
    const q = world.bodyRotation(props.get(panelId)?.body ?? (0 as never));
    const yaw = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.x * q.x + q.y * q.y));
    expect(Math.abs(yaw)).toBeCloseTo(Math.PI / 2, 1);
  });

  it('places validly, restores gravity and releases the claim', async () => {
    const { world, props, claims, panelId, grip } = await setup();
    grip.tryGrab(pickTarget(aimAt({ x: 0, y: 0.3, z: -1.5 }), props.targets(), world), 0);
    hold(world, grip, 1);
    expect(grip.tryPlace(FEET)).toEqual({ ok: true, id: panelId });
    expect(claims.holderOf(panelId)).toBeUndefined();
    expect(grip.held).toBeNull();
    for (let i = 0; i < 120; i += 1) world.step();
    expect(world.bodyPosition(props.get(panelId)?.body ?? (0 as never)).y).toBeLessThan(0.2);
  });

  it('cannot push the held object through a wall and refuses to place it while blocked', async () => {
    const { world, props, panelId, grip } = await setup((w) =>
      w.addBox({ kind: 'fixed', position: { x: 0, y: 1, z: -2.6 }, halfExtents: { x: 2, y: 1, z: 0.1 } }),
    );
    grip.tryGrab(pickTarget(aimAt({ x: 0, y: 0.3, z: -1.5 }), props.targets(), world), 0);
    // Step the player forward so the hold point ends up behind the wall.
    hold(world, grip, 1.5, { x: 0, y: 1.4, z: -1.6 });
    const position = world.bodyPosition(props.get(panelId)?.body ?? (0 as never));
    expect(position.z).toBeGreaterThan(-2.5);
    expect(grip.tryPlace({ x: 0, y: 0.8, z: -1.6 })).toEqual({ ok: false, reason: 'blocked' });
    expect(grip.held).toBe(panelId);
  });

  it('refuses placement overlapping the player', async () => {
    const { world, props, panelId, grip } = await setup();
    grip.tryGrab(pickTarget(aimAt({ x: 0, y: 0.3, z: -1.5 }), props.targets(), world), 0);
    hold(world, grip, 1);
    const position = world.bodyPosition(props.get(panelId)?.body ?? (0 as never));
    expect(grip.tryPlace({ x: position.x, y: position.y, z: position.z + 0.3 })).toEqual({
      ok: false,
      reason: 'overlaps-player',
    });
    expect(grip.held).toBe(panelId);
  });

  it('is pushed aside by other props instead of passing through them', async () => {
    const { world, props, panelId, crateId, grip } = await setup();
    grip.tryGrab(pickTarget(aimAt({ x: 0, y: 0.3, z: -1.5 }), props.targets(), world), 0);
    // Swing toward the crate at x = 1.5.
    hold(world, grip, 1.5, EYE, -Math.PI / 2 + 0.6);
    const panel = world.bodyPosition(props.get(panelId)?.body ?? (0 as never));
    const crate = world.bodyPosition(props.get(crateId)?.body ?? (0 as never));
    const separation = Math.hypot(panel.x - crate.x, panel.z - crate.z);
    expect(separation).toBeGreaterThan(0.3);
  });

  it('recovers a prop dropped over an edge to its last resting place', async () => {
    const { world, props, panelId, grip } = await setup();
    const rest = world.bodyPosition(props.get(panelId)?.body ?? (0 as never));
    grip.tryGrab(pickTarget(aimAt({ x: 0, y: 0.3, z: -1.5 }), props.targets(), world), 0);
    // Walk to the ground edge at z = -6 and hold the object out over the pit.
    hold(world, grip, 1.5, { x: 0, y: 1.4, z: -5.5 });
    grip.forceRelease();
    let recovered: EntityId[] = [];
    for (let i = 0; i < 600 && recovered.length === 0; i += 1) {
      world.step();
      recovered = props.recoverFallen();
    }
    expect(recovered).toEqual([panelId]);
    const back = world.bodyPosition(props.get(panelId)?.body ?? (0 as never));
    expect(back.y).toBeGreaterThan(0);
    expect(back.z).toBeGreaterThan(-6);
    expect(Math.abs(back.z - rest.z)).toBeLessThan(6);
  });
});

describe('ClaimRegistry', () => {
  it('lets only the holder release and frees everything on disconnect', () => {
    const claims = new ClaimRegistry();
    const a = 'ent-1' as EntityId;
    const b = 'ent-2' as EntityId;
    expect(claims.claim(a, 'player-0')).toBe(true);
    expect(claims.claim(a, 'player-0')).toBe(true);
    expect(claims.claim(a, 'player-1')).toBe(false);
    expect(claims.release(a, 'player-1')).toBe(false);
    claims.claim(b, 'player-0');
    expect(claims.releaseAll('player-0')).toEqual([a, b]);
    expect(claims.holderOf(a)).toBeUndefined();
  });
});

describe('settled recovery points', () => {
  it('uses the latest settled placement, not the release point, for recovery', async () => {
    const { world, props, panelId, grip } = await setup();
    grip.tryGrab(pickTarget(aimAt({ x: 0, y: 0.3, z: -1.5 }), props.targets(), world), 0);
    // Carry it away from the crate at x = 1.5 so nothing else is disturbed.
    hold(world, grip, 1, { x: -2, y: 1.4, z: 0 });
    expect(grip.tryPlace({ x: -2, y: 0.8, z: 0 }).ok).toBe(true);
    for (let i = 0; i < 400; i += 1) {
      world.step();
      props.recordSettled();
    }
    const body = props.get(panelId)?.body ?? (0 as never);
    const settled = world.bodyPosition(body);
    world.setBodyPose(body, { x: 0, y: -30, z: -9 }, { x: 0, y: 0, z: 0, w: 1 });
    expect(props.recoverFallen()).toEqual([panelId]);
    const back = world.bodyPosition(body);
    expect(back.x).toBeCloseTo(settled.x, 1);
    expect(back.z).toBeCloseTo(settled.z, 1);
  });
});
