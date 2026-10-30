import { describe, expect, it } from 'vitest';
import { contentId } from '../../src/domain/ids';
import { ToolLoadout } from '../../src/domain/toolLoadout';

const COLLECTOR = contentId('magnetic-collector');
const CUTTER = contentId('cutter');

describe('ToolLoadout', () => {
  it('starts on the first owned slot and refuses tools the player does not own', () => {
    const loadout = new ToolLoadout([COLLECTOR, CUTTER], [COLLECTOR]);
    expect(loadout.equipped).toBe(COLLECTOR);
    expect(loadout.equip(CUTTER)).toEqual({ ok: false, reason: 'not-owned' });
    expect(loadout.equipSlot(1)).toEqual({ ok: false, reason: 'not-owned' });
    expect(loadout.equipSlot(5)).toEqual({ ok: false, reason: 'unknown' });
    expect(loadout.equip(contentId('grabber'))).toEqual({ ok: false, reason: 'unknown' });
    expect(loadout.cycle()).toBe(COLLECTOR);
    expect(loadout.equipped).toBe(COLLECTOR);
  });

  it('equips granted tools by slot and cycles through owned ones with wrap-around', () => {
    const loadout = new ToolLoadout([COLLECTOR, CUTTER], [COLLECTOR]);
    expect(loadout.grant(CUTTER)).toBe(true);
    expect(loadout.grant(CUTTER)).toBe(false);
    expect(loadout.grant(contentId('grabber'))).toBe(false);
    expect(loadout.equipSlot(1)).toEqual({ ok: true, equipped: CUTTER });
    expect(loadout.cycle()).toBe(COLLECTOR);
    expect(loadout.cycle()).toBe(CUTTER);
  });

  it('rejects empty or duplicate slots and a loadout with nothing owned', () => {
    expect(() => new ToolLoadout([], [])).toThrow(RangeError);
    expect(() => new ToolLoadout([CUTTER, CUTTER], [CUTTER])).toThrow(RangeError);
    expect(() => new ToolLoadout([CUTTER], [COLLECTOR])).toThrow(RangeError);
  });
});
