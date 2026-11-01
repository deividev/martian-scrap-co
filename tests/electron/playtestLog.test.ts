import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createPlaytestLog, isPlaytestLogEnabled, PLAYTEST_APPEND_MAX_ENTRIES } from '../../electron/playtestLog';

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

async function logFolder(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'msc-playtest-'));
  directories.push(root);
  return path.join(root, 'playtest-logs');
}

describe('dev playtest log', () => {
  it('is on only with MSC_PLAYTEST_LOG=1', () => {
    expect(isPlaytestLogEnabled({ MSC_PLAYTEST_LOG: '1' })).toBe(true);
    expect(isPlaytestLogEnabled({})).toBe(false);
    expect(isPlaytestLogEnabled({ MSC_PLAYTEST_LOG: 'true' })).toBe(false);
  });

  it('writes nothing and creates no folder when disabled', async () => {
    const folder = await logFolder();
    const log = createPlaytestLog(false, folder);
    expect(log.status()).toEqual({ enabled: false, file: null });
    expect(await log.append([{ t: 0, type: 'job' }])).toBe(0);
    await expect(readdir(folder)).rejects.toThrow();
  });

  it('appends valid entries as JSON lines to one session file and drops malformed ones', async () => {
    const folder = await logFolder();
    const log = createPlaytestLog(true, folder, new Date('2026-11-01T18:30:00.000Z'));
    const status = log.status();
    expect(status.file).toBe('playtest-2026-11-01T18-30-00-000Z.jsonl');
    expect(await log.append([{ t: 0, type: 'session-start' }, { t: 'x', type: 1 }, 'text', [1]])).toBe(1);
    expect(await log.append([{ t: 2.5, type: 'milestone', id: 'M1' }])).toBe(1);
    expect(await log.append('not an array')).toBe(0);
    const lines = (await readFile(path.join(folder, status.file ?? ''), 'utf8')).trim().split('\n');
    expect(lines.map((line) => JSON.parse(line) as unknown)).toEqual([
      { t: 0, type: 'session-start' },
      { t: 2.5, type: 'milestone', id: 'M1' },
    ]);
  });

  it('caps the entries taken from one call', async () => {
    const folder = await logFolder();
    const log = createPlaytestLog(true, folder);
    const many = Array.from({ length: PLAYTEST_APPEND_MAX_ENTRIES + 50 }, (_, t) => ({ t, type: 'job' }));
    expect(await log.append(many)).toBe(PLAYTEST_APPEND_MAX_ENTRIES);
  });
});
