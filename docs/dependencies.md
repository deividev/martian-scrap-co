# Martian Scrap Co. — Dependency Register

Adopted third-party packages with exact versions, licenses and the compatibility review behind each choice. Every dependency must be free; no paid tool, service or asset is allowed ([AGENT.md](../AGENT.md)). Update this file in the same commit that adds, removes or upgrades a dependency.

| Package | Version | License | Kind | Adopted in | Reason / compatibility notes |
|---|---|---|---|---|---|
| three | 0.186.1 | MIT | runtime | MSC-005 | Approved rendering library. WebGLRenderer only; WebGPU is not a launch dependency. |
| @types/three | 0.186.0 | MIT | dev | MSC-005 | Type definitions matching the three 0.186 line. |
| vite | 8.3.5 | MIT | dev | MSC-005 | Build/dev server. Requires Node `^20.19.0 \|\| >=22.12.0`; local Node is 22.12.0. Relative `base: './'` for packaged local loading; dev server bound to `127.0.0.1:5173`. |
| typescript | 6.0.3 | Apache-2.0 | dev | MSC-005 | Strict mode. **7.0.2 is the npm `latest`, but typescript-eslint 8.72.1 supports only `>=4.8.4 <6.1.0`**, so 6.0.3 keeps MSC-008 linting viable. Revisit when typescript-eslint supports 7.x. |

## Review notes

- `npm install` reported 0 known vulnerabilities on 2026-10-29.
- The production bundle is about 528 kB minified (131 kB gzip), dominated by three; Vite's 500 kB chunk warning is expected and acceptable for a desktop Electron build. Code splitting is revisited when real content exists.
