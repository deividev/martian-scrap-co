import { describe, expect, it } from 'vitest';
import { createPlatformAdapter, isAppInfo } from '../../src/platform/platformAdapter';
import type { AppInfo } from '../../src/platform/types';

const INFO: AppInfo = {
  name: 'martian-scrap-co',
  version: '0.0.0',
  platform: 'win32',
  electron: '44.10.0',
  chrome: '152',
};

describe('createPlatformAdapter', () => {
  it('reports every native capability as absent in a browser', async () => {
    const adapter = createPlatformAdapter(undefined);
    expect(adapter.kind).toBe('browser');
    expect(adapter.capabilities).toEqual({ desktopShell: false, steam: false, nativeSaves: false });
    await expect(adapter.getAppInfo()).resolves.toBeNull();
  });

  it('uses the preload bridge in Electron without claiming Steam or native saves yet', async () => {
    const adapter = createPlatformAdapter({ getAppInfo: () => Promise.resolve(INFO) });
    expect(adapter.kind).toBe('electron');
    expect(adapter.capabilities.steam).toBe(false);
    expect(adapter.capabilities.nativeSaves).toBe(false);
    await expect(adapter.getAppInfo()).resolves.toEqual(INFO);
  });

  it('drops malformed bridge responses', async () => {
    const adapter = createPlatformAdapter({ getAppInfo: () => Promise.resolve({ name: 42 } as unknown as AppInfo) });
    await expect(adapter.getAppInfo()).resolves.toBeNull();
  });
});

describe('isAppInfo', () => {
  it('rejects oversized fields', () => {
    expect(isAppInfo({ ...INFO, name: 'x'.repeat(129) })).toBe(false);
  });
});
