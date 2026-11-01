import { BrowserWindow, app, ipcMain, session, type IpcMainInvokeEvent, type WebContents } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { commitSave, recoverSave, type CommitResult, type RecoverResult } from '../src/persistence/saveSlots.js';
import type { AppInfo } from '../src/platform/types.js';
import { IPC_CHANNELS, isTrustedSenderUrl, resolveDevServerUrl, validateInvoke, type IpcChannel } from './ipcPolicy.js';
import { resolveAppPaths } from './paths.js';
import { startSteam } from './steam/steamService.js';
import { connectLobbyFromArgv, isSteamId, resolveSteamConfig } from './steam/steamPolicy.js';
import { resolveDevP2pTest, runDevP2pTest } from './steam/devP2pTest.js'; // DEV-ONLY: remove before release
import { createFileSlots } from './saveFiles.js';
import { createPlaytestLog, isPlaytestLogEnabled } from './playtestLog.js'; // DEV-ONLY: remove before release
import { migrateLegacySaves, resolveUserDataDir } from './userData.js';

// Before anything touches userData: a folder name without the final dot (see userData.ts), saves carried over once.
app.setPath('userData', resolveUserDataDir(app.getPath('appData')));
const legacySaves = migrateLegacySaves(app.getPath('appData'));
if (legacySaves === 'copied') console.info('Saves copied from the legacy "Martian Scrap Co." folder');
if (legacySaves === 'failed') console.error('Could not copy saves from the legacy "Martian Scrap Co." folder');

const appPaths = resolveAppPaths({
  appPath: app.getAppPath(),
  resourcesPath: process.resourcesPath,
  isPackaged: app.isPackaged,
  mainDir: path.dirname(fileURLToPath(import.meta.url)),
});
const indexFileUrl = pathToFileURL(appPaths.indexHtml).href;

// Dev loading is only possible in an unpackaged run and only from a loopback origin.
const devServerOrigin = app.isPackaged ? null : resolveDevServerUrl(process.env['MSC_DEV_SERVER_URL']);

// Optional benchmark launch (MSC-019): `--benchmark=<preset>` and `--benchmark-seconds=<n>`, allowlisted.
const BENCHMARK_PRESETS: ReadonlySet<string> = new Set(['baseline', 'dense']);
function benchmarkQuery(argv: readonly string[]): Record<string, string> {
  const value = (name: string): string | undefined =>
    argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const preset = value('benchmark');
  if (!preset || !BENCHMARK_PRESETS.has(preset)) return {};
  const seconds = Number(value('benchmark-seconds') ?? '15');
  return { benchmark: preset, seconds: String(Number.isInteger(seconds) ? Math.min(120, Math.max(5, seconds)) : 15) };
}
/** Unpackaged-only art review flag: `--model-view=<model>:<view>[:<color>]` (lowercase words only). */
function modelViewQuery(argv: readonly string[]): Record<string, string> {
  if (app.isPackaged) return {};
  const raw = argv.find((arg) => arg.startsWith('--model-view='))?.slice('--model-view='.length) ?? '';
  const match = /^([a-z-]{1,32}):([a-z-]{1,32})(?::([a-z]{1,16}))?$/.exec(raw);
  if (!match?.[1] || !match[2]) return {};
  return { model: match[1], view: match[2], ...(match[3] ? { color: match[3] } : {}) };
}
const startupQuery = { ...benchmarkQuery(process.argv), ...modelViewQuery(process.argv) };

// Steam is optional and owned here (MSC-026). It starts before `ready` so the overlay switches can depend on it.
const steam = startSteam(resolveSteamConfig(process.env), connectLobbyFromArgv(process.argv));
if (steam.status().available) {
  // The overlay injects into the process that presents frames, so the GPU must run in-process (co-op guide §7.1).
  // Background throttling would freeze the overlay and co-op traffic while it covers the window.
  // `disable-direct-composition` is deliberately NOT added: it disables vsync (guide §7.2).
  app.commandLine.appendSwitch('in-process-gpu');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-background-timer-throttling');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
}

// Production pages carry their own CSP meta tag (vite.config.ts); dev responses get this header.
const DEV_CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  `connect-src 'self' ${devServerOrigin ? devServerOrigin.replace(/^http/, 'ws') : ''}`.trim(),
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

// Pointer lock and fullscreen are required for first-person play; every other permission is denied.
const ALLOWED_PERMISSIONS: ReadonlySet<string> = new Set(['pointerLock', 'fullscreen']);

function isTrustedWebContents(contents: WebContents): boolean {
  return isTrustedSenderUrl(contents.getURL(), devServerOrigin, indexFileUrl);
}

function hardenSession(): void {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((contents, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission) && isTrustedWebContents(contents));
  });
  ses.setPermissionCheckHandler((contents, permission) => {
    return contents !== null && ALLOWED_PERMISSIONS.has(permission) && isTrustedWebContents(contents);
  });
  if (devServerOrigin) {
    ses.webRequest.onHeadersReceived({ urls: [`${devServerOrigin}/*`] }, (details, callback) => {
      callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [DEV_CSP] } });
    });
  }
}

function handle(channel: IpcChannel, listener: (...args: unknown[]) => unknown): void {
  ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
    if (!isTrustedSenderUrl(event.senderFrame?.url, devServerOrigin, indexFileUrl)) {
      throw new Error('IPC rejected: untrusted sender');
    }
    const validation = validateInvoke(channel, args);
    if (!validation.ok) throw new Error(`IPC rejected: ${validation.reason}`);
    return listener(...args);
  });
}

