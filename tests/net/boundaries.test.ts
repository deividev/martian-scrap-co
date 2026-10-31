import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sources = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? sources(join(dir, entry.name)) : entry.name.endsWith('.ts') ? [join(dir, entry.name)] : [],
  );

const importsOf = (file: string): string[] =>
  [...readFileSync(file, 'utf8').matchAll(/from\s+'([^']+)'/g)].map((match) => match[1] ?? '');

describe('net and domain boundaries', () => {
  it('keeps the protocol, transport ports and domain free of Steam, Electron and rendering', () => {
    const files = [...sources('src/net'), ...sources('src/domain')];
    expect(files.length).toBeGreaterThan(3);
    for (const file of files) {
      for (const specifier of importsOf(file)) {
        expect(specifier, `${file} imports ${specifier}`).not.toMatch(/steam|electron|three|rapier|presentation/i);
      }
    }
  });
});
