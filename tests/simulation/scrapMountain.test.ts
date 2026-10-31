import { afterEach, describe, expect, it } from 'vitest';
import { EntityIdAllocator, contentId } from '../../src/domain/ids';
import type { PhysicsWorldPort } from '../../src/simulation/physics/physicsPort';
import { createRapierWorld } from '../../src/simulation/physics/rapierWorld';
import { ScrapField } from '../../src/simulation/scrap/scrapField';
import { BoundsGrid, boxBounds, mayRestOn } from '../../src/simulation/physics/boxSupport';
import { IDENTITY_QUAT } from '../../src/simulation/physics/quat';
import { addBackdropColliders, createBackdropLayout } from '../../src/simulation/yard/backdrop';
import { mountainFootZ } from '../../src/simulation/yard/testYard';
import { ScrapMountain, createScrapMountainLayout } from '../../src/simulation/yard/scrapMountain';

const STATION = { x: -6, z: -46, radius: 9 };
const worlds: PhysicsWorldPort[] = [];
afterEach(() => {
  for (const world of worlds.splice(0)) world.dispose();
});

describe('settled scrap mountain (owner follow-up R4, physics check 2026-10-30)', () => {
  const layout = createScrapMountainLayout(new EntityIdAllocator());
  const small = layout.smallClusters.flatMap((cluster) => cluster.pieces);

  it('mixes large, medium and many small pieces of every material, with stable ids', () => {
    const again = createScrapMountainLayout(new EntityIdAllocator());
    expect(again.pieces.map((piece) => piece.id)).toEqual(layout.pieces.map((piece) => piece.id));
    expect(layout.pieces.filter((piece) => piece.size === 'large').length).toBeGreaterThan(60);
    expect(layout.pieces.filter((piece) => piece.size === 'medium').length).toBeGreaterThan(300);
    expect(small.length).toBeGreaterThan(5000);
    const materials = new Set([...layout.pieces, ...small].map((piece) => piece.materialId));
    expect(materials.size).toBe(6);
    expect(layout.smallClusters.every((cluster) => cluster.solid === true)).toBe(true);
    for (const piece of layout.pieces) {
      expect(Math.hypot(piece.position.x - STATION.x, piece.position.z - STATION.z)).toBeGreaterThan(7);
    }
  });

  it('buries most parts under small pieces', () => {
    const grid = new BoundsGrid<number>();
    const smallBounds = small.map((piece) =>
      boxBounds({
        position: piece.position,
        rotation: piece.rotation ?? IDENTITY_QUAT,
        halfExtents: piece.halfExtents,
      }),
    );
    smallBounds.forEach((bounds, index) => grid.set(index, bounds));
    const covered = layout.pieces.filter((piece) => {
      const lower = boxBounds(piece);
      return [...grid.near(lower, 0.1)].some((index) => {
        const upper = smallBounds[index];
        return upper !== undefined && mayRestOn(upper, lower);
      });
    });
    expect(covered.length / layout.pieces.length).toBeGreaterThan(0.7);
  });

  it('is at rest: whole areas simulated as dynamic bodies hold, with no piece floating or falling through', async () => {
    const world = await createRapierWorld();
    worlds.push(world);
    addBackdropColliders(world, createBackdropLayout());
    // Four mountain areas and the starter spill at the foot wake; everything else stays fixed, as in the game.
    const areas = [
      { x: 0, z: -24 },
      { x: 14, z: -36 },
      { x: 3, z: mountainFootZ(3, 2.2) },
      { x: -20, z: -40 },
      { x: 10, z: -50 },
    ];
    const inArea = (p: { x: number; z: number }): boolean =>
      areas.some((area) => Math.hypot(p.x - area.x, p.z - area.z) < 5);
    // As in the game, medium and large parts stay fixed until worked; small pieces wake when disturbed.
    const all = [
      ...layout.pieces.map((piece) => ({ ...piece, small: false })),
      ...small.map((piece) => ({ ...piece, rotation: piece.rotation ?? IDENTITY_QUAT, small: true })),
    ];
    const dynamic: { handle: ReturnType<typeof world.addBox>; start: { x: number; y: number; z: number } }[] = [];
    for (const piece of all) {
      const awake = piece.small && inArea(piece.position);
      const handle = world.addBox({
        kind: awake ? 'dynamic' : 'fixed',
        position: piece.position,
        rotation: piece.rotation,
        halfExtents: piece.halfExtents,
        massKg: piece.massKg,
      });
      if (awake) dynamic.push({ handle, start: piece.position });
    }
    expect(dynamic.length).toBeGreaterThan(150);
    for (let i = 0; i < 90; i += 1) world.step();
    const moved = dynamic.map(({ handle, start }) => {
      const p = world.bodyPosition(handle);
      return Math.hypot(p.x - start.x, p.y - start.y, p.z - start.z);
    });
    // A heap woken all at once may shift a little where a jammed piece gives way, as real scrap does; but almost
    // everything stays put and nothing drops as if it had been floating (free fall covers 11 m in 1.5 s).
    const shifted = moved.filter((distance) => distance > 0.05).length;
    expect(shifted / moved.length).toBeLessThan(0.005);
    expect(Math.max(...moved)).toBeLessThan(1);
  });
});

