import { describe, expect, it } from 'vitest';
import {
  bridgeCampaignStore,
  parseRecoverResult,
  parseWriteResult,
  slotCampaignStore,
  storageSlots,
} from '../../src/persistence/campaignStore';
import { sealSave } from '../../src/persistence/saveSlots';

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}

describe('campaign stores', () => {
  it('browser dev storage runs the same atomic slot protocol', async () => {
    const storage = memoryStorage();
    const store = slotCampaignStore('browser', storageSlots(storage, 'test'));
    const one = sealSave('wld-store001', { credits: 5 }, null);
    expect(await store.write(one.text)).toEqual({ ok: true, revision: 1 });
    expect(await store.write(sealSave('wld-store001', { credits: 9 }, one.envelope).text)).toEqual({
      ok: true,
      revision: 2,
    });
    expect([...storage.items.keys()].sort()).toEqual(['test.backup', 'test.current']);
    expect(await store.load()).toMatchObject({ status: 'ok', envelope: { revision: 2, payload: { credits: 9 } } });
  });

  it('re-verifies what the main process returns and never trusts an edited envelope', () => {
    const { envelope } = sealSave('wld-store001', { credits: 5 }, null);
    expect(parseRecoverResult({ status: 'ok', envelope, source: 'current', ignored: [] })).toMatchObject({
      status: 'ok',
      envelope: { revision: 1 },
    });
    expect(
      parseRecoverResult({
        status: 'ok',
        envelope: { ...envelope, payload: { credits: 1e9 } },
        source: 'current',
        ignored: [],
      }),
    ).toBeNull();
    expect(parseRecoverResult({ status: 'locked', slot: 'current' })).toEqual({ status: 'locked', slot: 'current' });
    expect(parseRecoverResult({ status: 'ok' })).toBeNull();
    expect(parseWriteResult({ ok: true, revision: 4 })).toEqual({ ok: true, revision: 4 });
    expect(parseWriteResult({ ok: false, reason: 'stale' })).toEqual({ ok: false, reason: 'stale' });
    expect(parseWriteResult('nonsense')).toEqual({ ok: false, reason: 'failed' });
  });

  it('a bridge that throws or answers nonsense reports failure without inventing a save', async () => {
    const store = bridgeCampaignStore({
      loadSave: () => Promise.resolve({ status: 'weird' }),
      writeSave: () => Promise.reject(new Error('IPC rejected')),
    });
    expect(await store.load()).toEqual({ status: 'unreadable', ignored: [] });
    expect(await store.write('{}')).toEqual({ ok: false, reason: 'failed' });
  });
});
