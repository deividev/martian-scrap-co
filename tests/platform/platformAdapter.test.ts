import { describe, expect, it } from 'vitest';
import { createPlatformAdapter, isAppInfo } from '../../src/platform/platformAdapter';
import type { AppInfo, PlatformBridge, SteamBridge, SteamStatus } from '../../src/platform/types';

const INFO: AppInfo = {
  name: 'martian-scrap-co',
  version: '0.0.0',
  platform: 'win32',
  electron: '44.10.0',
  chrome: '152',
};

const bridgeWith = (overrides: Partial<PlatformBridge>): PlatformBridge => ({
  getAppInfo: () => Promise.resolve(INFO),
  loadSave: () => Promise.resolve({ status: 'empty' }),
  writeSave: () => Promise.resolve({ ok: false, reason: 'failed' }),
  ...overrides,
});

describe('createPlatformAdapter', () => {
  it('reports every native capability as absent in a browser', async () => {
    const adapter = createPlatformAdapter(undefined, undefined, null);
    expect(adapter.kind).toBe('browser');
    expect(adapter.capabilities).toEqual({ desktopShell: false, steam: false, nativeSaves: false });
    expect(adapter.saves).toBeNull();
    await expect(adapter.getAppInfo()).resolves.toBeNull();
  });

  it('keeps a dev page campaign in browser storage, not as native saves', () => {
    const items = new Map<string, string>();
    const storage = {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
      removeItem: (key: string) => void items.delete(key),
    };
    expect(createPlatformAdapter(undefined, undefined, storage).saves?.kind).toBe('browser');
  });

  it('uses the preload bridge in Electron with native saves, without claiming Steam yet', async () => {
    const adapter = createPlatformAdapter(bridgeWith({ getAppInfo: () => Promise.resolve(INFO) }));
    expect(adapter.kind).toBe('electron');
    expect(adapter.capabilities.steam).toBe(false);
    expect(adapter.capabilities.nativeSaves).toBe(true);
    expect(adapter.saves?.kind).toBe('file');
    await expect(adapter.getAppInfo()).resolves.toEqual(INFO);
  });

  it('drops malformed bridge responses', async () => {
    const adapter = createPlatformAdapter(
      bridgeWith({ getAppInfo: () => Promise.resolve({ name: 42 } as unknown as AppInfo) }),
    );
    await expect(adapter.getAppInfo()).resolves.toBeNull();
  });

  it('hands out the Steam bridge only when Steam initialized', async () => {
    const platform = bridgeWith({});
    const steam = (status: SteamStatus) => ({ status: () => Promise.resolve(status) }) as unknown as SteamBridge;
    const live = steam({ available: true, self: '76561198000000001', lobby: null });
    await expect(createPlatformAdapter(platform, live).getSteam()).resolves.toBe(live);
    const off = steam({ available: false, reason: 'init-failed' });
    await expect(createPlatformAdapter(platform, off).getSteam()).resolves.toBeNull();
    await expect(createPlatformAdapter(platform, undefined).getSteam()).resolves.toBeNull();
    await expect(createPlatformAdapter(undefined, live).getSteam()).resolves.toBeNull();
  });
});

describe('isAppInfo', () => {
  it('rejects oversized fields', () => {
    expect(isAppInfo({ ...INFO, name: 'x'.repeat(129) })).toBe(false);
  });
});
