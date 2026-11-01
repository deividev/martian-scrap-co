// Sandboxed preload: CommonJS, no Node APIs, no relative runtime imports.
// Exposes one frozen, typed method per approved channel; raw ipcRenderer never reaches the page.
import electron = require('electron');
import type { AppInfo, PlatformBridge, PlaytestBridge, SteamBridge } from '../src/platform/types.js';

const bridge: PlatformBridge = Object.freeze({
  getAppInfo: (): Promise<AppInfo> => electron.ipcRenderer.invoke('app:get-info'),
  loadSave: (): Promise<unknown> => electron.ipcRenderer.invoke('save:load'),
  writeSave: (text: string): Promise<unknown> => electron.ipcRenderer.invoke('save:write', text),
});

electron.contextBridge.exposeInMainWorld('martianPlatform', bridge);

// Steam (MSC-026): main owns the lifecycle and validates every argument; the page polls instead of listening.
const steam: SteamBridge = Object.freeze({
  status: () => electron.ipcRenderer.invoke('steam:status'),
  createLobby: () => electron.ipcRenderer.invoke('steam:create-lobby'),
  joinLobby: (lobbyId: string) => electron.ipcRenderer.invoke('steam:join-lobby', lobbyId),
  leaveLobby: () => electron.ipcRenderer.invoke('steam:leave-lobby'),
  setJoinable: (joinable: boolean) => electron.ipcRenderer.invoke('steam:set-joinable', joinable),
  openInviteDialog: () => electron.ipcRenderer.invoke('steam:invite'),
  send: (to: string, channel: 'reliable' | 'disposable', raw: string) =>
    electron.ipcRenderer.invoke('steam:send', to, channel, raw),
  poll: () => electron.ipcRenderer.invoke('steam:poll'),
});

electron.contextBridge.exposeInMainWorld('martianSteam', steam);

// DEV-ONLY playtest log (MSC-039): main decides whether it is on (MSC_PLAYTEST_LOG=1) and owns the file.
const playtest: PlaytestBridge = Object.freeze({
  status: () => electron.ipcRenderer.invoke('playtest:status'),
  append: (entries: readonly object[]) => electron.ipcRenderer.invoke('playtest:append', entries),
});

electron.contextBridge.exposeInMainWorld('martianPlaytest', playtest);
