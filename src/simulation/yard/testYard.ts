import type { AssemblyDefinition } from '../../domain/assembly';
import { contentId, type EntityIdAllocator } from '../../domain/ids';
import type { BoxBodySpec, Quat, Vec3 } from '../physics/physicsPort';
import type { RecoveryZone } from '../player/playerController';
import type { AssemblyLayout } from '../handling/assemblyBody';
import { mulberry32 } from '../benchmark/denseYardFixture';
import type { BreakableSpec } from '../handling/breakables';
import type { MediumPropSpec } from '../handling/mediumProps';
import type { ScrapClusterSpec } from '../scrap/scrapField';
import { SCRAP_MOUNTAIN } from './backdrop';

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
 * 0.2 m and 0.5 m steps and an inside corner. Ground top is y = 0 (continuous backdrop floor).
 */
export const TEST_YARD_BLOCKS: readonly YardBlock[] = [
  // The ground itself comes from the backdrop (one continuous floor, no pit: owner feedback 2026-10-30).
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

/** No recovery pits in the yard any more; falling below the recovery height still returns the player. */
export const TEST_YARD_RECOVERY_ZONES: readonly RecoveryZone[] = [];

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

/** Medium props for grip tests (MSC-016): a panel, a housing and a cable spool box. */
export function createTestYardProps(allocator: EntityIdAllocator): MediumPropSpec[] {
  return [
    {
      id: allocator.allocate(),
      materialId: contentId('aluminum'),
      displayName: 'Aluminum panel',
      nameKeys: ['prop.aluminumPanel'],
      position: { x: 3, y: 0.2, z: 2 },
      halfExtents: { x: 0.45, y: 0.04, z: 0.32 },
      massKg: 6,
    },
    {
      id: allocator.allocate(),
      materialId: contentId('polymer'),
      displayName: 'Polymer housing',
      nameKeys: ['prop.polymerHousing'],
      position: { x: 4.2, y: 0.4, z: 2 },
      halfExtents: { x: 0.3, y: 0.25, z: 0.3 },
      massKg: 8,
    },
    {
      id: allocator.allocate(),
      materialId: contentId('copper'),
      displayName: 'Copper spool box',
      nameKeys: ['prop.copperSpoolBox'],
      position: { x: 5.4, y: 0.4, z: 2 },
      halfExtents: { x: 0.25, y: 0.25, z: 0.25 },
      massKg: 12,
    },
  ];
}

/**
 * Cutting prototype (MSC-018): a rover chassis with a cover that must come off before the copper
 * coil, and a side panel carrying a bracket. Authored joints only; no free-form fracture.
 */
export const TEST_YARD_ROVER: AssemblyDefinition = {
  id: 'test-yard-rover',
  anchor: 'frame',
  fragments: [
    { id: 'frame', materialId: contentId('ferrous'), massKg: 80 },
    { id: 'cover', materialId: contentId('aluminum'), massKg: 10 },
    { id: 'coil', materialId: contentId('copper'), massKg: 14 },
    { id: 'side', materialId: contentId('aluminum'), massKg: 9 },
    { id: 'bracket', materialId: contentId('ferrous'), massKg: 3 },
  ],
  joints: [
    { id: 'cover-left', between: ['frame', 'cover'] },
    { id: 'cover-right', between: ['frame', 'cover'] },
    { id: 'coil-mount', between: ['frame', 'coil'], requires: ['cover-left', 'cover-right'] },
    { id: 'side-bolt', between: ['frame', 'side'] },
    { id: 'bracket-weld', between: ['side', 'bracket'] },
  ],
};

export const TEST_YARD_ROVER_LAYOUT: AssemblyLayout = {
  fragments: {
    frame: { position: { x: -6, y: 0.4, z: 4 }, halfExtents: { x: 0.9, y: 0.4, z: 0.6 } },
    coil: { position: { x: -6.3, y: 0.95, z: 4 }, halfExtents: { x: 0.15, y: 0.15, z: 0.15 } },
    cover: { position: { x: -6, y: 1.15, z: 4 }, halfExtents: { x: 0.7, y: 0.05, z: 0.5 } },
    side: { position: { x: -6, y: 0.4, z: 4.65 }, halfExtents: { x: 0.8, y: 0.35, z: 0.05 } },
    bracket: { position: { x: -5.6, y: 0.45, z: 4.75 }, halfExtents: { x: 0.1, y: 0.1, z: 0.05 } },
  },
  joints: {
    'cover-left': { x: -6.65, y: 1.15, z: 4.45 },
    'cover-right': { x: -5.35, y: 1.15, z: 4.45 },
    'coil-mount': { x: -6.3, y: 0.82, z: 4.12 },
    'side-bolt': { x: -6.7, y: 0.4, z: 4.71 },
    'bracket-weld': { x: -5.6, y: 0.57, z: 4.81 },
  },
  fragmentNames: {
    frame: 'Rover frame',
    cover: 'Cover panel',
    coil: 'Copper coil',
    side: 'Side panel',
    bracket: 'Bracket',
  },
  fragmentNameKeys: {
    frame: 'fragment.roverFrame',
    cover: 'fragment.coverPanel',
    coil: 'fragment.copperCoil',
    side: 'fragment.sidePanel',
    bracket: 'fragment.bracket',
  },
};

const FOOT_MATERIALS = [
  'ferrous',
  'ferrous',
  'ferrous',
  'ferrous',
  'aluminum',
  'copper',
  'polymer',
  'heliofoil',
  'regolith-ceramic',
];

/** Ground position just outside the scrap mountain's edge at a given x (plus an offset toward the yard). */
export function mountainFootZ(x: number, offset: number): number {
  const ratio = Math.min(1, Math.abs(x - SCRAP_MOUNTAIN.center.x) / SCRAP_MOUNTAIN.radiusX);
  return SCRAP_MOUNTAIN.center.z + SCRAP_MOUNTAIN.radiusZ * Math.sqrt(1 - ratio * ratio) + offset;
}

/**
 * Many small pieces spilled at the foot of the scrap mountain for the start of the game (owner feedback
 * 2026-10-30). Clusters start dormant and are activated when the player comes near.
 */
export function createMountainFootScrap(allocator: EntityIdAllocator): ScrapClusterSpec[] {
  const random = mulberry32(7);
  return [-15, -9, -3, 3, 9, 15].map((cx, clusterIndex) => {
    const cz = mountainFootZ(cx, 2.2);
    return {
      id: `mountain-foot-${clusterIndex}`,
      decorativeInstances: 0,
      pieces: Array.from({ length: 36 }, (_, index) => ({
        id: allocator.allocate(),
        materialId: contentId(FOOT_MATERIALS[Math.floor(random() * FOOT_MATERIALS.length)] ?? 'ferrous'),
        position: {
          x: cx + (random() - 0.5) * 4.5,
          y: 0.12 + Math.floor(index / 18) * 0.25 + random() * 0.1,
          z: cz + (random() - 0.5) * 2.5,
        },
        halfExtents: { x: 0.08 + random() * 0.06, y: 0.05 + random() * 0.05, z: 0.08 + random() * 0.06 },
        massKg: 0.8 + random() * 1.4,
      })),
    };
  });
}

/** Medium junk that breaks into small pieces of several materials (for the early-mid game). */
export function createTestYardBreakables(allocator: EntityIdAllocator): BreakableSpec[] {
  const make = (
    x: number,
    shell: string,
    nameKey: string,
    displayName: string,
    yields: readonly [string, number][],
  ): BreakableSpec => ({
    id: allocator.allocate(),
    materialId: contentId(shell),
    displayName,
    nameKeys: [nameKey],
    position: { x, y: 0.45, z: mountainFootZ(x, 4.5) },
    halfExtents: { x: 0.4, y: 0.35, z: 0.35 },
    massKg: 16,
    yields: yields.map(([materialId, count]) => ({ materialId: contentId(materialId), count })),
  });
  return [
    make(-12, 'polymer', 'prop.oldMachine', 'Old machine housing', [
      ['ferrous', 4],
      ['copper', 2],
      ['polymer', 3],
    ]),
    make(-6, 'ferrous', 'prop.cableBox', 'Cable junction box', [
      ['copper', 4],
      ['ferrous', 3],
      ['polymer', 1],
    ]),
    make(0, 'heliofoil', 'prop.brokenSolar', 'Broken solar panel', [
      ['heliofoil', 3],
      ['aluminum', 3],
      ['copper', 1],
    ]),
    make(6, 'regolith-ceramic', 'prop.heatShield', 'Heat shield block', [
      ['regolith-ceramic', 4],
      ['ferrous', 2],
    ]),
    make(12, 'aluminum', 'prop.roverDoor', 'Rover door', [
      ['aluminum', 4],
      ['ferrous', 2],
      ['polymer', 2],
    ]),
  ];
}

/** Base intake hopper where the portable container is unloaded (early prototype ahead of MSC-031). */
export const TEST_YARD_INTAKE = Object.freeze({
  position: { x: 4.5, y: 0, z: 9 },
  halfExtents: { x: 0.9, y: 0.9, z: 0.9 },
  /** The player must stand within this distance of the hopper to unload. */
  reach: 2.8,
});
