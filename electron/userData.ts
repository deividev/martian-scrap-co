// Where the game keeps its data on this computer (saves, local settings, Chromium storage).
// Electron derives the folder from productName "Martian Scrap Co.", and a Windows folder name ending in a dot cannot
// be opened, renamed or deleted from Explorer, so the folder is named without the final dot. Saves from builds that
// used the dotted folder are copied over once (Node's fs reaches that folder; Explorer and PowerShell 5.1 do not).
import { cpSync, existsSync } from 'node:fs';
import path from 'node:path';

export const USER_DATA_FOLDER = 'Martian Scrap Co';
export const LEGACY_USER_DATA_FOLDER = 'Martian Scrap Co.';

export function resolveUserDataDir(appData: string): string {
  return path.join(appData, USER_DATA_FOLDER);
}

export type LegacySaveMigration = 'copied' | 'no-legacy' | 'already-present' | 'failed';

/** Copies the legacy `saves` folder once; never overwrites saves already in the new folder. The old copy is kept. */
export function migrateLegacySaves(appData: string): LegacySaveMigration {
  const legacy = path.join(appData, LEGACY_USER_DATA_FOLDER, 'saves');
  const current = path.join(resolveUserDataDir(appData), 'saves');
  if (existsSync(current)) return 'already-present';
  if (!existsSync(legacy)) return 'no-legacy';
  try {
    cpSync(legacy, current, { recursive: true, errorOnExist: true, force: false });
    return 'copied';
  } catch {
    return 'failed';
  }
}
