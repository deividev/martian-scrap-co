import { describe, expect, it } from 'vitest';
import {
  busGain,
  DEFAULT_AUDIO_SETTINGS,
  loadAudioSettings,
  MAX_CUE_VOICES,
  saveAudioSettings,
  stepVolume,
  VoiceLimiter,
} from '../../src/audio/audioMix';
import {
  cueDuration,
  detectCues,
  PLACEHOLDER_CUES,
  type CueId,
  type CueSnapshot,
} from '../../src/audio/placeholderCues';

const base: CueSnapshot = {
  collected: 0,
  pressKind: 'idle',
  bales: 0,
  credits: 0,
  revealed: false,
  noticeSerial: 0,
  errorNotice: false,
};

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe('placeholder cues', () => {
  it('every cue is marked as a placeholder and names what stays visible when muted', () => {
    for (const [id, cue] of Object.entries(PLACEHOLDER_CUES)) {
      expect(cue.placeholder, id).toBe(true);
      expect(cue.visible.length, id).toBeGreaterThan(10);
      expect(cue.layers.length, id).toBeGreaterThan(0);
      expect(cueDuration(cue), id).toBeLessThanOrEqual(1.5);
      for (const layer of cue.layers) {
        expect(layer.gain, id).toBeGreaterThan(0);
        expect(layer.gain, id).toBeLessThanOrEqual(0.5);
        expect(Math.min(layer.from, layer.to), id).toBeGreaterThan(0);
      }
    }
  });

  it('detects the slice events from state changes', () => {
    expect(detectCues(base, { ...base, collected: 3 })).toEqual(['collect']);
    expect(detectCues({ ...base, collected: 3 }, base)).toEqual(['unload']);
    expect(detectCues(base, { ...base, pressKind: 'processing' })).toEqual(['pressStart']);
    expect(detectCues({ ...base, pressKind: 'processing' }, { ...base, pressKind: 'processing' })).toEqual([]);
    expect(detectCues(base, { ...base, bales: 1 })).toEqual(['pressDone']);
    expect(detectCues(base, { ...base, credits: 40 })).toEqual(['sale']);
    expect(detectCues({ ...base, credits: 80 }, base)).toEqual(['purchase']);
    expect(detectCues(base, { ...base, revealed: true })).toEqual(['reveal']);
    expect(detectCues(base, { ...base, noticeSerial: 1, errorNotice: true })).toEqual(['error']);
    // An informative notice and an unchanged error notice make no sound.
    expect(detectCues(base, { ...base, noticeSerial: 1 })).toEqual([]);
    expect(detectCues({ ...base, errorNotice: true }, { ...base, errorNotice: true })).toEqual([]);
  });
});

describe('audio settings', () => {
  it('steps each channel up and wraps 100% to muted; a muted bus has no gain', () => {
    let settings = { ...DEFAULT_AUDIO_SETTINGS, master: 0.8 };
    settings = stepVolume(settings, 'master');
    expect(settings.master).toBe(1);
    settings = stepVolume(settings, 'master');
    expect(settings.master).toBe(0);
    expect(busGain(settings, 'sfx')).toBe(0);
    expect(busGain(settings, 'ui')).toBe(0);
    settings = stepVolume({ ...settings, master: 1 }, 'ui');
    expect(busGain(settings, 'ui')).toBe(1);
    expect(busGain({ master: 0.6, sfx: 0.4, ui: 1 }, 'sfx')).toBeCloseTo(0.24);
  });

  it('round-trips through local storage and repairs malformed values', () => {
    const storage = memoryStorage();
    saveAudioSettings(storage, { master: 0.4, sfx: 0, ui: 1 });
    expect(loadAudioSettings(storage)).toEqual({ master: 0.4, sfx: 0, ui: 1 });
    expect(loadAudioSettings(memoryStorage({ 'martian-scrap-co.audio': '{bad' }))).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(loadAudioSettings(memoryStorage({ 'martian-scrap-co.audio': '{"master":7,"sfx":"x","ui":0.33}' }))).toEqual({
      master: 1,
      sfx: DEFAULT_AUDIO_SETTINGS.sfx,
      ui: 0.4,
    });
    expect(loadAudioSettings(undefined)).toEqual(DEFAULT_AUDIO_SETTINGS);
    const throwing = {
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(() => saveAudioSettings(throwing, DEFAULT_AUDIO_SETTINGS)).not.toThrow();
  });
});

describe('VoiceLimiter', () => {
  const start = (limiter: VoiceLimiter, id: CueId, now: number) => {
    const cue = PLACEHOLDER_CUES[id];
    return limiter.tryStart(id, cue, now, cueDuration(cue) * 1000);
  };

  it('respects the per-cue retrigger gap and voice cap', () => {
    const limiter = new VoiceLimiter();
    expect(start(limiter, 'collect', 0)).toBe(true);
    expect(start(limiter, 'collect', 10)).toBe(false);
    expect(start(limiter, 'collect', 70)).toBe(true);
    expect(limiter.activeCount(71)).toBe(1);
    expect(limiter.activeCount(200)).toBe(0);
  });

  it('four players acting at once stay bounded and a sale is still heard', () => {
    const limiter = new VoiceLimiter();
    let peak = 0;
    let saleHeard = false;
    let collectHeard = 0;
    // One second at 60 fps: four players vacuum every frame, two unload, the press runs and a sale lands mid-way.
    for (let frame = 0; frame < 60; frame += 1) {
      const now = frame * (1000 / 60);
      for (let player = 0; player < 4; player += 1) if (start(limiter, 'collect', now)) collectHeard += 1;
      if (frame === 5 || frame === 6) start(limiter, 'unload', now);
      if (frame === 10) start(limiter, 'pressStart', now);
      if (frame === 30 && start(limiter, 'sale', now)) saleHeard = true;
      if (frame % 3 === 0) start(limiter, 'uiMove', now);
      peak = Math.max(peak, limiter.activeCount(now));
    }
    expect(peak).toBeLessThanOrEqual(MAX_CUE_VOICES);
    expect(saleHeard).toBe(true);
    // 240 collect events become at most one start per 70 ms gap.
    expect(collectHeard).toBeLessThanOrEqual(15);
    expect(collectHeard).toBeGreaterThan(5);
  });

  it('the global cap refuses new voices when full', () => {
    const limiter = new VoiceLimiter(2);
    expect(limiter.tryStart('sale', { maxVoices: 5, minGapMs: 0 }, 0, 1000)).toBe(true);
    expect(limiter.tryStart('purchase', { maxVoices: 5, minGapMs: 0 }, 0, 1000)).toBe(true);
    expect(limiter.tryStart('reveal', { maxVoices: 5, minGapMs: 0 }, 0, 1000)).toBe(false);
    expect(limiter.tryStart('reveal', { maxVoices: 5, minGapMs: 0 }, 1000, 1000)).toBe(true);
  });
});
