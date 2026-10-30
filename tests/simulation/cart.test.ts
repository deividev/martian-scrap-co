import { afterEach, describe, expect, it } from 'vitest';
import { EntityIdAllocator, contentId, type EntityId } from '../../src/domain/ids';
import { CART_TUNING, Cart } from '../../src/simulation/handling/cart';
import { ClaimRegistry } from '../../src/simulation/handling/claims';
import { MediumPropSet, type MediumPropSpec } from '../../src/simulation/handling/mediumProps';
import type { PhysicsWorldPort, Vec3 } from '../../src/simulation/physics/physicsPort';
import { tiltOf } from '../../src/simulation/physics/quat';
import { createRapierWorld } from '../../src/simulation/physics/rapierWorld';

const DT = 1 / 60;
const worlds: PhysicsWorldPort[] = [];
afterEach(() => {
  for (const world of worlds.splice(0)) world.dispose();
});

async function setup(propMasses: readonly number[] = [8, 8, 8, 8, 8]) {
  const world = await createRapierWorld();
  worlds.push(world);
  world.addBox({ kind: 'fixed', position: { x: 0, y: -0.5, z: 0 }, halfExtents: { x: 30, y: 0.5, z: 30 } });
  const allocator = new EntityIdAllocator();
  const specs: MediumPropSpec[] = propMasses.map((massKg, index) => ({
    id: allocator.allocate(),
    materialId: contentId('polymer'),
    displayName: `Housing ${index}`,
    position: { x: 5 + index, y: 0.3, z: 5 },
    halfExtents: { x: 0.2, y: 0.2, z: 0.2 },
    massKg,
  }));
  const props = new MediumPropSet(world, specs);
  const claims = new ClaimRegistry();
  const cart = new Cart(world, props, claims, allocator.allocate(), { x: 0, y: 0.4, z: -1.4 });
  for (let i = 0; i < 90; i += 1) {
    cart.fixedUpdate(DT);
    world.step();
  }
  return { world, props, claims, cart, ids: specs.map((spec) => spec.id) };
}

/** Walks a pusher along a straight line at walking speed while pushing the cart. */
function pushRoute(world: PhysicsWorldPort, cart: Cart, from: Vec3, yaw: number, seconds: number, holder = 'player-0') {
  let eye = from;
  const speed = 3.5;
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    eye = { x: eye.x - Math.sin(yaw) * speed * DT, y: eye.y, z: eye.z - Math.cos(yaw) * speed * DT };
    cart.fixedUpdate(DT, { holder, eye, yaw });
    world.step();
  }
  return eye;
}

describe('Cart pushing', () => {
  it('follows one player along an empty route', async () => {
    const { world, cart } = await setup();
    expect(cart.startPush('player-0')).toBe(true);
    const eye = pushRoute(world, cart, { x: 0, y: 1.4, z: 0 }, 0, 3);
    const position = world.bodyPosition(cart.body);
    expect(position.z).toBeLessThan(-9);
    expect(Math.abs(position.z - (eye.z - CART_TUNING.pushDistance))).toBeLessThan(0.8);
    expect(tiltOf(world.bodyRotation(cart.body))).toBeLessThan(0.2);
  });

  it('turns with the player', async () => {
    const { world, cart } = await setup();
    cart.startPush('player-0');
    pushRoute(world, cart, { x: 0, y: 1.4, z: 0 }, Math.PI / 2, 2);
    expect(world.bodyPosition(cart.body).x).toBeLessThan(-4);
  });

  it('cannot be pushed by a second player while claimed', async () => {
    const { world, cart } = await setup();
    cart.startPush('player-0');
    expect(cart.startPush('player-1')).toBe(false);
    const before = world.bodyPosition(cart.body);
    pushRoute(world, cart, { x: 0, y: 1.4, z: 0 }, Math.PI, 1, 'player-1');
    expect(Math.abs(world.bodyPosition(cart.body).z - before.z)).toBeLessThan(0.1);
  });
});

