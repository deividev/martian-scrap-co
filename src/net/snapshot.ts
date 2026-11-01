import { SNAPSHOT_LIMITS } from './protocol';

/**
 * Late-join snapshots (MSC-024). The host serializes the world at one revision to UTF-8 JSON and splits it into
 * base64 chunks; a guest reassembles them and checks size and checksum before the world is used. A snapshot that is
 * incomplete, too large, expired or corrupt is discarded and never becomes a playable world.
 */

/** Raw bytes per chunk; 9,000 bytes encode to exactly 12,000 base64 characters (`SNAPSHOT_LIMITS.chunkBase64`). */
const CHUNK_BYTES = (SNAPSHOT_LIMITS.chunkBase64 / 4) * 3;

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

/** FNV-1a 32-bit: detects corruption and chunks from another snapshot; it is not a security check. */
export function fnv1a(bytes: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(data: string): Uint8Array | undefined {
  try {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return undefined;
  }
}

export interface EncodedSnapshot {
  readonly bytes: number;
  readonly checksum: number;
  readonly chunks: readonly string[];
}

/** Serializes a world state; throws when it exceeds the snapshot size limit (it must never be sent partially). */
export function encodeSnapshot(state: unknown): EncodedSnapshot {
  const json = JSON.stringify(state);
  if (json === undefined) throw new TypeError('Snapshot state is not serializable');
  const bytes = encoder.encode(json);
  if (bytes.length > SNAPSHOT_LIMITS.maxBytes) throw new RangeError(`Snapshot of ${bytes.length} bytes is too large`);
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
    chunks.push(toBase64(bytes.subarray(offset, offset + CHUNK_BYTES)));
  }
  return { bytes: bytes.length, checksum: fnv1a(bytes), chunks };
}

export interface SnapshotHeader {
  readonly snapshot: number;
  readonly revision: number;
  readonly bytes: number;
  readonly chunks: number;
  readonly checksum: number;
}

export type ChunkResult = 'accepted' | 'duplicate' | 'foreign' | 'invalid';

export type AssemblyResult =
  | { readonly ok: true; readonly revision: number; readonly state: unknown }
  | { readonly ok: false; readonly error: 'incomplete' | 'expired' | 'size' | 'checksum' | 'malformed' };

/**
 * Collects the chunks of one snapshot. Chunks may arrive late, twice or out of order; anything that does not belong
 * to this snapshot or has the wrong size is refused, and nothing is usable until every chunk is present and the whole
 * matches the announced size and checksum within the deadline.
 */
export class SnapshotAssembler {
  readonly header: SnapshotHeader;
  readonly #parts: (Uint8Array | undefined)[];
  readonly #deadline: number;
  #received = 0;

  constructor(header: SnapshotHeader, now: number, timeout: number) {
    this.header = header;
    this.#parts = Array.from({ length: header.chunks }, () => undefined);
    this.#deadline = now + timeout;
  }

  /** Whether the header itself is consistent: the chunk count must match the announced size. */
  get plausible(): boolean {
    const { bytes, chunks } = this.header;
    return bytes <= SNAPSHOT_LIMITS.maxBytes && chunks === Math.ceil(bytes / CHUNK_BYTES);
  }

  get received(): number {
    return this.#received;
  }

  expired(now: number): boolean {
    return now > this.#deadline;
  }

  add(snapshot: number, index: number, data: string): ChunkResult {
    if (snapshot !== this.header.snapshot) return 'foreign';
    if (index >= this.header.chunks) return 'invalid';
    if (this.#parts[index]) return 'duplicate';
    const bytes = fromBase64(data);
    const last = index === this.header.chunks - 1;
    const expected = last ? this.header.bytes - CHUNK_BYTES * index : CHUNK_BYTES;
    if (!bytes || bytes.length !== expected) return 'invalid';
    this.#parts[index] = bytes;
    this.#received += 1;
    return 'accepted';
  }

  /** Indices still missing, lowest first, at most `limit`. */
  missing(limit: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.#parts.length && out.length < limit; i += 1) if (!this.#parts[i]) out.push(i);
    return out;
  }

  complete(now: number): AssemblyResult {
    if (this.expired(now)) return { ok: false, error: 'expired' };
    if (!this.plausible) return { ok: false, error: 'size' };
    if (this.#received < this.header.chunks) return { ok: false, error: 'incomplete' };
    const bytes = new Uint8Array(this.header.bytes);
    let offset = 0;
    for (const part of this.#parts) {
      if (!part) return { ok: false, error: 'incomplete' };
      bytes.set(part, offset);
      offset += part.length;
    }
    if (offset !== this.header.bytes) return { ok: false, error: 'size' };
    if (fnv1a(bytes) !== this.header.checksum) return { ok: false, error: 'checksum' };
    try {
      return { ok: true, revision: this.header.revision, state: JSON.parse(decoder.decode(bytes)) as unknown };
    } catch {
      return { ok: false, error: 'malformed' };
    }
  }
}
