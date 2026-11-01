import { bridgeCampaignStore, slotCampaignStore, storageSlots, type CampaignStore } from '../persistence/campaignStore';
import type { AppInfo, PlatformAdapter, PlatformBridge } from './types';

const BROWSER_CAPABILITIES = Object.freeze({ desktopShell: false, steam: false, nativeSaves: false });
// Steam is added by its own tasks (MSC-025+); native saves exist since MSC-036.
const ELECTRON_CAPABILITIES = Object.freeze({ desktopShell: true, steam: false, nativeSaves: true });
const BROWSER_SAVE_PREFIX = 'martian-scrap-co.dev-campaign';

/** The platform plus where the host campaign is kept (kept out of `types.ts`, which the main process compiles). */
export interface GamePlatform extends PlatformAdapter {
  /** Save files in the desktop shell; browser storage in a dev page; null when neither is available. */
  readonly saves: CampaignStore | null;
}

function browserStorage(): Storage | null {
  try {
    return globalThis.window?.localStorage ?? null;
  } catch {
    return null;
  }
}

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
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null = browserStorage(),
): GamePlatform {
  if (!bridge) {
    return {
      kind: 'browser',
      capabilities: BROWSER_CAPABILITIES,
      saves: storage ? slotCampaignStore('browser', storageSlots(storage, BROWSER_SAVE_PREFIX)) : null,
      getAppInfo: () => Promise.resolve(null),
    };
  }
  return {
    kind: 'electron',
    capabilities: ELECTRON_CAPABILITIES,
    saves: bridgeCampaignStore(bridge),
    getAppInfo: async () => {
      const info: unknown = await bridge.getAppInfo();
      return isAppInfo(info) ? info : null;
    },
  };
}
