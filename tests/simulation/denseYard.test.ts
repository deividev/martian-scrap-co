import { afterEach, describe, expect, it } from 'vitest';
import { summarize } from '../../src/presentation/metrics';
import { DENSE_YARD_PRESETS, buildDenseYard, mulberry32 } from '../../src/simulation/benchmark/denseYardFixture';
import type { PhysicsWorldPort } from '../../src/simulation/physics/physicsPort';
import { createRapierWorld } from '../../src/simulation/physics/rapierWorld';

const worlds: PhysicsWorldPort[] = [];
afterEach(() => {
  for (const world of worlds.splice(0)) world.dispose();
});

describe('dense yard fixture', () => {
  it('builds the parameterized categories separately', async () => {
    const world = await createRapierWorld();
    worlds.push(world);
    const params = { ...DENSE_YARD_PRESETS.baseline, decorativeInstances: 100 };
    const yard = buildDenseYard(world, params);
    const metrics = yard.scrap.metrics();
    expect(metrics.active).toBe(params.activeClusters * params.piecesPerCluster);
    expect(metrics.dormant).toBe(params.dormantClusters * params.piecesPerCluster);
    expect(yard.decorative).toHaveLength(100);
    expect(yard.carts).toHaveLength(4);
    // Decorative instances and dormant pieces add no physics bodies.
    const expectedBodies =
      1 + params.stationBlocks + metrics.active + params.mediumProps + params.carts + 5; /* rover fragments */
    expect(world.bodyCount()).toBe(expectedBodies);
  });

  it('is deterministic for a seed', async () => {
    const a = await createRapierWorld();
    const b = await createRapierWorld();
    worlds.push(a, b);
    const params = { ...DENSE_YARD_PRESETS.baseline, decorativeInstances: 50 };
    expect(buildDenseYard(a, params).decorative).toEqual(buildDenseYard(b, params).decorative);
    expect(mulberry32(7)()).toBe(mulberry32(7)());
  });
});

describe('summarize', () => {
  it('reports percentiles and ignores non-finite samples', () => {
    const values = Array.from({ length: 100 }, (_, index) => index + 1);
    expect(summarize([...values, Number.NaN])).toEqual({
      samples: 100,
      mean: 50.5,
      p50: 51,
      p95: 96,
      p99: 100,
      max: 100,
    });
    expect(summarize([])).toEqual({ samples: 0, mean: 0, p50: 0, p95: 0, p99: 0, max: 0 });
  });
});
