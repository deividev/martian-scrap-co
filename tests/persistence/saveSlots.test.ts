import { describe, expect, it } from 'vitest';
import {
  commitSave,
  historyRelation,
  openSave,
  recoverSave,
  sealSave,
  SAVE_SCHEMA_VERSION,
  type SaveEnvelope,
  type SaveSlot,
  type SlotBackend,
} from '../../src/persistence/saveSlots';

const WORLD = 'wld-test0001';

/** In-memory slots; `failAfter` throws on the n-th mutating operation (a crash at that point). */
class MemorySlots implements SlotBackend {
  readonly slots = new Map<SaveSlot, string>();
  #failAfter = Infinity;
  #ops = 0;

  crashAfter(operations: number): void {
    this.#failAfter = operations;
    this.#ops = 0;
  }

  read(slot: SaveSlot): Promise<string | null> {
    return Promise.resolve(this.slots.get(slot) ?? null);
  }
  write(slot: SaveSlot, text: string): Promise<void> {
    this.#tick();
    this.slots.set(slot, text);
    return Promise.resolve();
  }
  move(from: SaveSlot, to: SaveSlot): Promise<void> {
    this.#tick();
    const text = this.slots.get(from);
    if (text === undefined) throw new Error(`nothing in ${from}`);
    this.slots.set(to, text);
    this.slots.delete(from);
    return Promise.resolve();
  }
  remove(slot: SaveSlot): Promise<void> {
    this.#tick();
    this.slots.delete(slot);
    return Promise.resolve();
  }
  #tick(): void {
    this.#ops += 1;
    if (this.#ops > this.#failAfter) throw new Error('simulated crash');
  }
}

function chain(
  count: number,
  payload = (n: number) => ({ credits: n * 10 }),
): { envelope: SaveEnvelope; text: string }[] {
  const out: { envelope: SaveEnvelope; text: string }[] = [];
  for (let n = 1; n <= count; n += 1) out.push(sealSave(WORLD, payload(n), out[n - 2]?.envelope ?? null));
  return out;
}

describe('save envelope', () => {
  it('round-trips and chains revisions', () => {
    const [first, second] = chain(2);
    expect(first?.envelope).toMatchObject({ revision: 1, history: [] });
    expect(second?.envelope).toMatchObject({ revision: 2, history: [first?.envelope.checksum] });
    expect(openSave(second?.text ?? '')).toEqual({ ok: true, envelope: second?.envelope });
  });

  it('rejects torn, edited and foreign files and recognizes a newer schema', () => {
    const [save] = chain(1);
    const text = save?.text ?? '';
    expect(openSave(text.slice(0, text.length - 5))).toEqual({ ok: false, reason: 'corrupt' });
    expect(openSave(text.replace('"credits":10', '"credits":99999'))).toEqual({ ok: false, reason: 'corrupt' });
    expect(openSave('{"hello":1}')).toEqual({ ok: false, reason: 'not-a-save' });
    const newer = text.replace(`"schemaVersion":${SAVE_SCHEMA_VERSION}`, `"schemaVersion":${SAVE_SCHEMA_VERSION + 1}`);
    expect(openSave(newer)).toEqual({ ok: false, reason: 'newer-version' });
  });

  it('decides history relations from ancestry, never timestamps', () => {
    const saves = chain(3).map((save) => save.envelope);
    const [one, two, three] = saves as [SaveEnvelope, SaveEnvelope, SaveEnvelope];
    const fork = sealSave(WORLD, { credits: 999 }, one).envelope;
    expect(historyRelation(three, one)).toBe('ahead');
    expect(historyRelation(one, three)).toBe('behind');
    expect(historyRelation(two, two)).toBe('same');
    expect(historyRelation(fork, two)).toBe('diverged');
    expect(historyRelation(three, sealSave('wld-test0002', {}, null).envelope)).toBe('other-world');
  });
});

