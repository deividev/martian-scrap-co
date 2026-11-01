// Save envelope and atomic slot protocol (MSC-036, PRD-021, architecture §7). Shared by the Electron main process
// (file slots) and the renderer (browser dev slots), so this module has no imports and knows nothing about the
// campaign payload it carries.

export const SAVE_FORMAT = 'martian-scrap-co/campaign';
/** Bumped by migrations; a save with a higher version is never loaded or overwritten. */
export const SAVE_SCHEMA_VERSION = 1;
/** Checksums of earlier revisions kept in each save, to tell a later revision from a divergent history. */
export const SAVE_HISTORY_LENGTH = 16;
/** Upper bound for one save file, bytes of UTF-16 text (checked before writing and on the IPC boundary). */
export const MAX_SAVE_TEXT_LENGTH = 8 * 1024 * 1024;

export interface SaveEnvelope {
  readonly format: typeof SAVE_FORMAT;
  readonly schemaVersion: number;
  /** Campaign world id (`wld-…`): one per campaign, never shared with another campaign. */
  readonly worldId: string;
  /** Increases by one with every committed save of this world. */
  readonly revision: number;
  /** Checksums of previous revisions, newest first (bounded ancestry for conflict detection). */
  readonly history: readonly string[];
  readonly checksum: string;
  readonly payload: unknown;
}

export type OpenResult =
  | { readonly ok: true; readonly envelope: SaveEnvelope }
  | { readonly ok: false; readonly reason: 'not-a-save' | 'corrupt' | 'newer-version' };

/** FNV-1a, 32 bit: detects torn or edited files, not tampering. */
export function checksumOf(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function contentChecksum(
  schemaVersion: number,
  worldId: string,
  revision: number,
  history: readonly string[],
  payload: unknown,
): string {
  return checksumOf(JSON.stringify([schemaVersion, worldId, revision, history, payload]));
}

/** The next revision of a world, chained to the previous one (or revision 1 of a new campaign). */
export function sealSave(
  worldId: string,
  payload: unknown,
  previous: Pick<SaveEnvelope, 'revision' | 'checksum' | 'history'> | null,
): { readonly envelope: SaveEnvelope; readonly text: string } {
  const revision = previous ? previous.revision + 1 : 1;
  const history = previous ? [previous.checksum, ...previous.history].slice(0, SAVE_HISTORY_LENGTH) : [];
  const envelope: SaveEnvelope = {
    format: SAVE_FORMAT,
    schemaVersion: SAVE_SCHEMA_VERSION,
    worldId,
    revision,
    history,
    checksum: contentChecksum(SAVE_SCHEMA_VERSION, worldId, revision, history, payload),
    payload,
  };
  return { envelope, text: JSON.stringify(envelope) };
}

/** Parses and verifies a save; the payload itself is validated by its owner. */
export function openSave(text: string): OpenResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'corrupt' };
  }
  if (typeof data !== 'object' || data === null) return { ok: false, reason: 'not-a-save' };
  const record = data as Record<string, unknown>;
  if (record['format'] !== SAVE_FORMAT) return { ok: false, reason: 'not-a-save' };
  const { schemaVersion, worldId, revision, history, checksum, payload } = record;
  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion) || schemaVersion < 1) {
    return { ok: false, reason: 'corrupt' };
  }
  if (schemaVersion > SAVE_SCHEMA_VERSION) return { ok: false, reason: 'newer-version' };
  if (
    typeof worldId !== 'string' ||
    !/^wld-[0-9a-z]{8,32}$/.test(worldId) ||
    typeof revision !== 'number' ||
    !Number.isSafeInteger(revision) ||
    revision < 1 ||
    !Array.isArray(history) ||
    history.length > SAVE_HISTORY_LENGTH ||
    !history.every((entry) => typeof entry === 'string') ||
    typeof checksum !== 'string' ||
    payload === undefined
  ) {
    return { ok: false, reason: 'corrupt' };
  }
  const chain: string[] = history;
  if (contentChecksum(schemaVersion, worldId, revision, chain, payload) !== checksum) {
    return { ok: false, reason: 'corrupt' };
  }
  return {
    ok: true,
    envelope: { format: SAVE_FORMAT, schemaVersion, worldId, revision, history: chain, checksum, payload },
  };
}

export type HistoryRelation = 'same' | 'ahead' | 'behind' | 'diverged' | 'other-world';

/**
 * How save `a` relates to save `b` of possibly the same world (a future Cloud copy, another device). Ancestry,
 * never timestamps, decides: a divergent history needs an explicit player choice with both summaries and a backup.
 * A revision gap beyond the bounded history also counts as diverged (never resolved silently).
 */
