import type { AppInfo, PlatformAdapter, PlatformBridge, SteamBridge } from './types';

const BROWSER_CAPABILITIES = Object.freeze({ desktopShell: false, steam: false, nativeSaves: false });
// Native saves arrive with MSC-036. Steam is optional at runtime, so it is reported by `getSteam()`, not here.
const ELECTRON_CAPABILITIES = Object.freeze({ desktopShell: true, steam: false, nativeSaves: false });

export function isAppInfo(value: unknown): value is AppInfo {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return ['name', 'version', 'platform', 'electron', 'chrome'].every(
    (key) => typeof record[key] === 'string' && record[key].length <= 128,
  );
}

/** Picks the Electron adapter when the preload bridge exists, otherwise an honest browser adapter. */
export function createPlatformAdapter(
  bridge: PlatformBridge | undefined = globalThis.window?.martianPlatform,
  steam: SteamBridge | undefined = globalThis.window?.martianSteam,
): PlatformAdapter {
  if (!bridge) {
    return {
      kind: 'browser',
      capabilities: BROWSER_CAPABILITIES,
      getAppInfo: () => Promise.resolve(null),
      getSteam: () => Promise.resolve(null),
    };
  }
  return {
    kind: 'electron',
    capabilities: ELECTRON_CAPABILITIES,
    getAppInfo: async () => {
      const info: unknown = await bridge.getAppInfo();
      return isAppInfo(info) ? info : null;
    },
    getSteam: async () => {
      if (!steam) return null;
      const status = await steam.status();
      return status.available ? steam : null;
    },
  };
}
