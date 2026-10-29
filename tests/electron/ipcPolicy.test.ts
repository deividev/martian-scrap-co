import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  IPC_CHANNELS,
  MAX_IPC_PAYLOAD_BYTES,
  isAllowedChannel,
  isTrustedSenderUrl,
  resolveDevServerUrl,
  validateInvoke,
} from '../../electron/ipcPolicy';

const INDEX_URL = 'file:///C:/Games/Martian%20Scrap%20Co/resources/app.asar/dist/index.html';

describe('validateInvoke', () => {
  it('accepts the approved channel with the expected arity', () => {
    expect(validateInvoke(IPC_CHANNELS.getAppInfo, [])).toEqual({ ok: true, channel: 'app:get-info' });
  });

  it.each(['app:quit', 'fs:read', 'shell:open-external', '', 'APP:GET-INFO'])('rejects unapproved channel %j', (channel) => {
    expect(validateInvoke(channel, []).ok).toBe(false);
  });

  it('rejects unexpected arguments on a zero-argument channel', () => {
    expect(validateInvoke(IPC_CHANNELS.getAppInfo, ['../../secrets']).ok).toBe(false);
  });

  it('rejects payloads that cannot be serialized', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;
    expect(validateInvoke(IPC_CHANNELS.getAppInfo, [cyclic]).ok).toBe(false);
  });

  it('exposes a bounded payload limit', () => {
    expect(MAX_IPC_PAYLOAD_BYTES).toBeGreaterThan(0);
    expect(MAX_IPC_PAYLOAD_BYTES).toBeLessThanOrEqual(64 * 1024);
  });
});

describe('resolveDevServerUrl', () => {
  it('accepts loopback http origins only', () => {
    expect(resolveDevServerUrl('http://127.0.0.1:5173')).toBe('http://127.0.0.1:5173');
    expect(resolveDevServerUrl('http://localhost:5173/path')).toBe('http://localhost:5173');
  });

  it.each([undefined, '', 'not a url', 'http://192.168.1.10:5173', 'https://evil.example', 'file:///C:/x.html', 'javascript:alert(1)'])(
    'rejects %j',
    (raw) => {
      expect(resolveDevServerUrl(raw)).toBeNull();
    },
  );
});

describe('isTrustedSenderUrl', () => {
  it('trusts only the exact packaged index file when no dev server is set', () => {
    expect(isTrustedSenderUrl(INDEX_URL, null, INDEX_URL)).toBe(true);
    expect(isTrustedSenderUrl('file:///C:/Users/x/Downloads/evil.html', null, INDEX_URL)).toBe(false);
    expect(isTrustedSenderUrl('https://example.com/', null, INDEX_URL)).toBe(false);
  });

  it('trusts only the dev server origin when one is set', () => {
    const dev = 'http://127.0.0.1:5173';
    expect(isTrustedSenderUrl('http://127.0.0.1:5173/', dev, INDEX_URL)).toBe(true);
    expect(isTrustedSenderUrl('http://127.0.0.1:5174/', dev, INDEX_URL)).toBe(false);
    expect(isTrustedSenderUrl(INDEX_URL, dev, INDEX_URL)).toBe(false);
  });

  it('rejects missing or malformed sender URLs', () => {
    expect(isTrustedSenderUrl(undefined, null, INDEX_URL)).toBe(false);
    expect(isTrustedSenderUrl('::::', null, INDEX_URL)).toBe(false);
  });
});

describe('preload readback', () => {
  const preload = readFileSync(new URL('../../electron/preload.cts', import.meta.url), 'utf8');

  it('invokes only approved channels', () => {
    const channels = [...preload.matchAll(/invoke\('([^']+)'/g)].map((match) => match[1] ?? '');
    expect(channels.length).toBeGreaterThan(0);
    for (const channel of channels) expect(isAllowedChannel(channel)).toBe(true);
  });

  it('never exposes raw ipcRenderer or generic send/on helpers', () => {
    expect(preload).not.toMatch(/exposeInMainWorld\([^)]*ipcRenderer/);
    expect(preload).not.toMatch(/ipcRenderer\.(send|sendSync|on|once)\b/);
  });
});
