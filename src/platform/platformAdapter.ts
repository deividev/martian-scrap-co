import type { AppInfo, PlatformAdapter, PlatformBridge } from './types';

const BROWSER_CAPABILITIES = Object.freeze({ desktopShell: false, steam: false, nativeSaves: false });
// Steam and native saves are added by their own tasks (MSC-025+, MSC-036); until then they stay false.
const ELECTRON_CAPABILITIES = Object.freeze({ desktopShell: true, steam: false, nativeSaves: false });

export function isAppInfo(value: unknown): value is AppInfo {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return ['name', 'version', 'platform', 'electron', 'chrome'].every(
    (key) => typeof record[key] === 'string' && (record[key] as string).length <= 128,
  );
}

/** Picks the Electron adapter when the preload bridge exists, otherwise an honest browser adapter. */
export function createPlatformAdapter(
  bridge: PlatformBridge | undefined = globalThis.window?.martianPlatform,
): PlatformAdapter {
  if (!bridge) {
    return {
      kind: 'browser',
      capabilities: BROWSER_CAPABILITIES,
      getAppInfo: () => Promise.resolve(null),
    };
  }
  return {
    kind: 'electron',
    capabilities: ELECTRON_CAPABILITIES,
    getAppInfo: async () => {
      const info: unknown = await bridge.getAppInfo();
      return isAppInfo(info) ? info : null;
    },
  };
}
