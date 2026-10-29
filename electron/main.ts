import { BrowserWindow, app, ipcMain, session, type IpcMainInvokeEvent, type WebContents } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { AppInfo } from '../src/platform/types.js';
import { IPC_CHANNELS, isTrustedSenderUrl, resolveDevServerUrl, validateInvoke } from './ipcPolicy.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const preloadPath = path.join(here, 'preload.cjs');
const indexHtmlPath = path.join(app.getAppPath(), 'dist', 'index.html');
const indexFileUrl = pathToFileURL(indexHtmlPath).href;

// Dev loading is only possible in an unpackaged run and only from a loopback origin.
const devServerOrigin = app.isPackaged ? null : resolveDevServerUrl(process.env['MSC_DEV_SERVER_URL']);

// Production pages carry their own CSP meta tag (vite.config.ts); dev responses get this header.
const DEV_CSP = [
  "default-src 'self'",
  "script-src 'self'",
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

function registerIpc(): void {
  ipcMain.handle(IPC_CHANNELS.getAppInfo, (event: IpcMainInvokeEvent, ...args: unknown[]): AppInfo => {
    if (!isTrustedSenderUrl(event.senderFrame?.url, devServerOrigin, indexFileUrl)) {
      throw new Error('IPC rejected: untrusted sender');
    }
    const validation = validateInvoke(IPC_CHANNELS.getAppInfo, args);
    if (!validation.ok) throw new Error(`IPC rejected: ${validation.reason}`);
    return {
      name: app.getName(),
      version: app.getVersion(),
      platform: process.platform,
      electron: process.versions.electron,
      chrome: process.versions.chrome,
    };
  });
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#1b1f2e',
    show: false,
    webPreferences: {
      preload: preloadPath,
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
    void window.loadURL(devServerOrigin);
  } else {
    void window.loadFile(indexHtmlPath);
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
