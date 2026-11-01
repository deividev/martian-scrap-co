import { describe, expect, it } from 'vitest';
import { entityId, type EntityId } from '../../src/domain/ids';
import type { Vec3 } from '../../src/simulation/physics/physicsPort';
import { StationReveal } from '../../src/simulation/yard/stationReveal';
import { TEST_YARD_STATION_MARKER, mountainFootZ } from '../../src/simulation/yard/testYard';
import { createScrapMountainLayout } from '../../src/simulation/yard/scrapMountain';
import { EntityIdAllocator } from '../../src/domain/ids';

const SPEC = { position: { x: 0, y: 0, z: 0 }, radius: 2, revealWhenRemaining: 0.25 };
const id = (n: number): EntityId => entityId(`ent-${n.toString(36)}`);

function cover(count: number): { positions: Map<EntityId, Vec3 | null>; reveal: StationReveal } {
  const positions = new Map<EntityId, Vec3 | null>();
  for (let n = 1; n <= count; n += 1) positions.set(id(n), { x: (n % 3) * 0.5, y: 0, z: 0 });
  const pieces = [...positions].map(([pieceId, position]) => ({ id: pieceId, position: position ?? SPEC.position }));
  const far = { id: id(999), position: { x: 5, y: 0, z: 0 } };
  return { positions, reveal: new StationReveal(SPEC, StationReveal.coverOf(SPEC, [...pieces, far])) };
}

describe('StationReveal', () => {
  it('covers only pieces that start within the radius', () => {
    const { reveal } = cover(8);
    expect(reveal.status()).toMatchObject({ total: 8, remaining: 8, progress: 0, revealed: false });
  });

  it('counts collected pieces and pieces moved out of the radius, and reveals once at the threshold', () => {
    const { positions, reveal } = cover(8);
    const locate = (pieceId: EntityId) => positions.get(pieceId) ?? null;
    positions.set(id(1), null);
    positions.set(id(2), null);
    positions.set(id(3), { x: 4, y: 0, z: 0 });
    expect(reveal.update(locate)).toMatchObject({ remaining: 5, revealed: false, justRevealed: false });
    expect(reveal.status().progress).toBeCloseTo(3 / 6);
    for (const n of [4, 5, 6]) positions.set(id(n), null);
    expect(reveal.update(locate)).toMatchObject({ remaining: 2, revealed: true, justRevealed: true, progress: 1 });
    expect(reveal.update(locate).justRevealed).toBe(false);
    // Pieces rolling back do not bury it again.
    for (const n of [1, 2, 3, 4, 5, 6]) positions.set(id(n), { x: 0, y: 0, z: 0 });
    expect(reveal.update(locate)).toMatchObject({ remaining: 8, revealed: true });
  });

  it('rejects an empty cover or an invalid threshold', () => {
    expect(() => new StationReveal(SPEC, [])).toThrow(RangeError);
    expect(() => new StationReveal({ ...SPEC, revealWhenRemaining: 1 }, [id(1)])).toThrow(RangeError);
  });

  it('the test-yard marker cover cannot be cleared with iron alone (needs the level 2 collector)', () => {
    const layout = createScrapMountainLayout(new EntityIdAllocator());
    const pieces = [...layout.pieces, ...layout.smallClusters.flatMap((cluster) => cluster.pieces)];
    const ids = new Set(StationReveal.coverOf(TEST_YARD_STATION_MARKER, pieces));
    const covering = pieces.filter((piece) => ids.has(piece.id));
    const removable = (materials: readonly string[]) =>
      covering.filter((piece) => materials.includes(piece.materialId)).length / covering.length;
    const needed = 1 - TEST_YARD_STATION_MARKER.revealWhenRemaining;
    expect(TEST_YARD_STATION_MARKER.position.z).toBeCloseTo(mountainFootZ(6, -1.5), 1);
    expect(covering.length).toBeGreaterThan(40);
    expect(removable(['ferrous'])).toBeLessThan(needed);
    expect(removable(['ferrous', 'aluminum', 'copper'])).toBeGreaterThanOrEqual(needed);
  });
});
