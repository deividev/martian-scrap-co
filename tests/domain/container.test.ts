import { describe, expect, it } from 'vitest';
import { PortableContainer, type ContainerItem } from '../../src/domain/container';
import { EntityIdAllocator, contentId } from '../../src/domain/ids';

const ids = new EntityIdAllocator();
function item(material = 'ferrous', massKg = 1.5): ContainerItem {
  return { id: ids.allocate(), materialId: contentId(material), massKg };
}

describe('PortableContainer', () => {
  it('starts empty and accepts up to capacity', () => {
    const container = new PortableContainer(3);
    expect(container.count).toBe(0);
    expect(container.isFull).toBe(false);
    expect(container.add(item()).ok).toBe(true);
    expect(container.add(item()).ok).toBe(true);
    expect(container.isFull).toBe(false);
    expect(container.add(item()).ok).toBe(true);
    expect(container.isFull).toBe(true);
  });

  it('refuses intake when full without losing or changing contents', () => {
    const container = new PortableContainer(1);
    const first = item();
    container.add(first);
    const overflow = item();
    expect(container.canAccept(overflow.id)).toBe(false);
    expect(container.add(overflow)).toEqual({ ok: false, reason: 'full' });
    expect(container.count).toBe(1);
    expect(container.has(overflow.id)).toBe(false);
    expect(container.has(first.id)).toBe(true);
  });

  it('counts a repeated collect request for the same piece only once', () => {
    const container = new PortableContainer(5);
    const piece = item();
    expect(container.add(piece).ok).toBe(true);
    expect(container.add(piece)).toEqual({ ok: false, reason: 'duplicate' });
    expect(container.add({ ...piece })).toEqual({ ok: false, reason: 'duplicate' });
    expect(container.count).toBe(1);
    expect(container.canAccept(piece.id)).toBe(false);
  });

  it('summarizes batches per material and unloads every item exactly once', () => {
    const container = new PortableContainer(10);
    const items = [item('ferrous', 2), item('ferrous', 1), item('copper', 3)];
    for (const entry of items) container.add(entry);
    expect(container.batches()).toEqual([
      { materialId: 'ferrous', count: 2, massKg: 3 },
      { materialId: 'copper', count: 1, massKg: 3 },
    ]);
    const unloaded = container.unloadAll();
    expect(unloaded.map((entry) => entry.id)).toEqual(items.map((entry) => entry.id));
    expect(container.count).toBe(0);
    expect(container.unloadAll()).toEqual([]);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid capacity %j', (capacity) => {
    expect(() => new PortableContainer(capacity)).toThrow(RangeError);
  });

  it('rejects non-positive or non-finite masses', () => {
    const container = new PortableContainer(3);
    expect(() => container.add(item('ferrous', 0))).toThrow(RangeError);
    expect(() => container.add(item('ferrous', Number.NaN))).toThrow(RangeError);
    expect(container.count).toBe(0);
  });
});
