import { busGain, VoiceLimiter, type AudioSettings } from './audioMix';
import { cueDuration, PLACEHOLDER_CUES, type AudioBus, type CueId, type CueLayer } from './placeholderCues';

/**
 * Plays the placeholder cues through Web Audio (MSC-038): master → sfx/ui buses, bounded voices. The context is
 * created on first use and resumed on the first key, click or tap (browsers keep audio suspended until a gesture).
 * A missing or failing audio device never affects the game: cues are then silently skipped.
 */
export class SoundBoard {
  readonly #limiter = new VoiceLimiter();
  readonly #played = new Map<CueId, number>();
  #settings: AudioSettings;
  #context: AudioContext | null = null;
  #buses: Record<AudioBus, GainNode> | null = null;
  #noise: AudioBuffer | null = null;
  #failed = false;

  constructor(settings: AudioSettings) {
    this.#settings = settings;
  }

  get settings(): AudioSettings {
    return this.#settings;
  }

  /** 'off' until the first cue, then the Web Audio state ('suspended' until a user gesture). */
  get state(): string {
    if (this.#failed) return 'unavailable';
    return this.#context?.state ?? 'off';
  }

  /** Cue start counts since launch (evidence for checks; skipped cues are not counted). */
  played(): Readonly<Record<string, number>> {
    return Object.fromEntries(this.#played);
  }

  setSettings(settings: AudioSettings): void {
    this.#settings = settings;
    if (!this.#context || !this.#buses) return;
    const at = this.#context.currentTime;
    for (const bus of ['sfx', 'ui'] as const) this.#buses[bus].gain.setTargetAtTime(busGain(settings, bus), at, 0.02);
  }

  /** Call from a user gesture (key, click, tap): lets the browser start audio. */
  unlock(): void {
    const context = this.#ensure();
    if (context?.state === 'suspended') context.resume().catch(() => undefined);
  }

  play(id: CueId): void {
    const cue = PLACEHOLDER_CUES[id];
    // A muted bus plays nothing (and keeps no voice), so muting also frees the voice budget.
    if (busGain(this.#settings, cue.bus) <= 0) return;
    const context = this.#ensure();
    if (!context || !this.#buses || context.state !== 'running') return;
    const durationMs = cueDuration(cue) * 1000;
    if (!this.#limiter.tryStart(id, cue, performance.now(), durationMs)) return;
    this.#played.set(id, (this.#played.get(id) ?? 0) + 1);
    const start = context.currentTime + 0.005;
    for (const layer of cue.layers) this.#layer(context, this.#buses[cue.bus], layer, start);
  }

  dispose(): void {
    this.#context?.close().catch(() => undefined);
    this.#context = null;
    this.#buses = null;
  }

  #ensure(): AudioContext | null {
    if (this.#context || this.#failed) return this.#context;
    try {
      const context = new AudioContext();
      // Each bus carries master × its own volume, so a single gain per bus is enough.
      const bus = (name: AudioBus): GainNode => {
        const node = context.createGain();
        node.gain.value = busGain(this.#settings, name);
        node.connect(context.destination);
        return node;
      };
      this.#buses = { sfx: bus('sfx'), ui: bus('ui') };
      // One second of white noise, shared by every noise layer.
      const noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
      const data = noise.getChannelData(0);
      for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
      this.#noise = noise;
      this.#context = context;
    } catch {
      this.#failed = true;
    }
    return this.#context;
  }

  #layer(context: AudioContext, output: GainNode, layer: CueLayer, start: number): void {
    const begin = start + layer.at;
    const end = begin + layer.duration;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, begin);
    envelope.gain.exponentialRampToValueAtTime(layer.gain, begin + Math.min(0.01, layer.duration / 4));
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);
    envelope.connect(output);
    let source: AudioScheduledSourceNode;
    if (layer.wave === 'noise') {
      const noise = context.createBufferSource();
      noise.buffer = this.#noise;
      noise.loop = true;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(layer.from, begin);
      filter.frequency.exponentialRampToValueAtTime(layer.to, end);
      noise.connect(filter);
      filter.connect(envelope);
      source = noise;
    } else {
      const oscillator = context.createOscillator();
      oscillator.type = layer.wave;
      oscillator.frequency.setValueAtTime(layer.from, begin);
      if (layer.to !== layer.from) oscillator.frequency.exponentialRampToValueAtTime(layer.to, end);
      oscillator.connect(envelope);
      source = oscillator;
    }
    source.start(begin);
    source.stop(end + 0.02);
    source.onended = () => envelope.disconnect();
  }
}