export function historyRelation(
  a: Pick<SaveEnvelope, 'worldId' | 'revision' | 'checksum' | 'history'>,
  b: Pick<SaveEnvelope, 'worldId' | 'revision' | 'checksum' | 'history'>,
): HistoryRelation {
  if (a.worldId !== b.worldId) return 'other-world';
  if (a.checksum === b.checksum) return 'same';
  if (a.revision > b.revision && a.history[a.revision - b.revision - 1] === b.checksum) return 'ahead';
  if (b.revision > a.revision && b.history[b.revision - a.revision - 1] === a.checksum) return 'behind';
  return 'diverged';
}

export type SaveSlot = 'current' | 'backup' | 'pending';

/** Storage of the three slots. `move` replaces the target; every operation may throw. */
export interface SlotBackend {
  read(slot: SaveSlot): Promise<string | null>;
  write(slot: SaveSlot, text: string): Promise<void>;
  move(from: SaveSlot, to: SaveSlot): Promise<void>;
  remove(slot: SaveSlot): Promise<void>;
}

export type RecoverResult =
  | { readonly status: 'empty' }
  | {
      readonly status: 'ok';
      readonly envelope: SaveEnvelope;
      readonly source: SaveSlot;
      /** Slots that held something unusable and were ignored (reported, never deleted here). */
      readonly ignored: readonly SaveSlot[];
    }
  /** A save from a newer game version exists: nothing is loaded and nothing may be written. */
  | { readonly status: 'locked'; readonly slot: SaveSlot }
  /** Something is stored but no slot is usable: nothing may be written until the player decides. */
  | { readonly status: 'unreadable'; readonly ignored: readonly SaveSlot[] };

const SLOT_PREFERENCE: readonly SaveSlot[] = ['current', 'pending', 'backup'];

/**
 * Picks the last valid committed revision: the highest revision among valid slots of the current world (a
 * completed pending write counts; a torn one is ignored). Runs at startup, after any crash or power loss.
 */
export async function recoverSave(backend: SlotBackend): Promise<RecoverResult> {
  const opened: { slot: SaveSlot; result: OpenResult }[] = [];
  for (const slot of SLOT_PREFERENCE) {
    const text = await backend.read(slot);
    if (text !== null) opened.push({ slot, result: openSave(text) });
  }
  if (opened.length === 0) return { status: 'empty' };
  const newer = opened.find((entry) => !entry.result.ok && entry.result.reason === 'newer-version');
  if (newer) return { status: 'locked', slot: newer.slot };
  const valid = opened.flatMap((entry) =>
    entry.result.ok ? [{ slot: entry.slot, envelope: entry.result.envelope }] : [],
  );
  const world = valid[0]?.envelope.worldId;
  let best: (typeof valid)[number] | undefined;
  for (const entry of valid) {
    if (entry.envelope.worldId !== world) continue;
    if (!best || entry.envelope.revision > best.envelope.revision) best = entry;
  }
  const ignored = opened
    .filter((entry) => !entry.result.ok || entry.result.envelope.worldId !== world)
    .map((entry) => entry.slot);
  if (!best) {
    // A torn pending write alone is the leftover of a first save that never completed.
    return ignored.every((slot) => slot === 'pending') ? { status: 'empty' } : { status: 'unreadable', ignored };
  }
  return { status: 'ok', envelope: best.envelope, source: best.slot, ignored };
}

export type CommitResult =
  | { readonly ok: true; readonly revision: number }
  | { readonly ok: false; readonly reason: 'invalid' | 'too-large' | 'locked' | 'stale' | 'other-world' };

/**
 * Commits one revision atomically: write the pending slot, read it back, keep the current save as backup, then
 * promote the pending slot. A crash at any step leaves the previous or the new revision recoverable. Refuses to
 * replace a newer-version save, an older revision over a newer one, or a different campaign.
 */
export async function commitSave(backend: SlotBackend, text: string): Promise<CommitResult> {
  if (text.length > MAX_SAVE_TEXT_LENGTH) return { ok: false, reason: 'too-large' };
  const incoming = openSave(text);
  if (!incoming.ok) return { ok: false, reason: 'invalid' };
  const existing = await recoverSave(backend);
  if (existing.status === 'locked' || existing.status === 'unreadable') return { ok: false, reason: 'locked' };
  if (existing.status === 'ok') {
    if (existing.envelope.worldId !== incoming.envelope.worldId) return { ok: false, reason: 'other-world' };
    if (existing.envelope.revision >= incoming.envelope.revision) return { ok: false, reason: 'stale' };
  }
  await backend.write('pending', text);
  if ((await backend.read('pending')) !== text) throw new Error('Save read-back mismatch');
  const current = await backend.read('current');
  if (current !== null) {
    // Only a good current save becomes the backup; a torn one must not replace a good backup.
    if (openSave(current).ok) await backend.move('current', 'backup');
    else await backend.remove('current');
  }
  await backend.move('pending', 'current');
  return { ok: true, revision: incoming.envelope.revision };
}
