import { describe, expect, it } from 'vitest';
import { CUTTER_TIMING, CutProgress, partCutSeconds } from '../../src/simulation/handling/cutterTool';

describe('cutter timing', () => {
  it('grows with mass and is clamped', () => {
    expect(partCutSeconds(0)).toBe(CUTTER_TIMING.baseSeconds);
    expect(partCutSeconds(10)).toBeCloseTo(0.8);
    expect(partCutSeconds(1000)).toBe(CUTTER_TIMING.maxSeconds);
    expect(partCutSeconds(Number.NaN)).toBe(CUTTER_TIMING.baseSeconds);
  });
});

describe('CutProgress', () => {
  it('completes once after holding on one target for the required time', () => {
    const cut = new CutProgress();
    expect(cut.update('joint:a', true, 0.4, 0.8).progress).toBeCloseTo(0.5);
    const done = cut.update('joint:a', true, 0.4, 0.8);
    expect(done).toEqual({ progress: 1, done: true });
    expect(cut.target).toBeNull();
    expect(cut.update('joint:a', true, 0.1, 0.8).done).toBe(false);
  });

  it('restarts when use is released or the aim moves to another target', () => {
    const cut = new CutProgress();
    cut.update('joint:a', true, 0.6, 0.8);
    expect(cut.update('joint:a', false, 0.1, 0.8)).toEqual({ progress: 0, done: false });
    cut.update('joint:a', true, 0.6, 0.8);
    expect(cut.update('joint:b', true, 0.1, 0.8).progress).toBeCloseTo(0.125);
    expect(cut.update(null, true, 0.1, 0.8).progress).toBe(0);
  });

  it('cuts faster at higher cutter speed', () => {
    const cut = new CutProgress();
    expect(cut.update('prop:x', true, 0.5, 1, 2).done).toBe(true);
  });
});
