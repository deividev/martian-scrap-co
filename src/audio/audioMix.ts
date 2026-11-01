import type { AudioBus, CueId } from './placeholderCues';

/** Volume steps offered by the menu: confirm moves up one step and wraps from 100% to muted. */
export const VOLUME_STEPS = [0, 0.2, 0.4, 0.6, 0.8, 1] as const;

export interface AudioSettings {
  readonly master: number;
  readonly sfx: number;
  readonly ui: number;
}

export type VolumeChannel = keyof AudioSettings;

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = { master: 0.8, sfx: 1, ui: 0.8 };

const STORAGE_KEY = 'martian-scrap-co.audio';

const snap = (value: unknown, fallback: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return VOLUME_STEPS.reduce((best, step) => (Math.abs(step - value) < Math.abs(best - value) ? step : best), 0);
};

/** Reads this device's volumes; anything missing or malformed falls back to the defaults. */
export function loadAudioSettings(storage: Pick<Storage, 'getItem'> | undefined): AudioSettings {
  let raw: unknown;
  try {
    raw = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null');
  } catch {
    raw = null;
  }
  const saved = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    master: snap(saved['master'], DEFAULT_AUDIO_SETTINGS.master),
    sfx: snap(saved['sfx'], DEFAULT_AUDIO_SETTINGS.sfx),
    ui: snap(saved['ui'], DEFAULT_AUDIO_SETTINGS.ui),
  };
}

/** Stores this device's volumes (a local comfort setting, never part of the host campaign). */
export function saveAudioSettings(storage: Pick<Storage, 'setItem'> | undefined, settings: AudioSettings): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable (private window, quota); the volumes then last for this session only.
  }
}

/** The next menu step for one channel: up by one, from 100% back to muted. */
export function stepVolume(settings: AudioSettings, channel: VolumeChannel): AudioSettings {
  const index = VOLUME_STEPS.findIndex((step) => step === settings[channel]);
  const next = VOLUME_STEPS[(index + 1) % VOLUME_STEPS.length] ?? 0;
  return { ...settings, [channel]: next };
}

/** Gain applied to one bus: master times the bus volume. */
export function busGain(settings: AudioSettings, bus: AudioBus): number {
  return settings.master * settings[bus];
}

/** Total simultaneous cue voices (playback sources, not chat): a bound for four players acting at once. */
export const MAX_CUE_VOICES = 8;

/**
 * Bounds overlapping cues (MSC-038, architecture §9 playback-voice caps). A cue starts only when its own voice cap,
 * its retrigger gap and the global cap allow it; nothing is queued, a skipped cue is simply not heard (its visual
 * feedback still shows).
 */
export class VoiceLimiter {
  readonly #active: { cue: CueId; until: number }[] = [];
  readonly #lastStart = new Map<CueId, number>();

  constructor(readonly maxVoices = MAX_CUE_VOICES) {}

  /** Voices still sounding at `now` (ms). */
  activeCount(now: number): number {
    this.#expire(now);
    return this.#active.length;
  }

  tryStart(cue: CueId, rules: { maxVoices: number; minGapMs: number }, now: number, durationMs: number): boolean {
    this.#expire(now);
    const last = this.#lastStart.get(cue);
    if (last !== undefined && now - last < rules.minGapMs) return false;
    if (this.#active.filter((voice) => voice.cue === cue).length >= rules.maxVoices) return false;
    if (this.#active.length >= this.maxVoices) return false;
    this.#active.push({ cue, until: now + durationMs });
    this.#lastStart.set(cue, now);
    return true;
  }

  #expire(now: number): void {
    for (let index = this.#active.length - 1; index >= 0; index -= 1) {
      if ((this.#active[index]?.until ?? 0) <= now) this.#active.splice(index, 1);
    }
  }
}
