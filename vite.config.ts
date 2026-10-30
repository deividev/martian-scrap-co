import { execSync } from 'node:child_process';
import { defineConfig, type Plugin } from 'vite';

// Production renderer CSP, delivered as a meta tag because packaged pages load from local files.
// The Electron main process sets a looser header only for the loopback dev server.
const PRODUCTION_CSP = [
  "default-src 'self'",
  // Rapier compiles its WebAssembly module at runtime; this allows WASM only, not JS eval.
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function productionCsp(): Plugin {
  return {
    name: 'msc-production-csp',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: PRODUCTION_CSP },
        injectTo: 'head-prepend',
      },
    ],
  };
}

/** Short commit hash recorded in benchmark/evidence reports; `-dirty` marks uncommitted changes. */
function buildHash(): string {
  try {
    const hash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    const dirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim().length > 0;
    return dirty ? `${hash}-dirty` : hash;
  } catch {
    return 'unknown';
  }
}

// Relative base so the packaged app can load assets from local files (architecture §4).
export default defineConfig({
  base: './',
  plugins: [productionCsp()],
  define: {
    __BUILD_HASH__: JSON.stringify(buildHash()),
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    // Keep assets as real files so packaged relative loading is exercised.
    assetsInlineLimit: 0,
  },
});
