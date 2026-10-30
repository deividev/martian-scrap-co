import { EMPTY_FRAME, applyRadialDeadzone, type ActionFrame } from './actions';
import type { InputSettings } from './inputSettings';

/** Standard-mapping indices (W3C Gamepad "standard" layout; Xbox naming). */
export const GAMEPAD_BINDINGS = Object.freeze({
  moveAxes: [0, 1],
  lookAxes: [2, 3],
  jump: 0, // A
  interact: 2, // X
  secondary: 3, // Y
  pause: 9, // Start / Menu
  rotateLeft: 4, // LB
  rotateRight: 5, // RB
  vacuum: 7, // RT (held)
  upgrade: 12, // D-pad up (test-yard stand-in for the store)
  nextTool: 13, // D-pad down
  previousMaterial: 14, // D-pad left
  nextMaterial: 15, // D-pad right
});

/** The subset of the Gamepad API this source reads; lets tests pass plain objects. */
export interface GamepadLike {
  readonly connected: boolean;
  readonly mapping: string;
  readonly axes: readonly number[];
  readonly buttons: readonly { readonly pressed: boolean }[];
}

export type GamepadProvider = () => readonly (GamepadLike | null)[];

const browserGamepads: GamepadProvider = () =>
  typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];

export class GamepadSource {
  readonly #provider: GamepadProvider;
  #settings: InputSettings;
  #previous = new Set<number>();

  constructor(settings: InputSettings, provider: GamepadProvider = browserGamepads) {
    this.#settings = settings;
    this.#provider = provider;
  }

  set settings(settings: InputSettings) {
    this.#settings = settings;
  }

  /** Reads the first connected standard-mapped pad; `dt` scales stick look to radians. */
  poll(dt: number): ActionFrame {
    const pad = this.#provider().find((candidate) => candidate?.connected && candidate.mapping === 'standard');
    if (!pad || !Number.isFinite(dt) || dt <= 0) {
      this.#previous.clear();
      return EMPTY_FRAME;
    }
    const axis = (index: number | undefined): number => {
      const value = index === undefined ? 0 : (pad.axes[index] ?? 0);
      return Number.isFinite(value) ? value : 0;
    };
    const [mx, my] = GAMEPAD_BINDINGS.moveAxes;
    const [lx, ly] = GAMEPAD_BINDINGS.lookAxes;
    const move = applyRadialDeadzone(axis(mx), -axis(my), this.#settings.stickDeadzone);
    const look = applyRadialDeadzone(axis(lx), axis(ly), this.#settings.stickDeadzone);
    const pressedNow = new Set<number>();
    pad.buttons.forEach((button, index) => {
      if (button.pressed) pressedNow.add(index);
    });
    const edge = (index: number): boolean => pressedNow.has(index) && !this.#previous.has(index);
    const frame: ActionFrame = {
      move,
      look: {
        yaw: -look.x * this.#settings.gamepadLookSpeed * dt,
        pitch: -look.y * this.#settings.gamepadLookSpeed * dt * (this.#settings.invertY ? -1 : 1),
      },
      jump: edge(GAMEPAD_BINDINGS.jump),
      interact: edge(GAMEPAD_BINDINGS.interact),
      interactHeld: pressedNow.has(GAMEPAD_BINDINGS.interact) || pressedNow.has(GAMEPAD_BINDINGS.vacuum),
      secondary: edge(GAMEPAD_BINDINGS.secondary),
      pause: edge(GAMEPAD_BINDINGS.pause),
      rotate: edge(GAMEPAD_BINDINGS.rotateRight) ? 1 : edge(GAMEPAD_BINDINGS.rotateLeft) ? -1 : 0,
      cycleMaterial: edge(GAMEPAD_BINDINGS.nextMaterial) ? 1 : edge(GAMEPAD_BINDINGS.previousMaterial) ? -1 : 0,
      upgrade: edge(GAMEPAD_BINDINGS.upgrade),
      toolSlot: null,
      cycleTool: edge(GAMEPAD_BINDINGS.nextTool),
      device: 'gamepad',
    };
    this.#previous = pressedNow;
    const idle = move.x === 0 && move.y === 0 && look.x === 0 && look.y === 0 && pressedNow.size === 0;
    return idle ? { ...frame, device: 'none' } : frame;
  }
}
