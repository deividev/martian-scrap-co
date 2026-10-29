# MSC-007 — Production Asset Loading and Packaging

**Task:** [MSC-007](../04-phased-agent-task-plan.md#msc-007--prove-production-asset-loading-and-packaging) · **Date:** 2026-10-29 · **Phase:** 1 · **Adopted revision:** electron-builder 26.17.0 with Electron 44.10.0

## Pipeline

`npm run package` = `npm run build` (typecheck, Vite renderer build, Electron tsc build) + `electron-builder --win --config electron-builder.yml`.

| Element | Decision |
|---|---|
| Packager | electron-builder only ([config](../../electron-builder.yml)); no electron-packager or second pipeline. |
| Target | Windows x64 **`dir`** folder (`release/win-unpacked/`). Steam depots upload a folder, so no installer is needed now. |
| asar allowlist | `dist/**`, `dist-electron/electron/**`, `package.json`; source maps excluded. Everything else is excluded by omission. |
| Runtime dependencies | None. three moved to `devDependencies` because Vite bundles it; the asar contains no `node_modules`. |
| Native-unpack design | `asarUnpack: native/**, **/*.node`; main resolves `nativeDir` to `resources/app.asar.unpacked/native` when packaged ([paths.ts](../../electron/paths.ts)). No native module exists yet. |
| Path resolver | `resolveAppPaths()` derives index, preload and native paths from `app.getAppPath()`, `process.resourcesPath` and the main module location, never from the working directory. |
| Renderer assets | Vite relative base `./` and `assetsInlineLimit: 0`, so assets stay real files loaded relative to `index.html`. |
| Locales | `en-US.pak` only; other languages are added when localization is approved. |
| Fuses | `runAsNode` off, `NODE_OPTIONS` off, `--inspect` off, `onlyLoadAppFromAsar` on, embedded asar integrity on, cookie encryption on. |
| Signing | None (zero-spend; no certificate assumed). Executable resources are still edited (product name, asar integrity). |

## Inspection of the clean package

- `app.asar` contains exactly: `dist/index.html`, `dist/assets/index-*.js`, `dist/assets/index-*.css`, `dist/assets/smoke-checker-*.png`, `dist-electron/electron/{main,ipcPolicy,paths}.js`, `dist-electron/electron/preload.cjs`, `package.json`.
- Forbidden-content scan (TypeScript sources, maps, `src/`, `docs/`, `references/`, `tests/`, `tools/`, `node_modules`, `.env`, saves, `.psd`, `.blend`): **none found**.
- Folder size: about 320 MB, dominated by the Electron/Chromium runtime.
- The folder was copied to `%TEMP%\msc-clean-package` (outside the project) and launched there with no dev server running: page loaded from `resources/app.asar/dist/index.html`, the bundled PNG texture loaded (`data-assets-loaded="true"`), the preload bridge answered, CSP was active and no console errors appeared.
- `ELECTRON_RUN_AS_NODE=1` did not run Node code in the packaged executable (fuse effective).

## Context used

- [Co-op guide](../../references/online-coop.txt) §3.3: native `.node` files cannot load from inside asar; an allowlist (not a deny list) prevents shipping screenshots and saves; a missing Steam DLL silently disables Steam.
- [Architecture §4](../03-technical-stack-architecture.md#4-secure-electron-and-build-lifecycle) and §11.

## Deviations

- Source `electron-packager` + custom sanitize script are **not adopted**; electron-builder's `files` allowlist and `asarUnpack` cover the same goals in one pipeline.
- Source copied `steam_api64.dll` next to the executable; no Steam files exist yet. Placement is decided and verified at MSC-025–027.
- Source kept `en-US` and `es` locales; only `en-US` is kept until languages are approved.
- Electron fuses are an addition not present in the source.
