import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import type { SaveSlot, SlotBackend } from '../src/persistence/saveSlots.js';

const SLOT_FILES: Readonly<Record<SaveSlot, string>> = {
  current: 'campaign.json',
  backup: 'campaign.backup.json',
  pending: 'campaign.pending.json',
};

const isMissing = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ENOENT';

/**
 * Campaign save slots as files in one fixed directory (MSC-036): the renderer never names a path. Writes are
 * flushed to disk before they count; `move` is a rename, which replaces the target in one step.
 */
export function createFileSlots(directory: string): SlotBackend {
  const file = (slot: SaveSlot): string => path.join(directory, SLOT_FILES[slot]);
  return {
    async read(slot) {
      try {
        return await readFile(file(slot), 'utf8');
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    },
    async write(slot, text) {
      await mkdir(directory, { recursive: true });
      const handle = await open(file(slot), 'w');
      try {
        await handle.writeFile(text, 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }
    },
    async move(from, to) {
      await rename(file(from), file(to));
    },
    async remove(slot) {
      await rm(file(slot), { force: true });
    },
  };
}
