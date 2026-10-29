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
| eslint | 10.12.0 | MIT | dev | MSC-008 | Flat config (`eslint.config.js`). 10.13.0 was under two weeks old. |
| @eslint/js | 10.0.1 | MIT | dev | MSC-008 | ESLint recommended rules. |
| typescript-eslint | 8.71.2 | MIT | dev | MSC-008 | Type-aware rules over both tsconfig projects; peer range `typescript >=4.8.4 <6.1.0` sets the TypeScript ceiling. 8.72.x was under two weeks old. |
| globals | 17.13.0 | MIT | dev | MSC-008 | Node globals for `.js`/`.mjs` tooling files. |
| prettier | 3.9.9 | MIT | dev | MSC-008 | Formatter for code/config; Markdown and `references/` are excluded to keep authored and archived layout. |
| zod | 4.6.7 | MIT | dev (bundled) | MSC-009 | Runtime validator for content packs (later saves and network payloads). Zero dependencies; strict objects reject unknown fields. Kept in devDependencies while only the Vite-bundled renderer uses it; move to dependencies when the main process validates saves (MSC-036). |
| @dimforge/rapier3d-compat | 0.21.0 | Apache-2.0 | dev (bundled) | MSC-011 | Physics engine (rigid bodies, queries, joints). The compat build embeds WASM, requiring `'wasm-unsafe-eval'` in CSP. Identical probe results in Node, browser and packaged Electron. |
| typescript | 6.0.3 | Apache-2.0 | dev | MSC-005 | Strict mode. **7.0.2 is the npm `latest`, but typescript-eslint 8.72.1 supports only `>=4.8.4 <6.1.0`**, so 6.0.3 keeps MSC-008 linting viable. Revisit when typescript-eslint supports 7.x. |

## Review notes

- `npm install` reported 0 known vulnerabilities on 2026-10-29.
- The production bundle is about 528 kB minified (131 kB gzip), dominated by three; Vite's 500 kB chunk warning is expected and acceptable for a desktop Electron build. Code splitting is revisited when real content exists.
