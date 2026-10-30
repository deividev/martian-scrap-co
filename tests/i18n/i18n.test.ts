import { describe, expect, it } from 'vitest';
import { FIRST_PASS_CONTENT } from '../../src/content/firstPass';
import { I18n, LOCALES, STRINGS, isStringKey, localeFromLanguage } from '../../src/i18n/i18n';
import { TEST_YARD_ROVER, TEST_YARD_ROVER_LAYOUT, createTestYardProps } from '../../src/simulation/yard/testYard';
import { EntityIdAllocator } from '../../src/domain/ids';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    data,
  };
}

describe('string table', () => {
  it('has a non-empty translation for every key in every language with the same placeholders', () => {
    for (const [key, entry] of Object.entries(STRINGS)) {
      const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      for (const locale of LOCALES) expect(entry[locale].trim(), `${key}.${locale}`).not.toBe('');
      expect(placeholders(entry.es), key).toEqual(placeholders(entry.en));
    }
  });

  it('covers every content material and tool, test prop, rover fragment and joint', () => {
    const keys = [
      ...FIRST_PASS_CONTENT.materials.map((material) => `material.${material.id}`),
      ...FIRST_PASS_CONTENT.tools.map((tool) => `tool.${tool.id}`),
      ...createTestYardProps(new EntityIdAllocator()).flatMap((prop) => prop.nameKeys ?? []),
      ...Object.values(TEST_YARD_ROVER_LAYOUT.fragmentNameKeys ?? {}),
      ...TEST_YARD_ROVER.joints.map((joint) => `joint.${joint.id}`),
    ];
    for (const key of keys) expect(isStringKey(key), key).toBe(true);
  });
});

describe('I18n', () => {
  it('translates and fills placeholders in both languages', () => {
    const i18n = new I18n('es');
    expect(i18n.t('container.status', { count: 3, capacity: 20 })).toBe('Contenedor 3/20');
    i18n.setLocale('en');
    expect(i18n.t('container.status', { count: 3, capacity: 20 })).toBe('Container 3/20');
    expect(i18n.tKey('material.copper', 'x')).toBe('Copper');
    expect(i18n.tKey('material.unknown', 'Fallback')).toBe('Fallback');
  });

  it('detects the saved choice first, then the system language', () => {
    expect(I18n.detect(memoryStorage({ 'msc.locale': 'en' }), 'es-ES').locale).toBe('en');
    expect(I18n.detect(memoryStorage(), 'es-MX').locale).toBe('es');
    expect(I18n.detect(memoryStorage(), 'de-DE').locale).toBe('en');
    expect(I18n.detect(memoryStorage({ 'msc.locale': 'fr' }), 'es').locale).toBe('es');
    expect(localeFromLanguage(undefined)).toBe('en');
  });

  it('remembers a toggle and survives blocked storage', () => {
    const storage = memoryStorage();
    const i18n = new I18n('en', storage);
    expect(i18n.toggle()).toBe('es');
    expect(storage.data.get('msc.locale')).toBe('es');
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const fallback = I18n.detect(blocked, 'es');
    expect(fallback.locale).toBe('es');
    expect(() => fallback.toggle()).not.toThrow();
  });
});
