import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createFileSlots } from '../../electron/saveFiles';
import { commitSave, recoverSave, sealSave, type SaveEnvelope } from '../../src/persistence/saveSlots';

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

async function saveFolder(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'msc-saves-'));
  directories.push(root);
  return path.join(root, 'saves');
}

describe('file save slots', () => {
  it('creates the folder, commits revisions and keeps one backup file on the real file system', async () => {
    const folder = await saveFolder();
    const slots = createFileSlots(folder);
    expect(await recoverSave(slots)).toEqual({ status: 'empty' });
    let previous: SaveEnvelope | null = null;
    for (let n = 1; n <= 3; n += 1) {
      const sealed = sealSave('wld-file0001', { credits: n }, previous);
      expect(await commitSave(slots, sealed.text)).toEqual({ ok: true, revision: n });
      previous = sealed.envelope;
    }
    expect((await readdir(folder)).sort()).toEqual(['campaign.backup.json', 'campaign.json']);
    expect(await recoverSave(slots)).toMatchObject({
      status: 'ok',
      envelope: { revision: 3, payload: { credits: 3 } },
    });
  });

  it('recovers a completed pending file left by a crash before promotion, and ignores a torn one', async () => {
    const folder = await saveFolder();
    const slots = createFileSlots(folder);
    const one = sealSave('wld-file0001', { credits: 1 }, null);
    const two = sealSave('wld-file0001', { credits: 2 }, one.envelope);
    await commitSave(slots, one.text);
    await writeFile(path.join(folder, 'campaign.pending.json'), two.text, 'utf8');
    expect(await recoverSave(slots)).toMatchObject({ status: 'ok', source: 'pending', envelope: { revision: 2 } });
    await writeFile(path.join(folder, 'campaign.pending.json'), two.text.slice(0, 30), 'utf8');
    expect(await recoverSave(slots)).toMatchObject({ status: 'ok', source: 'current', envelope: { revision: 1 } });
  });
});
