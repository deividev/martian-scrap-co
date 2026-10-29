import { contentId, type EntityIdAllocator } from '../../domain/ids';
import type { BoxBodySpec, Quat, Vec3 } from '../physics/physicsPort';
import type { RecoveryZone } from '../player/playerController';
import type { ScrapClusterSpec } from '../scrap/scrapField';

/** A static block of the movement test yard; shared by physics and presentation. */
export interface YardBlock {
  readonly name: string;
  readonly position: Vec3;
  readonly halfExtents: Vec3;
  readonly rotation?: Quat;
  readonly color: string;
}

function tiltAboutX(degrees: number): Quat {
  const half = (degrees * Math.PI) / 360;
  return { x: Math.sin(half), y: 0, z: 0, w: Math.cos(half) };
}

/** Ramp of the given slope whose low edge sits on the ground at `startZ`, rising toward -Z. */
function ramp(name: string, x: number, startZ: number, length: number, degrees: number, color: string): YardBlock {
  const radians = (degrees * Math.PI) / 180;
  const thickness = 0.2;
  const centerZ = startZ - (Math.cos(radians) * length) / 2;
  const centerY = (Math.sin(radians) * length) / 2 - Math.cos(radians) * (thickness / 2);
  return {
    name,
    position: { x, y: centerY, z: centerZ },
    halfExtents: { x: 1.2, y: thickness / 2, z: length / 2 },
    rotation: tiltAboutX(degrees),
    color,
  };
}

/**
 * Movement test yard (MSC-013 check): walkable 15° and 30° ramps, a 50° ramp that must block,
 * 0.2 m and 0.5 m steps, an inside corner and a pit with a recovery zone. Ground top is y = 0.
 */
export const TEST_YARD_BLOCKS: readonly YardBlock[] = [
  // Ground split around a 4 × 4 m pit centered at (8, 8).
  { name: 'ground-west', position: { x: -9, y: -0.5, z: 0 }, halfExtents: { x: 15, y: 0.5, z: 30 }, color: '#b5502f' },
  { name: 'ground-east', position: { x: 18, y: -0.5, z: 0 }, halfExtents: { x: 8, y: 0.5, z: 30 }, color: '#b5502f' },
  { name: 'ground-north', position: { x: 8, y: -0.5, z: -11 }, halfExtents: { x: 2, y: 0.5, z: 19 }, color: '#b5502f' },
  { name: 'ground-south', position: { x: 8, y: -0.5, z: 20 }, halfExtents: { x: 2, y: 0.5, z: 10 }, color: '#b5502f' },
  ramp('ramp-15', -6, -2, 6, 15, '#d96c2b'),
  ramp('ramp-30', -2, -2, 5, 30, '#e0913f'),
  ramp('ramp-50', 2, -2, 4, 50, '#7c4a3a'),
  { name: 'step-20cm', position: { x: 6, y: 0.1, z: -3 }, halfExtents: { x: 1, y: 0.1, z: 1 }, color: '#8c939c' },
  { name: 'step-50cm', position: { x: 9, y: 0.25, z: -3 }, halfExtents: { x: 1, y: 0.25, z: 1 }, color: '#5d6570' },
  { name: 'wall-north', position: { x: -14, y: 1.5, z: 12 }, halfExtents: { x: 4, y: 1.5, z: 0.25 }, color: '#2f3a4f' },
  {
    name: 'wall-west',
    position: { x: -18.25, y: 1.5, z: 8 },
    halfExtents: { x: 0.25, y: 1.5, z: 4.25 },
    color: '#2f3a4f',
  },
];

export const TEST_YARD_RECOVERY_ZONES: readonly RecoveryZone[] = [
  { min: { x: 6, y: -30, z: 6 }, max: { x: 10, y: -3, z: 10 } },
];

export const TEST_YARD_SPAWN: Vec3 = { x: 0, y: 1, z: 6 };

export function yardBodySpec(block: YardBlock): BoxBodySpec {
  return {
    kind: 'fixed',
    position: block.position,
    halfExtents: block.halfExtents,
    ...(block.rotation ? { rotation: block.rotation } : {}),
  };
}

/** Mixed small-scrap pile in front of the spawn for collector tests (MSC-014). */
export function createTestYardScrap(allocator: EntityIdAllocator): ScrapClusterSpec {
  const materials = [
    'ferrous',
    'aluminum',
    'ferrous',
    'copper',
    'ferrous',
    'polymer',
    'heliofoil',
    'ferrous',
    'regolith-ceramic',
  ];
  const pieces = Array.from({ length: 18 }, (_, index) => ({
    id: allocator.allocate(),
    materialId: contentId(materials[index % materials.length] ?? 'ferrous'),
    position: { x: -1 + (index % 6) * 0.4, y: 0.15 + Math.floor(index / 6) * 0.3, z: 3 + (index % 2) * 0.3 },
    halfExtents: { x: 0.12, y: 0.08 + (index % 3) * 0.03, z: 0.14 },
    massKg: 1.5,
  }));
  return { id: 'test-yard-pile', pieces, decorativeInstances: 0 };
}