describe('Cart loading', () => {
  it('carries a full intended load along a route without losing anything', async () => {
    const { world, props, claims, cart, ids } = await setup();
    for (const id of ids.slice(0, 4)) expect(cart.load(id)).toEqual({ ok: true });
    expect(cart.load(ids[4] as EntityId)).toEqual({ ok: false, reason: 'full' });
    for (const id of ids.slice(0, 4)) expect(claims.holderOf(id)).toBe(`cart:${cart.id}`);
    cart.startPush('player-0');
    pushRoute(world, cart, { x: 0, y: 1.4, z: 0 }, 0, 3);
    const cartPosition = world.bodyPosition(cart.body);
    for (const id of ids.slice(0, 4)) {
      const p = world.bodyPosition(props.get(id)?.body ?? (0 as never));
      expect(Math.hypot(p.x - cartPosition.x, p.z - cartPosition.z)).toBeLessThan(0.8);
      expect(p.y).toBeGreaterThan(cartPosition.y);
    }
  });

  it('refuses loads over the mass limit and double loads', async () => {
    const { cart, ids } = await setup([35, 30, 5]);
    expect(cart.load(ids[0] as EntityId).ok).toBe(true);
    expect(cart.load(ids[0] as EntityId)).toEqual({ ok: false, reason: 'already-loaded' });
    expect(cart.load(ids[1] as EntityId)).toEqual({ ok: false, reason: 'too-heavy' });
    expect(cart.load(ids[2] as EntityId).ok).toBe(true);
  });

  it('refuses a prop someone else is holding', async () => {
    const { claims, cart, ids } = await setup();
    claims.claim(ids[0] as EntityId, 'player-1');
    expect(cart.load(ids[0] as EntityId)).toEqual({ ok: false, reason: 'claimed' });
  });

  it('unloads everything beside the cart with physics restored and claims released', async () => {
    const { world, props, claims, cart, ids } = await setup();
    for (const id of ids.slice(0, 3)) cart.load(id);
    expect(cart.unloadAll()).toEqual(ids.slice(0, 3));
    expect(cart.loads).toEqual([]);
    for (let i = 0; i < 120; i += 1) world.step();
    const cartPosition = world.bodyPosition(cart.body);
    for (const id of ids.slice(0, 3)) {
      expect(claims.holderOf(id)).toBeUndefined();
      const p = world.bodyPosition(props.get(id)?.body ?? (0 as never));
      expect(p.y).toBeLessThan(0.5);
      expect(p.y).toBeGreaterThan(0);
      expect(cart.isOverBed({ ...p, y: cartPosition.y + CART_TUNING.halfExtents.y })).toBe(false);
    }
  });

  it('detects points over the bed', async () => {
    const { world, cart } = await setup();
    const p = world.bodyPosition(cart.body);
    expect(cart.isOverBed({ x: p.x + 0.2, y: p.y + 0.5, z: p.z })).toBe(true);
    expect(cart.isOverBed({ x: p.x + 1.5, y: p.y + 0.5, z: p.z })).toBe(false);
    expect(cart.isOverBed({ x: p.x, y: p.y + 3, z: p.z })).toBe(false);
  });
});

describe('Cart recovery', () => {
  it('rights itself after tipping over and keeps its load', async () => {
    const { world, cart, ids } = await setup();
    cart.load(ids[0] as EntityId);
    const p = world.bodyPosition(cart.body);
    world.setBodyPose(cart.body, { x: p.x, y: 0.6, z: p.z }, { x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 });
    for (let i = 0; i < 150; i += 1) {
      cart.fixedUpdate(DT);
      world.step();
    }
    expect(cart.recoveries).toBeGreaterThanOrEqual(1);
    expect(tiltOf(world.bodyRotation(cart.body))).toBeLessThan(0.2);
    expect(cart.loads).toEqual([ids[0]]);
  });

  it('returns to its last settled spot after leaving the yard, loads included', async () => {
    const { world, props, cart, ids } = await setup();
    cart.load(ids[0] as EntityId);
    const settled = world.bodyPosition(cart.body);
    world.setBodyPose(cart.body, { x: 50, y: -25, z: 50 }, { x: 0, y: 0, z: 0, w: 1 });
    cart.fixedUpdate(DT);
    world.step();
    const back = world.bodyPosition(cart.body);
    expect(cart.recoveries).toBe(1);
    expect(Math.hypot(back.x - settled.x, back.z - settled.z)).toBeLessThan(0.3);
    const load = world.bodyPosition(props.get(ids[0] as EntityId)?.body ?? (0 as never));
    expect(Math.hypot(load.x - back.x, load.z - back.z)).toBeLessThan(0.8);
  });
});
