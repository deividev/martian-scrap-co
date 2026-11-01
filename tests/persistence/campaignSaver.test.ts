import { describe, expect, it } from 'vitest';
import { CampaignSaver, newWorldId } from '../../src/persistence/campaignSaver';
import { slotCampaignStore, storageSlots, type CampaignStore } from '../../src/persistence/campaignStore';
import { openSave, sealSave } from '../../src/persistence/saveSlots';

function memoryStore(): { store: CampaignStore; items: Map<string, string> } {
  const items = new Map<string, string>();
  const storage = {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
  return { store: slotCampaignStore('browser', storageSlots(storage, 's')), items };
}

const WORLD = 'wld-saver0001';

describe('CampaignSaver', () => {
  it('starts a new campaign, then resumes it at the last committed revision', async () => {
    const { store } = memoryStore();
    const first = await CampaignSaver.open(store, 'host', () => WORLD);
    expect(first.opened).toEqual({ kind: 'new' });
    expect(await first.saver.save(() => ({ credits: 40 }))).toEqual({ ok: true, revision: 1 });
    expect(await first.saver.save(() => ({ credits: 80 }))).toEqual({ ok: true, revision: 2 });

    const again = await CampaignSaver.open(store, 'host', () => 'wld-unused0001');
    expect(again.opened).toMatchObject({ kind: 'resumed', revision: 2, payload: { credits: 80 } });
    expect(again.saver.worldId).toBe(WORLD);
    expect(await again.saver.save(() => ({ credits: 0 }))).toEqual({ ok: true, revision: 3 });
  });

  it('a guest never reads or writes the host campaign', async () => {
    const { store, items } = memoryStore();
    const host = await CampaignSaver.open(store, 'host', () => WORLD);
    await host.saver.save(() => ({ credits: 40 }));
    const before = new Map(items);
    const guest = await CampaignSaver.open(store, 'guest');
    expect(guest.opened).toEqual({ kind: 'unsaved' });
    expect(await guest.saver.save(() => ({ credits: 999 }))).toEqual({ ok: false, reason: 'read-only' });
    expect(items).toEqual(before);
  });

  it('requests made during a save fold into one follow-up save with the latest state', async () => {
    const { store } = memoryStore();
    const { saver } = await CampaignSaver.open(store, 'host', () => WORLD);
    let credits = 0;
    const captured: number[] = [];
    const capture = () => {
      captured.push(credits);
      return { credits };
    };
    const first = saver.save(capture);
    credits = 1;
    const second = saver.save(capture);
    credits = 2;
    const third = saver.save(capture);
    expect(await first).toEqual({ ok: true, revision: 1 });
    expect(await second).toEqual({ ok: true, revision: 2 });
    expect(await third).toEqual({ ok: true, revision: 2 });
    expect(captured).toEqual([0, 2]);
  });

  it('a newer-version or refused save is kept untouched and nothing more is written', async () => {
    const { store, items } = memoryStore();
    const newer = sealSave(WORLD, {}, null).text.replace('"schemaVersion":1', '"schemaVersion":7');
    items.set('s.current', newer);
    const locked = await CampaignSaver.open(store, 'host');
    expect(locked.opened).toEqual({ kind: 'locked' });
    expect(await locked.saver.save(() => ({}))).toEqual({ ok: false, reason: 'read-only' });
    expect(items.get('s.current')).toBe(newer);

    const fresh = memoryStore();
    const host = await CampaignSaver.open(fresh.store, 'host', () => WORLD);
    await host.saver.save(() => ({ credits: 5 }));
    const resumed = await CampaignSaver.open(fresh.store, 'host');
    resumed.saver.refuse();
    expect(await resumed.saver.save(() => ({ credits: 0 }))).toEqual({ ok: false, reason: 'read-only' });
    const kept = openSave(fresh.items.get('s.current') ?? '');
    expect(kept.ok && kept.envelope.payload).toEqual({ credits: 5 });
  });

  it('a second writer that falls behind stops instead of overwriting newer progress', async () => {
    const { store } = memoryStore();
    const one = await CampaignSaver.open(store, 'host', () => WORLD);
    await one.saver.save(() => ({ credits: 1 }));
    const a = await CampaignSaver.open(store, 'host');
    const b = await CampaignSaver.open(store, 'host');
    expect(await a.saver.save(() => ({ credits: 2 }))).toEqual({ ok: true, revision: 2 });
    expect(await b.saver.save(() => ({ credits: 3 }))).toEqual({ ok: false, reason: 'stale' });
    expect(b.saver.writable).toBe(false);
  });

  it('creates valid world ids', () => {
    expect(newWorldId()).toMatch(/^wld-[0-9a-z]{8,32}$/);
  });
});
