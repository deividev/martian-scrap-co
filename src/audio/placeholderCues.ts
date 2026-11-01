/**
 * PLACEHOLDER sound cues for the vertical slice (MSC-038). Every cue is synthesized at runtime from these few
 * oscillator/noise recipes: original, no files, no samples, no final-audio claim. The approved pipeline (offline
 * recipes rendered to validated WAV, human audition) replaces them in MSC-045–047.
 */

export type CueId =
  | 'collect'
  | 'unload'
  | 'pressStart'
  | 'pressDone'
  | 'sale'
  | 'purchase'
  | 'reveal'
  | 'error'
  | 'uiMove'
  | 'uiConfirm'
  | 'uiBack';

export type AudioBus = 'sfx' | 'ui';

/** One synthesized layer: a pitch glide (or filtered noise) with a short attack and an exponential release. */
export interface CueLayer {
  readonly wave: OscillatorType | 'noise';
  /** Start and end frequency in Hz (for noise: the low-pass cutoff glide). */
  readonly from: number;
  readonly to: number;
  /** Seconds after the cue starts. */
  readonly at: number;
  readonly duration: number;
  /** Peak gain before the bus volumes, 0–1. */
  readonly gain: number;
}

export interface PlaceholderCue {
  readonly placeholder: true;
  readonly bus: AudioBus;
  readonly layers: readonly CueLayer[];
  /** At most this many of this cue sound at once (four players vacuuming must not stack into noise). */
  readonly maxVoices: number;
  /** Ignore a retrigger closer than this to the last start. */
  readonly minGapMs: number;
  /** What stays visible when muted (PRD-022: sound is never the only carrier of essential information). */
  readonly visible: string;
}

const tone = (wave: CueLayer['wave'], from: number, to: number, at: number, duration: number, gain: number) =>
  ({ wave, from, to, at, duration, gain }) satisfies CueLayer;

export const PLACEHOLDER_CUES: Readonly<Record<CueId, PlaceholderCue>> = {
  collect: {
    placeholder: true,
    bus: 'sfx',
    layers: [tone('sine', 520, 820, 0, 0.07, 0.25)],
    maxVoices: 2,
    minGapMs: 70,
    visible: 'Container count in the HUD rises; the piece flies into the collector.',
  },
  unload: {
    placeholder: true,
    bus: 'sfx',
    layers: [tone('noise', 2400, 600, 0, 0.22, 0.3), tone('square', 240, 160, 0.02, 0.16, 0.12)],
    maxVoices: 1,
    minGapMs: 150,
    visible: 'Unload notice with the count; the container empties and the sorting bay bins fill.',
  },
  pressStart: {
    placeholder: true,
    bus: 'sfx',
    layers: [tone('sawtooth', 70, 110, 0, 0.45, 0.16), tone('noise', 400, 900, 0, 0.45, 0.12)],
    maxVoices: 1,
    minGapMs: 300,
    visible: 'Compactor status reads Processing; the press head moves and the lamp turns orange.',
  },
  pressDone: {
    placeholder: true,
    bus: 'sfx',
    layers: [tone('noise', 1200, 200, 0, 0.18, 0.35), tone('sine', 150, 70, 0, 0.3, 0.4)],
    maxVoices: 1,
    minGapMs: 300,
    visible: 'Bale-ready notice; the bale appears on the pad.',
  },
  sale: {
    placeholder: true,
    bus: 'sfx',
    layers: [tone('triangle', 660, 660, 0, 0.12, 0.3), tone('triangle', 990, 990, 0.1, 0.22, 0.3)],
    maxVoices: 2,
    minGapMs: 120,
    visible: 'Sale notice with the credits; the shared balance and the +credits change update.',
  },
  purchase: {
    placeholder: true,
    bus: 'sfx',
    layers: [
      tone('triangle', 523, 523, 0, 0.1, 0.25),
      tone('triangle', 659, 659, 0.09, 0.1, 0.25),
      tone('triangle', 784, 784, 0.18, 0.25, 0.28),
    ],
    maxVoices: 1,
    minGapMs: 200,
    visible: 'Shop success message; the balance shows the −credits change and the new collector level.',
  },
  reveal: {
    placeholder: true,
    bus: 'sfx',
    layers: [
      tone('sine', 392, 392, 0, 1.1, 0.2),
      tone('sine', 494, 494, 0.15, 1, 0.18),
      tone('sine', 587, 587, 0.3, 0.9, 0.18),
    ],
    maxVoices: 1,
    minGapMs: 1000,
    visible: 'Station-revealed notice; the beacon lights up.',
  },
  error: {
    placeholder: true,
    bus: 'ui',
    layers: [tone('square', 190, 170, 0, 0.09, 0.14), tone('square', 170, 150, 0.12, 0.11, 0.14)],
    maxVoices: 1,
    minGapMs: 200,
    visible: 'The notice or menu message explains what failed and what to do.',
  },
  uiMove: {
    placeholder: true,
    bus: 'ui',
    layers: [tone('sine', 1200, 1200, 0, 0.03, 0.12)],
    maxVoices: 1,
    minGapMs: 40,
    visible: 'The focused control shows the orange ring and the ▶ marker.',
  },
  uiConfirm: {
    placeholder: true,
    bus: 'ui',
    layers: [tone('sine', 880, 1320, 0, 0.07, 0.15)],
    maxVoices: 1,
    minGapMs: 60,
    visible: 'The menu changes or shows a result message.',
  },
  uiBack: {
    placeholder: true,
    bus: 'ui',
    layers: [tone('sine', 700, 480, 0, 0.07, 0.13)],
    maxVoices: 1,
    minGapMs: 60,
    visible: 'The menu closes.',
  },
};

/** Seconds a cue lasts (its longest layer end). */
export function cueDuration(cue: PlaceholderCue): number {
  return Math.max(...cue.layers.map((layer) => layer.at + layer.duration));
}

/** What the yard looks like for sound purposes; any player's change (host or replicated) produces the same cue. */
export interface CueSnapshot {
  readonly collected: number;
  readonly pressKind: 'idle' | 'loading' | 'processing' | 'blocked';
  readonly bales: number;
  readonly credits: number;
  readonly revealed: boolean;
  /** Changes whenever a new notice is shown; `errorNotice` says whether that notice reports a failure. */
  readonly noticeSerial: number;
  readonly errorNotice: boolean;
}

/** Cues implied by the change between two snapshots, in a stable order. */
export function detectCues(previous: CueSnapshot, next: CueSnapshot): CueId[] {
  const cues: CueId[] = [];
  if (next.collected > previous.collected) cues.push('collect');
  else if (next.collected < previous.collected) cues.push('unload');
  if (next.pressKind === 'processing' && previous.pressKind !== 'processing') cues.push('pressStart');
  if (next.bales > previous.bales) cues.push('pressDone');
  if (next.credits > previous.credits) cues.push('sale');
  else if (next.credits < previous.credits) cues.push('purchase');
  if (next.revealed && !previous.revealed) cues.push('reveal');
  if (next.noticeSerial !== previous.noticeSerial && next.errorNotice) cues.push('error');
  return cues;
}
