# MSC-006 — Secure Electron Boundaries

**Task:** [MSC-006](../04-phased-agent-task-plan.md#msc-006--establish-secure-electron-boundaries) · **Date:** 2026-10-29 · **Phase:** 1 · **Adopted revision:** Electron 44.10.0 (Chromium 152.0.7977.169, Node 24.22.1)

## Process layout

| Process | File | Responsibility |
|---|---|---|
| Main (ESM) | `electron/main.ts` → `dist-electron/electron/main.js` | Window lifecycle, session hardening, IPC handlers. Owns all native access. |
| Preload (CommonJS, sandboxed) | `electron/preload.cts` → `dist-electron/electron/preload.cjs` | Exposes a frozen `window.martianPlatform` with one method per approved channel. No relative runtime imports (sandboxed preloads cannot load them). |
| IPC policy (pure) | `electron/ipcPolicy.ts` | Channel allowlist, arity, payload size, trusted sender and dev-URL rules. Unit-tested without Electron. |
| Renderer | `src/platform/` | `PlatformAdapter` interface; Electron adapter wraps the bridge, browser adapter reports every capability as `false`. |

## Security readback

| Control | Setting / behavior | Evidence |
|---|---|---|
| Context isolation | `contextIsolation: true` | `typeof window.ipcRenderer` and `window.electron` are `undefined` in the running app. |
| Node integration | `nodeIntegration: false`, `nodeIntegrationInWorker: false` | `typeof require` and `typeof process` are `undefined`. |
| Sandbox | `sandbox: true` plus `app.enableSandbox()` | Preload compiled as CommonJS with only the `electron` module. |
| Bridge surface | Frozen object, only `getAppInfo` | `Object.keys(window.martianPlatform)` → `["getAppInfo"]`, `Object.isFrozen` → `true`. |
| IPC validation | Allowlisted channel, exact arity, ≤16 KiB JSON payload, sender frame must be the exact packaged `dist/index.html` or the loopback dev origin | 26 Vitest cases in `tests/electron/` and `tests/platform/`. |
| Navigation | `will-navigate` (other URLs), `will-redirect`, `will-attach-webview` prevented; `setWindowOpenHandler` → deny | `window.open('https://example.com')` returns `null`. |
| Permissions | Only `pointerLock` and `fullscreen` for the trusted page; everything else denied (camera, microphone, geolocation, notifications…) | Code readback; pointer lock is needed for first-person look. |
| CSP | Production meta tag injected by Vite (`script-src 'self'`, no inline, `object-src 'none'`, `base-uri 'none'`); dev header set by main only for the loopback dev origin | Inline `<script>` triggered a `securitypolicyviolation` in the running app. |
| Dev server | Accepted only from `MSC_DEV_SERVER_URL` when unpackaged and only for `127.0.0.1`/`localhost`/`[::1]` http(s) | `resolveDevServerUrl` tests reject LAN, remote, `file:` and `javascript:` URLs. |
| DevTools | Disabled when packaged | `devTools: !app.isPackaged`. |

Runtime probe: `npm run build`, then `electron . --remote-debugging-port=9333` inspected through the Chrome DevTools Protocol; the page loaded from `file://…/dist/index.html`, showed "Electron 44.10.0 · win32 · v0.0.0" and logged no console errors.

## Context used

- [Co-op guide](../../references/online-coop.txt) §1 (renderer never talks to Steam directly; every bridge optional; game works without it) and §3 (native binding must be unpacked from asar; missing DLL silently disables Steam).
- [Architecture §4](../03-technical-stack-architecture.md#4-secure-electron-and-build-lifecycle) and §11.

## Deviations

- Source exposed several bridges (`steamBridge`, `steamMp`, `cloudBridge`, `discordBridge`) through a CommonJS `main.cjs`; here there is **one** typed bridge with a single channel until each capability's own task adds a validated method.
- Source packaging with `electron-packager` is **not adopted**; electron-builder is the single packager (MSC-007).
- No Steam, Discord or debug environment flags were copied.
- Electron 45.1.0 is npm `latest` but was released on 2026-10-21; 44.10.0 (supported 44 line) was adopted for stability. Revisit at MSC-025 when the native binding is chosen.
