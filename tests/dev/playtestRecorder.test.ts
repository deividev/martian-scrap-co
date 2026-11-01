import { describe, expect, it } from 'vitest';
import {
  PlaytestRecorder,
  STUCK_AFTER_MS,
  type PlaytestEntry,
  type PlaytestSnapshot,
} from '../../src/dev/playtestRecorder';
import { openPlaytestSink } from '../../src/dev/playtestSink';

const start: PlaytestSnapshot = {
  collected: 0,
  intake: 0,
  pressKind: 'idle',
  bales: 0,
  holdingBale: false,
  credits: 0,
  collectorTier: 1,
  revealed: false,
  clearing: 0,
  cuts: 0,
  cartLoads: 0,
  cartPushed: false,
  equipped: 'magnetic-collector',
  menu: null,
  device: 'keyboard-mouse',
  muted: false,
  job: 'Vacuum',
  notice: null,
  noticeSerial: 0,
  saveRevision: 0,
};

function session() {
  const entries: PlaytestEntry[] = [];
  const recorder = new PlaytestRecorder((entry) => entries.push(entry), 1000);
  recorder.begin(1000, start, { campaign: 'new' });
  const milestones = () => entries.filter((entry) => entry.type === 'milestone').map((entry) => [entry['id'], entry.t]);
  return { recorder, entries, milestones };
}

describe('PlaytestRecorder', () => {
  it('times each milestone once along the slice route', () => {
    const { recorder, entries, milestones } = session();
    let state = start;
    const step = (at: number, change: Partial<PlaytestSnapshot>) => {
      state = { ...state, ...change };
      recorder.observe(at, state);
    };
    step(4000, { collected: 1 });
    step(4500, { collected: 2 });
    step(30_000, { collected: 0, intake: 10, job: 'Unload' });
    step(31_000, { pressKind: 'processing' });
    step(40_000, { pressKind: 'idle', bales: 1, intake: 0 });
    step(45_000, { holdingBale: true });
    step(50_000, { holdingBale: false, bales: 0, credits: 40 });
    step(52_000, { menu: 'shop' });
    recorder.note(53_000, 'purchase-failed', { price: 80, balance: 40 });
    step(54_000, { menu: null });
    step(90_000, { credits: 0, collectorTier: 2 });
    step(95_000, { cuts: 1, equipped: 'cutter' });
    step(96_000, { cartPushed: true });
    step(97_000, { menu: 'pause' });
    step(98_000, { revealed: true });
    expect(milestones()).toEqual([
      ['M1', 3],
      ['M2', 29],
      ['M3', 30],
      ['M4', 44],
      ['M5', 49],
      ['M6', 51],
      ['M7', 52],
      ['M8', 89],
      ['M10', 94],
      ['M11', 95],
      ['M12', 96],
      ['M9', 97],
    ]);
    expect(entries.find((entry) => entry.type === 'unload')).toMatchObject({ pieces: 10, kept: 0 });
    expect(entries.find((entry) => entry.type === 'sale')).toMatchObject({ credits: 40, balance: 40 });
    expect(entries.find((entry) => entry.type === 'purchase')).toMatchObject({ cost: 40 });
    recorder.end(99_000);
    expect(entries.at(-1)).toMatchObject({ type: 'session-end', notReached: [] });
  });

  it('logs job durations and one same-job warning after three minutes', () => {
    const { recorder, entries } = session();
    recorder.observe(1000 + STUCK_AFTER_MS - 1, start);
    expect(entries.some((entry) => entry.type === 'same-job-3min')).toBe(false);
    recorder.observe(1000 + STUCK_AFTER_MS, start);
    recorder.observe(1000 + STUCK_AFTER_MS + 5000, start);
    expect(entries.filter((entry) => entry.type === 'same-job-3min')).toHaveLength(1);
    recorder.observe(1000 + STUCK_AFTER_MS + 6000, { ...start, job: 'Unload' });
    expect(entries.find((entry) => entry.type === 'job-end')).toMatchObject({ job: 'Vacuum', seconds: 186 });
  });

  it('records device switches, muting, notices and saves; the session start carries the opened state', () => {
    const { recorder, entries } = session();
    expect(entries[0]).toMatchObject({ t: 0, type: 'session-start', campaign: 'new', state: { credits: 0 } });
    recorder.observe(2000, { ...start, device: 'gamepad', muted: true, notice: 'cart.full', noticeSerial: 1 });
    recorder.observe(3000, { ...start, device: 'none', muted: false, saveRevision: 1, noticeSerial: 1 });
    expect(entries.map((entry) => entry.type)).toEqual(
      expect.arrayContaining(['device', 'mute-on', 'notice', 'mute-off', 'saved']),
    );
    expect(entries.filter((entry) => entry.type === 'device')).toHaveLength(1);
    recorder.end(4000);
    expect(entries.at(-1)).toMatchObject({ type: 'session-end' });
    expect(entries.at(-1)?.['notReached']).toHaveLength(12);
  });
});

describe('openPlaytestSink', () => {
  it('is off unless the desktop shell reports it enabled, or the dev page asks with ?playtest=1', async () => {
    const off = { status: () => Promise.resolve({ enabled: false, file: null }), append: () => Promise.resolve(0) };
    expect(await openPlaytestSink(off, '?playtest=1')).toBeNull();
    expect(await openPlaytestSink(undefined, '')).toBeNull();
    const sent: unknown[] = [];
    const on = {
      status: () => Promise.resolve({ enabled: true, file: 'playtest-x.jsonl' }),
      append: (entries: readonly object[]) => {
        sent.push(...entries);
        return Promise.resolve(entries.length);
      },
    };
    const sink = await openPlaytestSink(on, '');
    expect(sink?.target).toBe('playtest-x.jsonl');
    sink?.push({ t: 0, type: 'job' });
    expect(sent).toHaveLength(0);
    sink?.flush();
    expect(sent).toEqual([{ t: 0, type: 'job' }]);
    const page = await openPlaytestSink(undefined, '?playtest=1');
    expect(page?.target).toBe('window.__playtestLog');
  });
});
