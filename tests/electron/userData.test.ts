import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LEGACY_USER_DATA_FOLDER, migrateLegacySaves, resolveUserDataDir } from '../../electron/userData';

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

async function appData(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'msc-appdata-'));
  directories.push(root);
  return root;
}

describe('user data folder', () => {
  it('has no trailing dot (Explorer cannot open such folders)', async () => {
    const root = await appData();
    expect(path.basename(resolveUserDataDir(root))).toBe('Martian Scrap Co');
    expect(resolveUserDataDir(root).endsWith('.')).toBe(false);
  });

  it('copies legacy saves once and never overwrites newer ones', async () => {
    const root = await appData();
    expect(migrateLegacySaves(root)).toBe('no-legacy');
    const legacy = path.join(root, LEGACY_USER_DATA_FOLDER, 'saves');
    await mkdir(legacy, { recursive: true });
    await writeFile(path.join(legacy, 'campaign.json'), 'old');
    expect(migrateLegacySaves(root)).toBe('copied');
    const current = path.join(resolveUserDataDir(root), 'saves', 'campaign.json');
    expect(await readFile(current, 'utf8')).toBe('old');
    await writeFile(current, 'new');
    expect(migrateLegacySaves(root)).toBe('already-present');
    expect(await readFile(current, 'utf8')).toBe('new');
    expect(await readFile(path.join(legacy, 'campaign.json'), 'utf8')).toBe('old');
  });
});
