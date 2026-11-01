import type { PlaytestBridge } from '../platform/types';
import type { PlaytestEntry } from './playtestRecorder';

/** Where recorder entries go; `flush` sends what is buffered (called every few seconds and on close). */
export interface PlaytestSink {
  readonly target: string;
  push(entry: PlaytestEntry): void;
  flush(): void;
}

const BATCH = 200;

/**
 * DEV-ONLY (MSC-039). Electron: on only when main reports MSC_PLAYTEST_LOG=1, writing to a local file. Browser dev
 * page: on only with `?playtest=1`, kept in `window.__playtestLog` (copy it from the console). Otherwise null, and
 * the game records nothing.
 */
export async function openPlaytestSink(
  bridge: PlaytestBridge | undefined = globalThis.window?.martianPlaytest,
  search: string = globalThis.location?.search ?? '',
): Promise<PlaytestSink | null> {
  if (bridge) {
    const status: unknown = await bridge.status().catch(() => null);
    const record = typeof status === 'object' && status !== null ? (status as Record<string, unknown>) : {};
    if (record['enabled'] !== true) return null;
    const buffer: PlaytestEntry[] = [];
    return {
      target: typeof record['file'] === 'string' ? record['file'] : 'file',
      push: (entry) => void buffer.push(entry),
      flush: () => {
        while (buffer.length > 0) bridge.append(buffer.splice(0, BATCH)).catch(() => undefined);
      },
    };
  }
  if (new URLSearchParams(search).get('playtest') !== '1') return null;
  const log: PlaytestEntry[] = [];
  (globalThis as { __playtestLog?: PlaytestEntry[] }).__playtestLog = log;
  return { target: 'window.__playtestLog', push: (entry) => void log.push(entry), flush: () => undefined };
}
