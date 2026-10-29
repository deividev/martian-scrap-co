// Sandboxed preload: CommonJS, no Node APIs, no relative runtime imports.
// Exposes one frozen, typed method per approved channel; raw ipcRenderer never reaches the page.
import electron = require('electron');
import type { AppInfo, PlatformBridge } from '../src/platform/types.js';

const bridge: PlatformBridge = Object.freeze({
  getAppInfo: (): Promise<AppInfo> => electron.ipcRenderer.invoke('app:get-info'),
});

electron.contextBridge.exposeInMainWorld('martianPlatform', bridge);