describe('ScrapMountain', () => {
  it('gives every part a collider, blocks parts under a large part and frees medium parts on top', async () => {
    const world = await createRapierWorld();
    worlds.push(world);
    const layout = createScrapMountainLayout(new EntityIdAllocator());
    const mountain = new ScrapMountain(world, layout.pieces);
    const underLarge = layout.pieces.filter((piece) => mountain.blockers(piece.id).length > 0);
    for (const piece of underLarge) {
      expect(mountain.exposed(piece.id)).toBe(false);
      expect(mountain.release(piece.id)).toBeNull();
    }
    // A large part with only medium parts on top can be cut; those parts are freed, never left floating.
    const withMediumOnTop = layout.pieces.find(
      (piece) =>
        piece.size === 'large' &&
        mountain.exposed(piece.id) &&
        layout.pieces.some((other) => other.size === 'medium' && other.restsOn.includes(piece.id)),
    );
    expect(withMediumOnTop).toBeDefined();
    if (!withMediumOnTop) return;
    const version = mountain.version;
    const left = mountain.remove(withMediumOnTop.id);
    expect(left?.piece.id).toBe(withMediumOnTop.id);
    expect(left?.freed.length).toBeGreaterThan(0);
    expect(left?.freed.every((piece) => piece.size === 'medium' && mountain.state(piece.id) === 'released')).toBe(true);
    for (const piece of layout.pieces) {
      if (mountain.state(piece.id) !== 'embedded') continue;
      // No embedded part rests only on parts that left the pile.
      if (piece.restsOn.length > 0) {
        expect(piece.restsOn.some((below) => mountain.state(below) === 'embedded') || piece.size === 'large').toBe(
          true,
        );
      }
    }
    expect(mountain.version).toBeGreaterThan(version);
    expect(mountain.remove(withMediumOnTop.id)).toBeNull();
    expect(mountain.changed().removed).toEqual([withMediumOnTop.id]);
    expect(world.awakeBodyCount()).toBe(0);
  });

  it('blocks a part while a large part rests on it', async () => {
    const world = await createRapierWorld();
    worlds.push(world);
    const ids = new EntityIdAllocator();
    const part = (size: 'large' | 'medium', y: number, restsOn: ReturnType<EntityIdAllocator['allocate']>[]) => ({
      id: ids.allocate(),
      materialId: contentId('ferrous'),
      size,
      variant: 0,
      position: { x: 0, y, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      halfExtents: { x: 1, y: 0.5, z: 1 },
      massKg: 100,
      restsOn,
    });
    const bottom = part('large', 0.5, []);
    const top = part('large', 1.5, [bottom.id]);
    const mountain = new ScrapMountain(world, [bottom, top]);
    expect(mountain.blockers(bottom.id)).toEqual([top.id]);
    expect(mountain.remove(bottom.id)).toBeNull();
    expect(mountain.remove(top.id)?.freed).toEqual([]);
    expect(mountain.remove(bottom.id)?.piece.id).toBe(bottom.id);
  });

  it('finds embedded parts near a point for aiming', async () => {
    const world = await createRapierWorld();
    worlds.push(world);
    const layout = createScrapMountainLayout(new EntityIdAllocator());
    const mountain = new ScrapMountain(world, layout.pieces);
    const sample = layout.pieces[Math.floor(layout.pieces.length / 2)];
    expect(sample).toBeDefined();
    if (!sample) return;
    const near = mountain.targetsNear(sample.position, 3);
    expect(near.some((candidate) => candidate.id === sample.id)).toBe(true);
    expect(mountain.targetsNear({ x: 0, y: 0, z: 40 }, 3)).toEqual([]);
  });

  it('keeps dormant small mountain pieces solid and swaps them to dynamic bodies when woken', async () => {
    const world = await createRapierWorld();
    worlds.push(world);
    const field = new ScrapField(world, [
      {
        id: 'mountain-test',
        decorativeInstances: 0,
        solid: true,
        pieces: [
          {
            id: new EntityIdAllocator().allocate(),
            materialId: contentId('ferrous'),
            position: { x: 0, y: 0.1, z: 0 },
            halfExtents: { x: 0.1, y: 0.1, z: 0.1 },
            massKg: 1,
          },
        ],
      },
    ]);
    expect(field.metrics()).toMatchObject({ solidDormant: 1, physicsBodies: 0 });
    world.step();
    expect(world.castRay({ x: 0, y: 2, z: 0 }, { x: 0, y: -1, z: 0 }, 3)).not.toBeNull();
    field.activateCluster('mountain-test');
    expect(field.metrics()).toMatchObject({ solidDormant: 0, physicsBodies: 1 });
    field.deactivateCluster('mountain-test');
    expect(field.metrics()).toMatchObject({ solidDormant: 1, physicsBodies: 0 });
    expect(field.snapshot().clusters[0]?.solid).toBe(true);
  });
});

describe('ScrapField demand waking (mountain physics check 2026-10-30)', () => {
  const column = async () => {
    const world = await createRapierWorld();
    worlds.push(world);
    world.addBox({ kind: 'fixed', position: { x: 0, y: -0.5, z: 0 }, halfExtents: { x: 5, y: 0.5, z: 5 } });
    const ids = new EntityIdAllocator();
    // Three pieces stacked on the ground, plus one off to the side.
    const pieces = [0.1, 0.3, 0.5, 0.1].map((y, index) => ({
      id: ids.allocate(),
      materialId: contentId('ferrous'),
      position: { x: index === 3 ? 2 : 0, y, z: 0 },
      halfExtents: { x: 0.1, y: 0.1, z: 0.1 },
      massKg: 1,
    }));
    const field = new ScrapField(world, [{ id: 'pile-test', decorativeInstances: 0, solid: true, pieces }]);
    return { world, field, pieces };
  };

  it('offers dormant pieces as targets with their fixed collider', async () => {
    const { field, pieces } = await column();
    const near = field.targetsNear({ x: 0, y: 0.3, z: 0 }, 1);
    expect(near.map((target) => target.id).sort()).toEqual(
      pieces
        .slice(0, 3)
        .map((piece) => piece.id)
        .sort(),
    );
    expect(field.activeCount).toBe(0);
  });

  it('wakes a disturbed piece and everything resting on it, but nothing beside it', async () => {
    const { field, pieces } = await column();
    const [bottom, , top, side] = pieces;
    if (!bottom || !top || !side) return;
    expect(field.disturb(bottom.id)).toBe(3);
    expect(field.piece(top.id)?.state).toBe('active');
    expect(field.piece(side.id)?.state).toBe('dormant');
  });

  it('wakes what rested on a part that leaves and on a collected piece', async () => {
    const { field, pieces } = await column();
    const [bottom, middle, top] = pieces;
    if (!bottom || !middle || !top) return;
    expect(field.wakeAbove({ position: top.position, rotation: IDENTITY_QUAT, halfExtents: top.halfExtents })).toBe(0);
    expect(field.removePiece(bottom.id)).toBe(true);
    expect(field.piece(middle.id)?.state).toBe('active');
    expect(field.piece(top.id)?.state).toBe('active');
  });

  it('pushes pieces the player walks into and settles them again far away once still', async () => {
    const { world, field, pieces } = await column();
    const side = pieces[3];
    if (!side) return;
    expect(field.disturbWithin({ min: { x: 1.8, y: 0, z: -0.2 }, max: { x: 2.2, y: 1, z: 0.2 } })).toBe(1);
    expect(field.settleFar({ x: 2, y: 0, z: 0 }, 5)).toBe(0);
    const body = field.bodyOf(side.id);
    expect(body).toBeDefined();
    for (let i = 0; i < 300 && body !== undefined && !world.isSleeping(body); i += 1) world.step();
    expect(field.settleFar({ x: 2, y: 0, z: 0 }, 5)).toBe(0);
    expect(field.settleFar({ x: 20, y: 0, z: 0 }, 5)).toBe(1);
    expect(field.piece(side.id)?.state).toBe('dormant');
    expect(field.metrics().solidDormant).toBe(4);
  });

  it('keeps colliders only for clusters near a player', async () => {
    const { field, pieces } = await column();
    const side = pieces[3];
    if (!side) return;
    expect(field.streamSolids([{ x: 40, y: 0, z: 0 }], 10)).toBe(1);
    expect(field.metrics().solidDormant).toBe(0);
    expect(field.targetsNear({ x: 0, y: 0.3, z: 0 }, 1)).toEqual([]);
    expect(field.streamSolids([{ x: 12, y: 0, z: 0 }], 16)).toBe(1);
    expect(field.metrics().solidDormant).toBe(4);
    // Inside the hysteresis band nothing changes.
    expect(field.streamSolids([{ x: 19, y: 0, z: 0 }], 16)).toBe(0);
    expect(field.disturb(side.id)).toBe(1);
  });

  it('spreads collider changes over frames within a budget, additions first', async () => {
    const { field } = await column();
    expect(field.streamSolids([{ x: 40, y: 0, z: 0 }], 10, 6, 1)).toBe(1);
    expect(field.metrics().solidDormant).toBe(3);
    expect(field.pendingSolids).toBe(3);
    // The player turns back before the drops ran: the queued drops become additions again.
    expect(field.streamSolids([{ x: 0, y: 0, z: 0 }], 10, 6, 0)).toBe(1);
    expect(field.pumpSolids(10)).toBe(4);
    expect(field.metrics().solidDormant).toBe(4);
    expect(field.pendingSolids).toBe(0);
  });

  it('reports every piece that wakes, sleeps or is removed', async () => {
    const { field, pieces } = await column();
    const top = pieces[2];
    if (!top) return;
    const changed: string[] = [];
    const stop = field.onStateChange((id) => changed.push(String(id)));
    field.disturb(top.id);
    field.removePiece(top.id);
    stop();
    field.removePiece(pieces[3]?.id ?? top.id);
    expect(changed).toEqual([String(top.id), String(top.id)]);
  });

  it('keeps the colliders under an awake piece, however far the player is', async () => {
    const { field, pieces } = await column();
    const top = pieces[2];
    if (!top) return;
    expect(field.disturb(top.id)).toBe(1);
    expect(field.streamSolids([{ x: 40, y: 0, z: 0 }], 10, 4)).toBe(0);
    expect(field.metrics().solidDormant).toBe(3);
  });
});
