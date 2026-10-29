import { AssemblyState } from '../../domain/assembly';
import { EntityIdAllocator, contentId } from '../../domain/ids';
import { AssemblyBody } from '../handling/assemblyBody';
import { Cart } from '../handling/cart';
import { ClaimRegistry } from '../handling/claims';
import { MediumPropSet, type MediumPropSpec } from '../handling/mediumProps';
import type { PhysicsWorldPort, Vec3 } from '../physics/physicsPort';
import { ScrapField, type ScrapClusterSpec } from '../scrap/scrapField';
import { TEST_YARD_ROVER, TEST_YARD_ROVER_LAYOUT } from '../yard/testYard';

/** Fixture size knobs (MSC-019). Values are test loads, not approved budgets or safe counts. */
export interface DenseYardParams {
  readonly seed: number;
  readonly activeClusters: number;
  readonly piecesPerCluster: number;
  readonly dormantClusters: number;
  readonly decorativeInstances: number;
  readonly mediumProps: number;
  readonly carts: number;
  readonly stationBlocks: number;
}

export const DENSE_YARD_PRESETS: Readonly<Record<'baseline' | 'dense', DenseYardParams>> = {
  baseline: {
    seed: 1,
    activeClusters: 4,
    piecesPerCluster: 40,
    dormantClusters: 20,
    decorativeInstances: 5_000,
    mediumProps: 12,
    carts: 4,
    stationBlocks: 24,
  },
  dense: {
    seed: 1,
    activeClusters: 12,
    piecesPerCluster: 60,
    dormantClusters: 80,
    decorativeInstances: 40_000,
    mediumProps: 40,
    carts: 4,
    stationBlocks: 80,
  },
};

const MATERIALS = ['ferrous', 'aluminum', 'copper', 'polymer', 'heliofoil', 'regolith-ceramic'] as const;

/** Small deterministic PRNG so every run builds the same yard. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DecorativeInstance {
  readonly materialId: string;
  readonly position: Vec3;
  readonly scale: Vec3;
  readonly yaw: number;
}

export interface DenseYard {
  readonly params: DenseYardParams;
  readonly scrap: ScrapField;
  readonly props: MediumPropSet;
  readonly claims: ClaimRegistry;
  readonly carts: readonly Cart[];
  readonly rover: AssemblyBody;
  readonly decorative: readonly DecorativeInstance[];
  readonly stationBlocks: readonly { position: Vec3; halfExtents: Vec3 }[];
  readonly activeClusterIds: readonly string[];
  readonly allocator: EntityIdAllocator;
}

/**
 * Builds a representative dense yard: a decorative mound (visual only), dormant clusters (identity
 * only), active clusters (physics bodies), medium props, four carts, a cuttable assembly and a block
 * of station geometry around the yard center.
 */
export function buildDenseYard(physics: PhysicsWorldPort, params: DenseYardParams): DenseYard {
  const random = mulberry32(params.seed);
  const allocator = new EntityIdAllocator();
  physics.addBox({ kind: 'fixed', position: { x: 0, y: -0.5, z: 0 }, halfExtents: { x: 60, y: 0.5, z: 60 } });

  const stationBlocks = Array.from({ length: params.stationBlocks }, (_, index) => {
    const ring = 18 + (index % 4) * 3;
    const angle = (index / params.stationBlocks) * Math.PI * 2;
    const halfExtents = { x: 1 + random() * 1.5, y: 1 + random() * 4, z: 1 + random() * 1.5 };
    const position = { x: Math.cos(angle) * ring, y: halfExtents.y, z: Math.sin(angle) * ring };
    physics.addBox({ kind: 'fixed', position, halfExtents });
    return { position, halfExtents };
  });

  const clusterSpecs: ScrapClusterSpec[] = [];
  const activeClusterIds: string[] = [];
  const totalClusters = params.activeClusters + params.dormantClusters;
  for (let c = 0; c < totalClusters; c += 1) {
    const angle = (c / totalClusters) * Math.PI * 2;
    const radius = 6 + (c % 3) * 3;
    const center = { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
    const id = `cluster-${c}`;
    if (c < params.activeClusters) activeClusterIds.push(id);
    clusterSpecs.push({
      id,
      decorativeInstances: 0,
      pieces: Array.from({ length: params.piecesPerCluster }, (_, p) => ({
        id: allocator.allocate(),
        materialId: contentId(MATERIALS[Math.floor(random() * MATERIALS.length)] ?? 'ferrous'),
        position: {
          x: center.x + (random() - 0.5) * 2.4,
          y: 0.15 + Math.floor(p / 12) * 0.28 + random() * 0.1,
          z: center.z + (random() - 0.5) * 2.4,
        },
        halfExtents: { x: 0.08 + random() * 0.06, y: 0.05 + random() * 0.05, z: 0.08 + random() * 0.06 },
        massKg: 0.8 + random() * 1.5,
      })),
    });
  }
  const scrap = new ScrapField(physics, clusterSpecs);
  for (const id of activeClusterIds) scrap.activateCluster(id);

  const decorative: DecorativeInstance[] = Array.from({ length: params.decorativeInstances }, () => {
    const angle = random() * Math.PI * 2;
    const distance = 28 + random() * 25;
    const height = Math.max(0, 14 * (1 - (distance - 28) / 25)) * random();
    return {
      materialId: MATERIALS[Math.floor(random() * MATERIALS.length)] ?? 'ferrous',
      position: { x: Math.cos(angle) * distance, y: height, z: Math.sin(angle) * distance },
      scale: { x: 0.2 + random() * 0.6, y: 0.1 + random() * 0.4, z: 0.2 + random() * 0.6 },
      yaw: random() * Math.PI * 2,
    };
  });

  const propSpecs: MediumPropSpec[] = Array.from({ length: params.mediumProps }, (_, index) => ({
    id: allocator.allocate(),
    materialId: contentId(MATERIALS[index % MATERIALS.length] ?? 'ferrous'),
    displayName: `Prop ${index}`,
    position: { x: -10 + (index % 8) * 2.5, y: 0.4, z: -12 - Math.floor(index / 8) * 2 },
    halfExtents: { x: 0.3, y: 0.25, z: 0.3 },
    massKg: 6 + (index % 4) * 3,
  }));
  const props = new MediumPropSet(physics, propSpecs);
  const claims = new ClaimRegistry();
  const carts = Array.from(
    { length: params.carts },
    (_, index) => new Cart(physics, props, claims, allocator.allocate(), { x: -6 + index * 4, y: 0.4, z: 12 }),
  );
  const rover = new AssemblyBody(
    physics,
    props,
    new AssemblyState(TEST_YARD_ROVER, () => allocator.allocate()),
    TEST_YARD_ROVER_LAYOUT,
  );
  return {
    params,
    scrap,
    props,
    claims,
    carts,
    rover,
    decorative,
    stationBlocks,
    activeClusterIds,
    allocator,
  };
}
