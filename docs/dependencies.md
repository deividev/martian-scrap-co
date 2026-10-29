# Martian Scrap Co. — Dependency Register

Adopted third-party packages with exact versions, licenses and the compatibility review behind each choice. Every dependency must be free; no paid tool, service or asset is allowed ([AGENT.md](../AGENT.md)). Update this file in the same commit that adds, removes or upgrades a dependency.

| Package | Version | License | Kind | Adopted in | Reason / compatibility notes |
|---|---|---|---|---|---|
| three | 0.186.1 | MIT | dev (bundled) | MSC-005 | Approved rendering library. WebGLRenderer only; WebGPU is not a launch dependency. Moved to devDependencies at MSC-007 because Vite bundles it into the renderer; nothing ships in `node_modules`. |
| electron-builder | 26.17.0 | MIT | dev | MSC-007 | Single packaging pipeline. 26.18.x was under two weeks old. Downloads the Electron zip for packaging (free, from GitHub releases). |
| @types/three | 0.186.0 | MIT | dev | MSC-005 | Type definitions matching the three 0.186 line. |
| vite | 8.3.5 | MIT | dev | MSC-005 | Build/dev server. Requires Node `^20.19.0 \|\| >=22.12.0`; local Node is 22.12.0. Relative `base: './'` for packaged local loading; dev server bound to `127.0.0.1:5173`. |
| electron | 44.10.0 | MIT | dev (runtime shell) | MSC-006 | Approved desktop runtime. Ships Chromium 152 and Node 24.22.1. 45.1.0 was only eight days old, so the supported 44 line was chosen. |
| @types/node | 24.19.2 | MIT | dev | MSC-006 | Matches Electron's embedded Node 24 for main/preload typechecking. |
| vitest | 5.0.5 | MIT | dev | MSC-006 | Unit tests; requires Node `^22.12.0 \|\| ^24 \|\| >=26` and Vite 6–8. |
| typescript | 6.0.3 | Apache-2.0 | dev | MSC-005 | Strict mode. **7.0.2 is the npm `latest`, but typescript-eslint 8.72.1 supports only `>=4.8.4 <6.1.0`**, so 6.0.3 keeps MSC-008 linting viable. Revisit when typescript-eslint supports 7.x. |

## Review notes

- `npm install` reported 0 known vulnerabilities on 2026-10-29.
- The production bundle is about 528 kB minified (131 kB gzip), dominated by three; Vite's 500 kB chunk warning is expected and acceptable for a desktop Electron build. Code splitting is revisited when real content exists.
