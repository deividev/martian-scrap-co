import { BrowserWindow, app, ipcMain, session, type IpcMainInvokeEvent, type WebContents } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { commitSave, recoverSave, type CommitResult, type RecoverResult } from '../src/persistence/saveSlots.js';
import type { AppInfo } from '../src/platform/types.js';
import { IPC_CHANNELS, isTrustedSenderUrl, resolveDevServerUrl, validateInvoke, type IpcChannel } from './ipcPolicy.js';
import { resolveAppPaths } from './paths.js';
import { createFileSlots } from './saveFiles.js';

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

function handleTrusted(channel: IpcChannel, run: (args: readonly unknown[]) => unknown): void {
  ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
    if (!isTrustedSenderUrl(event.senderFrame?.url, devServerOrigin, indexFileUrl)) {
      throw new Error('IPC rejected: untrusted sender');
    }
    const validation = validateInvoke(channel, args);
    if (!validation.ok) throw new Error(`IPC rejected: ${validation.reason}`);
    return run(args);
  });
}

function registerIpc(): void {
  handleTrusted(IPC_CHANNELS.getAppInfo, (): AppInfo => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  }));
  // MSC-036: host campaign saves live in one fixed folder under userData; the renderer passes text, never paths.
  const slots = createFileSlots(path.join(app.getPath('userData'), 'saves'));
  // One save operation at a time, in order.
  let queue: Promise<unknown> = Promise.resolve();
  const serialized = <T>(run: () => Promise<T>): Promise<T> => {
    const next = queue.then(run, run);
    queue = next.catch(() => undefined);
    return next;
  };
  handleTrusted(IPC_CHANNELS.loadSave, (): Promise<RecoverResult> => serialized(() => recoverSave(slots)));
  handleTrusted(IPC_CHANNELS.writeSave, (args): Promise<CommitResult | { ok: false; reason: 'failed' }> =>
    serialized(async () => {
      try {
        return await commitSave(slots, String(args[0]));
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

void app.whenReady().then(() => {
  hardenSession();
  registerIpc();
  createMainWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
