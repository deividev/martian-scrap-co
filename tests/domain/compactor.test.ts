import { describe, expect, it } from 'vitest';
import { COMPACTOR_TUNING, Compactor, type Bale } from '../../src/domain/compactor';
import { EntityIdAllocator, contentId, type EntityId } from '../../src/domain/ids';
import { BaseIntake } from '../../src/domain/intake';

const FERROUS = contentId('ferrous');
const COPPER = contentId('copper');
const TUNING = { balePieces: 3, loadSeconds: 0.5, processSeconds: 1 };

function setup(ferrous: number, copper = 0) {
  const allocator = new EntityIdAllocator();
  const intake = new BaseIntake(20);
  const pieces = [
    ...Array.from({ length: ferrous }, () => ({ id: allocator.allocate(), materialId: FERROUS, massKg: 2 })),
    ...Array.from({ length: copper }, () => ({ id: allocator.allocate(), materialId: COPPER, massKg: 1 })),
  ];
  intake.receive(pieces);
  const compactor = new Compactor(intake, [FERROUS, COPPER], () => allocator.allocate(), TUNING);
  const conserved = (bales: readonly Bale[]): EntityId[] =>
    [...compactor.inside, ...bales.flatMap((bale) => bale.pieceIds)].concat(
      intake.take(FERROUS, intake.binCount(FERROUS)).map((item) => item.id),
      intake.take(COPPER, intake.binCount(COPPER)).map((item) => item.id),
    );
  return { intake, compactor, pieces, conserved };
}

describe('Compactor (MSC-032)', () => {
  it('uses placeholder tuning by default', () => {
    expect(COMPACTOR_TUNING.balePieces).toBeGreaterThan(1);
  });

  it('stays idle until a bin holds a full load', () => {
    const { compactor } = setup(2);
    expect(compactor.update(1, true)).toBeNull();
    expect(compactor.state.kind).toBe('idle');
  });

  it('goes idle → loading → processing → output with one unique bale', () => {
    const { compactor, intake, pieces } = setup(4);
    compactor.update(0.1, true);
    expect(compactor.state.kind).toBe('loading');
    expect(intake.binCount(FERROUS)).toBe(1);
    compactor.update(0.6, true);
    expect(compactor.state.kind).toBe('processing');
    compactor.update(0.5, true);
    expect(compactor.state).toMatchObject({ kind: 'processing', progress: 0.5 });
    const bale = compactor.update(0.6, true);
    expect(bale).toMatchObject({ materialId: 'ferrous', massKg: 6 });
    expect(bale?.pieceIds).toEqual(pieces.slice(0, 3).map((item) => item.id));
    expect(pieces.map((item) => item.id)).not.toContain(bale?.id);
    expect(compactor.state.kind).toBe('idle');
  });

  it('blocks with the finished bale when the exit is occupied and ejects once it clears', () => {
    const { compactor } = setup(3);
    compactor.update(0.1, false);
    compactor.update(0.6, false);
    expect(compactor.update(1.1, false)).toBeNull();
    expect(compactor.state.kind).toBe('blocked');
    expect(compactor.update(5, false)).toBeNull();
    compactor.interrupt();
    expect(compactor.state.kind).toBe('blocked');
    const bale = compactor.update(0.1, true);
    expect(bale?.pieceIds).toHaveLength(3);
    expect(compactor.update(0.1, true)).toBeNull();
  });

  it('conserves every piece when interrupted at each transition and retried', () => {
    for (const stopAfter of [0.1, 0.4, 0.7, 1.2]) {
      const { compactor, pieces, conserved } = setup(5, 3);
      const bales: Bale[] = [];
      let time = 0;
      while (time < stopAfter) {
        const out = compactor.update(0.1, true);
        if (out) bales.push(out);
        time += 0.1;
      }
      compactor.interrupt();
      for (let i = 0; i < 80; i++) {
        const out = compactor.update(0.1, true);
        if (out) bales.push(out);
      }
      expect(bales.map((bale) => bale.materialId)).toEqual(['ferrous', 'copper']);
      const ids = conserved(bales);
      expect(new Set(ids).size).toBe(ids.length);
      expect([...ids].sort()).toEqual(pieces.map((item) => item.id).sort());
    }
  });

  it('rejects an invalid bale size', () => {
    const { intake } = setup(0);
    expect(() => new Compactor(intake, [FERROUS], () => 'x' as EntityId, { ...TUNING, balePieces: 0 })).toThrow(
      RangeError,
    );
  });
});
