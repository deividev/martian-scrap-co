import {
  commitSave,
  openSave,
  recoverSave,
  type CommitResult,
  type RecoverResult,
  type SaveSlot,
  type SlotBackend,
} from './saveSlots';

export type WriteResult = CommitResult | { readonly ok: false; readonly reason: 'failed' };

/** Where the host campaign is kept: files through the desktop shell, or browser storage in a dev page. */
export interface CampaignStore {
  readonly kind: 'file' | 'browser';
  load(): Promise<RecoverResult>;
  write(text: string): Promise<WriteResult>;
}

const RECOVER_STATUSES: ReadonlySet<unknown> = new Set(['empty', 'ok', 'locked', 'unreadable']);
const SLOTS: ReadonlySet<unknown> = new Set(['current', 'backup', 'pending']);

/** Checks what the main process returned; an `ok` envelope is verified again from its own checksum. */
export function parseRecoverResult(value: unknown): RecoverResult | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (!RECOVER_STATUSES.has(record['status'])) return null;
  const slots = (key: string): SaveSlot[] | null => {
    const list = record[key];
    return Array.isArray(list) && list.every((slot) => SLOTS.has(slot)) ? (list as SaveSlot[]) : null;
  };
  switch (record['status']) {
    case 'empty':
      return { status: 'empty' };
    case 'locked':
      return SLOTS.has(record['slot']) ? { status: 'locked', slot: record['slot'] as SaveSlot } : null;
    case 'unreadable': {
      const ignored = slots('ignored');
      return ignored ? { status: 'unreadable', ignored } : null;
    }
    default: {
      const ignored = slots('ignored');
      const reopened = openSave(JSON.stringify(record['envelope']));
      if (!ignored || !SLOTS.has(record['source']) || !reopened.ok) return null;
      return { status: 'ok', envelope: reopened.envelope, source: record['source'] as SaveSlot, ignored };
    }
  }
}

const WRITE_FAILURES: ReadonlySet<unknown> = new Set([
  'invalid',
  'too-large',
  'locked',
  'stale',
  'other-world',
  'failed',
]);

export function parseWriteResult(value: unknown): WriteResult {
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    if (record['ok'] === true && typeof record['revision'] === 'number') {
      return { ok: true, revision: record['revision'] };
    }
    if (record['ok'] === false && WRITE_FAILURES.has(record['reason'])) return value as WriteResult;
  }
  return { ok: false, reason: 'failed' };
}

export function bridgeCampaignStore(bridge: {
  loadSave(): Promise<unknown>;
  writeSave(text: string): Promise<unknown>;
}): CampaignStore {
  return {
    kind: 'file',
    load: async () => parseRecoverResult(await bridge.loadSave()) ?? { status: 'unreadable', ignored: [] },
    write: async (text) => {
      try {
        return parseWriteResult(await bridge.writeSave(text));
      } catch {
        return { ok: false, reason: 'failed' };
      }
    },
  };
}

/** Browser dev page only: the same slot protocol over key/value storage. */
export function storageSlots(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
  prefix: string,
): SlotBackend {
  const key = (slot: SaveSlot): string => `${prefix}.${slot}`;
  return {
    read: (slot) => Promise.resolve(storage.getItem(key(slot))),
    write: (slot, text) => Promise.resolve(storage.setItem(key(slot), text)),
    move: (from, to) => {
      const text = storage.getItem(key(from));
      if (text === null) return Promise.reject(new Error(`Nothing in ${from}`));
      storage.setItem(key(to), text);
      storage.removeItem(key(from));
      return Promise.resolve();
    },
    remove: (slot) => Promise.resolve(storage.removeItem(key(slot))),
  };
}

export function slotCampaignStore(kind: CampaignStore['kind'], backend: SlotBackend): CampaignStore {
  return {
    kind,
    load: () => recoverSave(backend),
    write: async (text) => {
      try {
        return await commitSave(backend, text);
      } catch {
        return { ok: false, reason: 'failed' };
      }
    },
  };
}
