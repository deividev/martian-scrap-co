import { describe, expect, it } from 'vitest';
import { FIRST_PASS_CONTENT } from '../../src/content/firstPass';
import { parseContentPack } from '../../src/content/schema';
import { checkCompatibility } from '../../src/domain/materials';
import { contentId } from '../../src/domain/ids';

/** Deep copy of the first-pass pack that a test can corrupt. */
function pack(): {
  schemaVersion: number;
  tools: Record<string, unknown>[];
  materials: Record<string, unknown>[];
} {
  return structuredClone(FIRST_PASS_CONTENT);
}

function errorsOf(input: unknown): readonly string[] {
  const result = parseContentPack(input);
  return result.ok ? [] : result.errors;
}

describe('first-pass content', () => {
  it('validates and keeps the six approved material families', () => {
    const result = parseContentPack(FIRST_PASS_CONTENT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect([...result.pack.materials.keys()]).toEqual([
      'ferrous',
      'aluminum',
      'copper',
      'polymer',
      'heliofoil',
      'regolith-ceramic',
    ]);
  });

  it('makes only ferrous scrap compatible with the magnetic collector', () => {
    const result = parseContentPack(FIRST_PASS_CONTENT);
    if (!result.ok) throw new Error(result.errors.join('\n'));
    const magnet = result.pack.tools.get(contentId('magnetic-collector'));
    if (!magnet) throw new Error('missing magnet');
    const compatible = [...result.pack.materials.values()]
      .filter((material) => checkCompatibility(magnet, material, 'small').compatible)
      .map((material) => material.id);
    expect(compatible).toEqual(['ferrous']);
    const aluminum = result.pack.materials.get(contentId('aluminum'));
    if (!aluminum) throw new Error('missing aluminum');
    expect(checkCompatibility(magnet, aluminum, 'small')).toEqual({
      compatible: false,
      reason: 'material-not-collectable-by-tool',
    });
    expect(checkCompatibility(magnet, aluminum, 'large')).toEqual({ compatible: false, reason: 'scale-not-handled' });
  });
});

describe('content rejection', () => {
  it.each([
    ['negative sale value', -1],
    ['fractional credits', 2.5],
    ['NaN', Number.NaN],
    ['infinity', Number.POSITIVE_INFINITY],
    ['string number', '4'],
  ])('rejects %s', (_label, value) => {
    const data = pack();
    data.materials[0] = { ...data.materials[0], saleValuePerUnit: value };
    expect(errorsOf(data).length).toBeGreaterThan(0);
  });

  it.each([0, -3, Number.NaN, Number.NEGATIVE_INFINITY])('rejects non-positive or non-finite mass %j', (value) => {
    const data = pack();
    data.materials[0] = { ...data.materials[0], massPerUnit: value };
    expect(errorsOf(data).length).toBeGreaterThan(0);
  });

  it('rejects unknown fields', () => {
    const data = pack();
    data.materials[0] = { ...data.materials[0], recipe: ['ferrous'] };
    expect(errorsOf(data).join()).toMatch(/recipe|unrecognized/i);
    expect(errorsOf({ ...data, extra: true }).length).toBeGreaterThan(0);
  });

  it('rejects unknown tool references and handling scales', () => {
    const data = pack();
    data.materials[1] = { ...data.materials[1], collectableBy: ['vacuum'] };
    expect(errorsOf(data).join()).toMatch(/unknown tool vacuum/);
    const scales = pack();
    scales.tools[0] = { ...scales.tools[0], handles: ['huge'] };
    expect(errorsOf(scales).length).toBeGreaterThan(0);
  });

  it('rejects duplicate ids and invalid id formats', () => {
    const data = pack();
    data.materials.push({ ...data.materials[0] });
    expect(errorsOf(data).join()).toMatch(/duplicate material id: ferrous/);
    const bad = pack();
    bad.tools[0] = { ...bad.tools[0], id: 'Hands' };
    expect(errorsOf(bad).length).toBeGreaterThan(0);
  });

  it('rejects a material that only a purchasable tool can collect (PRD-011 softlock guard)', () => {
    const data = pack();
    data.materials[1] = { ...data.materials[1], collectableBy: ['grabber'] };
    expect(errorsOf(data).join()).toMatch(/no free-baseline tool/);
  });

  it('rejects a tool that cannot collect small pieces as a small collector', () => {
    const data = pack();
    data.materials[0] = { ...data.materials[0], collectableBy: ['hands', 'cart'] };
    expect(errorsOf(data).join()).toMatch(/cannot collect small pieces/);
  });

  it('rejects an unsupported schema version', () => {
    expect(errorsOf({ ...pack(), schemaVersion: 2 }).length).toBeGreaterThan(0);
  });
});