describe('slot protocol', () => {
  it('commits revisions with the previous one kept as backup', async () => {
    const slots = new MemorySlots();
    const [one, two] = chain(2);
    expect(await commitSave(slots, one?.text ?? '')).toEqual({ ok: true, revision: 1 });
    expect(await commitSave(slots, two?.text ?? '')).toEqual({ ok: true, revision: 2 });
    expect(slots.slots.get('current')).toBe(two?.text);
    expect(slots.slots.get('backup')).toBe(one?.text);
    expect(slots.slots.has('pending')).toBe(false);
    expect(await recoverSave(slots)).toMatchObject({ status: 'ok', source: 'current', envelope: { revision: 2 } });
  });

  it('a crash at every step of a save restores the last valid revision, never nothing', async () => {
    const [one, two, three] = chain(3);
    for (let failAfter = 0; failAfter <= 3; failAfter += 1) {
      const slots = new MemorySlots();
      await commitSave(slots, one?.text ?? '');
      await commitSave(slots, two?.text ?? '');
      slots.crashAfter(failAfter);
      // Every mutating step counts from here: write pending, move current → backup, move pending → current.
      await commitSave(slots, three?.text ?? '').catch(() => undefined);
      const recovered = await recoverSave(slots);
      expect(recovered.status).toBe('ok');
      const revision = recovered.status === 'ok' ? recovered.envelope.revision : 0;
      expect(revision).toBe(failAfter === 0 ? 2 : 3);
    }
  });

  it('a torn pending write is ignored; a torn current never replaces a good backup', async () => {
    const [one, two, three] = chain(3);
    const slots = new MemorySlots();
    await commitSave(slots, one?.text ?? '');
    await commitSave(slots, two?.text ?? '');
    slots.slots.set('pending', (three?.text ?? '').slice(0, 40));
    expect(await recoverSave(slots)).toMatchObject({ status: 'ok', envelope: { revision: 2 }, ignored: ['pending'] });
    slots.slots.set('current', 'garbage');
    expect(await recoverSave(slots)).toMatchObject({ status: 'ok', source: 'backup', envelope: { revision: 1 } });
    expect(await commitSave(slots, three?.text ?? '')).toEqual({ ok: true, revision: 3 });
    expect(slots.slots.get('backup')).toBe(one?.text);
  });

  it('never overwrites a newer-version save, an unreadable store, a newer revision or another campaign', async () => {
    const [one, two] = chain(2);
    const slots = new MemorySlots();
    await commitSave(slots, two?.text ?? '');
    expect(await commitSave(slots, one?.text ?? '')).toEqual({ ok: false, reason: 'stale' });
    expect(await commitSave(slots, sealSave('wld-test0002', {}, null).text)).toEqual({
      ok: false,
      reason: 'other-world',
    });
    const newer = (two?.text ?? '').replace(`"schemaVersion":${SAVE_SCHEMA_VERSION}`, '"schemaVersion":99');
    slots.slots.set('current', newer);
    expect(await recoverSave(slots)).toEqual({ status: 'locked', slot: 'current' });
    const next = sealSave(WORLD, {}, two?.envelope ?? null).text;
    expect(await commitSave(slots, next)).toEqual({ ok: false, reason: 'locked' });
    expect(slots.slots.get('current')).toBe(newer);

    const broken = new MemorySlots();
    broken.slots.set('current', 'garbage');
    expect(await recoverSave(broken)).toEqual({ status: 'unreadable', ignored: ['current'] });
    expect(await commitSave(broken, one?.text ?? '')).toEqual({ ok: false, reason: 'locked' });
  });

  it('an empty store, or only a torn first write, starts a new campaign', async () => {
    const slots = new MemorySlots();
    expect(await recoverSave(slots)).toEqual({ status: 'empty' });
    slots.slots.set('pending', '{"format":"martian');
    expect(await recoverSave(slots)).toEqual({ status: 'empty' });
    expect(await commitSave(slots, 'not json')).toEqual({ ok: false, reason: 'invalid' });
  });
});
