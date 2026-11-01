import { describe, expect, it } from 'vitest';
import { PortableContainer, type ContainerItem } from '../../src/domain/container';
import { EntityIdAllocator, contentId } from '../../src/domain/ids';
import { BaseIntake } from '../../src/domain/intake';

const allocator = new EntityIdAllocator();
const piece = (material: string, massKg = 1): ContainerItem => ({
  id: allocator.allocate(),
  materialId: contentId(material),
  massKg,
});

describe('BaseIntake batch classification (MSC-031)', () => {
  it('routes a mixed batch to material bins with no per-piece sorting', () => {
    const intake = new BaseIntake(10);
    const batch = [piece('ferrous'), piece('copper'), piece('ferrous'), piece('aluminum')];
    const preview = intake.preview(batch);
    expect(preview.accepted.map((entry) => [entry.materialId, entry.count])).toEqual([
      ['ferrous', 2],
      ['copper', 1],
      ['aluminum', 1],
    ]);
    expect(intake.count).toBe(0);
    expect(intake.receive(batch).kept).toEqual([]);
    expect(intake.binCount(contentId('ferrous'))).toBe(2);
    expect(intake.count).toBe(4);
  });

  it('keeps what does not fit in a full bin or is not accepted, and never counts a piece twice', () => {
    const intake = new BaseIntake(2, (material) => material !== 'regolith-ceramic');
    const batch = [piece('ferrous'), piece('ferrous'), piece('ferrous'), piece('regolith-ceramic')];
    const preview = intake.preview(batch);
    expect(preview.kept).toEqual([
      { materialId: 'ferrous', count: 1, massKg: 1, reason: 'bin-full' },
      { materialId: 'regolith-ceramic', count: 1, massKg: 1, reason: 'not-accepted' },
    ]);
    const result = intake.receive(batch);
    expect(result.accepted).toBe(2);
    expect(result.kept.map((item) => item.id)).toEqual([batch[2]?.id, batch[3]?.id]);
    expect(intake.receive(batch.slice(0, 2))).toEqual({ accepted: 0, duplicates: 2, kept: [] });
  });

  it('handles an empty batch and works with a partial container unload', () => {
    const intake = new BaseIntake(1);
    expect(intake.receive([])).toEqual({ accepted: 0, duplicates: 0, kept: [] });
    const container = new PortableContainer(5);
    for (let i = 0; i < 3; i++) container.add(piece('copper'));
    const plan = intake.preview(container.items());
    const result = intake.receive(container.take(plan.acceptedIds));
    expect(result.accepted).toBe(1);
    expect(container.count).toBe(2);
    expect(intake.count + container.count).toBe(3);
  });

  it('lends pieces to the compactor and takes them back in order', () => {
    const intake = new BaseIntake(10);
    const batch = [piece('ferrous'), piece('ferrous'), piece('ferrous')];
    intake.receive(batch);
    expect(intake.take(contentId('ferrous'), 4)).toEqual([]);
    const load = intake.take(contentId('ferrous'), 2);
    expect(load.map((item) => item.id)).toEqual([batch[0]?.id, batch[1]?.id]);
    expect(intake.binCount(contentId('ferrous'))).toBe(1);
    intake.restore(load);
    intake.restore(load);
    expect(intake.take(contentId('ferrous'), 3).map((item) => item.id)).toEqual(batch.map((item) => item.id));
  });
});
