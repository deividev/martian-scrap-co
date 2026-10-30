import { afterEach, describe, expect, it } from 'vitest';
import { EntityIdAllocator, contentId } from '../../src/domain/ids';
import type { PhysicsWorldPort } from '../../src/simulation/physics/physicsPort';
import { createRapierWorld } from '../../src/simulation/physics/rapierWorld';
import { ScrapField } from '../../src/simulation/scrap/scrapField';
import { SCRAP_MOUNTAIN, mountainHeight } from '../../src/simulation/yard/backdrop';
import { ScrapMountain, createScrapMountainLayout } from '../../src/simulation/yard/scrapMountain';

const STATION = { x: -6, z: -46, radius: 9 };
const worlds: PhysicsWorldPort[] = [];
afterEach(() => {
  for (const world of worlds.splice(0)) world.dispose();
});

describe('scrap mountain layout (owner follow-up R4)', () => {
  const layout = createScrapMountainLayout(new EntityIdAllocator(), STATION);

  it('is deterministic and mixes large, medium and small pieces of every material', () => {
    const again = createScrapMountainLayout(new EntityIdAllocator(), STATION);
    expect(again.pieces.map((piece) => piece.position)).toEqual(layout.pieces.map((piece) => piece.position));
    const large = layout.pieces.filter((piece) => piece.size === 'large');
    const medium = layout.pieces.filter((piece) => piece.size === 'medium');
    const small = layout.smallClusters.flatMap((cluster) => cluster.pieces);
    expect(large.length).toBeGreaterThan(250);
    expect(medium.length).toBeGreaterThan(400);
    expect(small.length).toBeGreaterThan(800);
    const materials = new Set([...layout.pieces, ...small].map((piece) => piece.materialId));
    expect(materials.size).toBe(6);
    expect(layout.smallClusters.every((cluster) => cluster.solid === true)).toBe(true);
  });

  it('stacks every piece on the core or on earlier pieces, keeping the station clear', () => {
    const order = new Map(layout.pieces.map((piece, index) => [piece.id, index]));
    for (const [index, piece] of layout.pieces.entries()) {
      for (const below of piece.restsOn) expect(order.get(below)).toBeLessThan(index);
      const core = mountainHeight(piece.position.x, piece.position.z) * SCRAP_MOUNTAIN.colliderScale;
      expect(piece.position.y + piece.halfExtents.y).toBeGreaterThan(core);
      expect(Math.hypot(piece.position.x - STATION.x, piece.position.z - STATION.z)).toBeGreaterThan(8);
    }
  });
});

describe('ScrapMountain', () => {
  it('gives every part a collider, blocks parts under a large part and frees medium parts on top', async () => {
    const world = await createRapierWorld();
    worlds.push(world);
    const layout = createScrapMountainLayout(new EntityIdAllocator(), STATION);
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
    const layout = createScrapMountainLayout(new EntityIdAllocator(), STATION);
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