function registerIpc(): void {
  handle(IPC_CHANNELS.getAppInfo, (): AppInfo => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  }));
  handle(IPC_CHANNELS.steamStatus, () => steam.status());
  handle(IPC_CHANNELS.steamCreateLobby, () => steam.createLobby());
  handle(IPC_CHANNELS.steamJoinLobby, (lobbyId) => (isSteamId(lobbyId) ? steam.joinLobby(lobbyId) : null));
  handle(IPC_CHANNELS.steamLeaveLobby, () => steam.leaveLobby());
  handle(IPC_CHANNELS.steamSetJoinable, (joinable) => typeof joinable === 'boolean' && steam.setJoinable(joinable));
  handle(IPC_CHANNELS.steamInvite, () => steam.openInviteDialog());
  handle(IPC_CHANNELS.steamSend, (to, channel, raw) => {
    if (!isSteamId(to) || (channel !== 'reliable' && channel !== 'disposable') || typeof raw !== 'string') return false;
    return steam.send(to, channel, raw);
  });
  handle(IPC_CHANNELS.steamPoll, () => steam.poll());

  // MSC-036: host campaign saves live in one fixed folder under userData; the renderer passes text, never paths.
  const slots = createFileSlots(path.join(app.getPath('userData'), 'saves'));
  // One save operation at a time, in order.
  let queue: Promise<unknown> = Promise.resolve();
  const serialized = <T>(run: () => Promise<T>): Promise<T> => {
    const next = queue.then(run, run);
    queue = next.catch(() => undefined);
    return next;
  };
  // DEV-ONLY playtest log (MSC-039): writes only when started with MSC_PLAYTEST_LOG=1. It goes to Documents, which
  // Explorer opens directly (the userData folder name ends in a dot, see the pending work register).
  const playtestLog = createPlaytestLog(
    isPlaytestLogEnabled(process.env),
    path.join(app.getPath('documents'), 'Martian Scrap Co playtest logs'),
  );
  if (playtestLog.status().enabled) console.info('Playtest log on:', playtestLog.status().file);
  handle(IPC_CHANNELS.playtestStatus, () => playtestLog.status());
  handle(IPC_CHANNELS.playtestAppend, (entries) => playtestLog.append(entries));
  handle(IPC_CHANNELS.loadSave, (): Promise<RecoverResult> => serialized(() => recoverSave(slots)));
  handle(IPC_CHANNELS.writeSave, (text): Promise<CommitResult | { ok: false; reason: 'failed' }> =>
    serialized(async () => {
      try {
        return await commitSave(slots, String(text));
      } catch (error) {
        console.error('Save failed', error);
        return { ok: false, reason: 'failed' };
      }
    }),
  );
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#1b1f2e',
    show: false,
    webPreferences: {
      preload: appPaths.preload,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      spellcheck: false,
      devTools: !app.isPackaged,
      // Keep frames and co-op traffic flowing while the Steam overlay covers the window (guide §7.1).
      backgroundThrottling: !steam.status().available,
    },
  });
  window.once('ready-to-show', () => window.show());
  if (devServerOrigin) {
    const search = new URLSearchParams(startupQuery).toString();
    void window.loadURL(search ? `${devServerOrigin}/?${search}` : devServerOrigin);
  } else {
    void window.loadFile(appPaths.indexHtml, { query: startupQuery });
  }
  return window;
}

// Applies to every renderer: no navigation away, no new windows, no webviews.
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, url) => {
    if (url !== contents.getURL()) event.preventDefault();
  });
  contents.on('will-redirect', (event) => event.preventDefault());
  contents.on('will-attach-webview', (event) => event.preventDefault());
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
});

app.enableSandbox();

/**
 * `--steam-smoke` (MSC-026 check): without opening a window, report Steam init, identity, a friends-only lobby
 * round trip and a clean shutdown as one JSON line on stdout, then quit. SteamIDs are reported only as present.
 */
async function runSteamSmoke(): Promise<void> {
  const report: Record<string, unknown> = { status: steam.status() };
  const initial = steam.status();
  if (initial.available) {
    report['status'] = { available: true, self: 'present' };
    const lobby = await steam.createLobby();
    report['lobbyCreated'] = lobby !== null;
    report['ownerIsSelf'] = lobby?.owner === initial.self;
    report['members'] = lobby?.members.length ?? 0;
    report['joinableToggle'] = steam.setJoinable(false) && steam.setJoinable(true);
    steam.leaveLobby();
    const after = steam.status();
    report['leftLobby'] = after.available && after.lobby === null;
  }
  steam.shutdown();
  report['shutdown'] = true;
  process.stdout.write(`${JSON.stringify({ steamSmoke: report })}
`);
  app.quit();
}

void app.whenReady().then(() => {
  if (process.argv.includes('--steam-smoke')) {
    void runSteamSmoke();
    return;
  }
  // DEV-ONLY two-account P2P check (MSC_DEV_STEAM_TEST=1 + MSC_STEAM_APP_ID): remove before release.
  const devP2pTest = resolveDevP2pTest(process.argv, process.env);
  if (devP2pTest) {
    const log = (line: unknown): void => void process.stdout.write(`${JSON.stringify(line)}\n`);
    const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
    void runDevP2pTest(steam, devP2pTest, { log, now: () => performance.now(), sleep }).finally(() => {
      steam.shutdown();
      app.quit();
    });
    return;
  }
  hardenSession();
  registerIpc();
  createMainWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('will-quit', () => steam.shutdown());

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
