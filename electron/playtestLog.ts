// DEV-ONLY playtest log (MSC-039 support). Remove or keep disabled for release (MSC-118, pending register).
// Off unless MSC_PLAYTEST_LOG=1; then the renderer's observations are appended as JSON lines to one local file per
// session in Documents/Martian Scrap Co playtest logs. Nothing leaves the computer.
import { appendFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

/** One file stops growing at this size (a long session logs far less). */
export const PLAYTEST_LOG_MAX_BYTES = 5 * 1024 * 1024;
/** Entries accepted per append call (the renderer flushes every few seconds). */
export const PLAYTEST_APPEND_MAX_ENTRIES = 200;

export function isPlaytestLogEnabled(env: Readonly<Record<string, string | undefined>>): boolean {
  return env['MSC_PLAYTEST_LOG'] === '1';
}

export interface PlaytestLogStatus {
  readonly enabled: boolean;
  /** File name only (never a full path, which would expose the user folder). */
  readonly file: string | null;
}

export interface PlaytestLog {
  status(): PlaytestLogStatus;
  /** Appends validated entries; returns how many were written (0 when disabled, invalid or full). */
  append(entries: unknown): Promise<number>;
}

function isEntry(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>)['t'] === 'number' &&
    typeof (value as Record<string, unknown>)['type'] === 'string'
  );
}

export function createPlaytestLog(enabled: boolean, folder: string, now: Date = new Date()): PlaytestLog {
  const file = enabled ? `playtest-${now.toISOString().replace(/[:.]/g, '-')}.jsonl` : null;
  let queue: Promise<unknown> = Promise.resolve();
  return {
    status: () => ({ enabled, file }),
    append: (entries) => {
      if (!file || !Array.isArray(entries)) return Promise.resolve(0);
      const valid = entries.slice(0, PLAYTEST_APPEND_MAX_ENTRIES).filter(isEntry);
      if (valid.length === 0) return Promise.resolve(0);
      const text = valid.map((entry) => JSON.stringify(entry)).join('\n') + '\n';
      const target = path.join(folder, file);
      const run = async (): Promise<number> => {
        await mkdir(folder, { recursive: true });
        const size = await stat(target).then(
          (info) => info.size,
          () => 0,
        );
        if (size + text.length > PLAYTEST_LOG_MAX_BYTES) return 0;
        await appendFile(target, text, 'utf8');
        return valid.length;
      };
      const next = queue.then(run, run);
      queue = next.catch(() => undefined);
      return next.catch(() => 0);
    },
  };
}
