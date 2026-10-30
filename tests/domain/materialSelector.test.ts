import { describe, expect, it } from 'vitest';
import { contentId } from '../../src/domain/ids';
import { MaterialSelector } from '../../src/domain/materialSelector';

const TIERS = [[contentId('ferrous')], [contentId('aluminum'), contentId('copper')]];

describe('MaterialSelector', () => {
  it('starts on the first base material and unlocks tiers cumulatively', () => {
    const selector = new MaterialSelector(TIERS, () => false);
    expect(selector.selected).toBe('ferrous');
    expect(selector.available()).toEqual(['ferrous']);
    expect(selector.select(contentId('copper'))).toEqual({ ok: false, reason: 'unavailable' });
    expect(selector.upgrade()).toEqual(['aluminum', 'copper']);
    expect(selector.available()).toEqual(['ferrous', 'aluminum', 'copper']);
    expect(selector.upgrade()).toEqual([]);
    expect(selector.tierOf(contentId('copper'))).toBe(1);
    expect(selector.tierOf(contentId('polymer'))).toBeUndefined();
  });

  it('cycles with wrap-around and refuses to switch while locked', () => {
    let locked = false;
    const selector = new MaterialSelector(TIERS, () => locked, 1);
    expect(selector.cycle(-1)).toEqual({ ok: true, selected: 'copper' });
    expect(selector.cycle(1)).toEqual({ ok: true, selected: 'ferrous' });
    locked = true;
    expect(selector.cycle(1)).toEqual({ ok: false, reason: 'locked' });
    expect(selector.select(contentId('ferrous'))).toEqual({ ok: true, selected: 'ferrous' });
    expect(selector.accepts(contentId('ferrous'))).toBe(true);
    expect(selector.accepts(contentId('aluminum'))).toBe(false);
  });

  it('rejects empty tiers and out-of-range starting tiers', () => {
    expect(() => new MaterialSelector([], () => false)).toThrow(RangeError);
    expect(() => new MaterialSelector(TIERS, () => false, 2)).toThrow(RangeError);
  });
});
