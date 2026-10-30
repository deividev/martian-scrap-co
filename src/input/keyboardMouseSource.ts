import { clampMove, type ActionFrame } from './actions';
import type { InputSettings } from './inputSettings';

/** Physical key codes (layout independent) per action. Remapping arrives with the settings UI. */
export const KEYBOARD_BINDINGS = Object.freeze({
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  interact: ['KeyE', 'Mouse0'],
  secondary: ['KeyF', 'Mouse2'],
  pause: ['Escape', 'KeyP'],
  rotateRight: ['KeyR'],
  rotateLeft: ['KeyQ'],
  nextMaterial: ['KeyC', 'WheelDown'],
  previousMaterial: ['KeyZ', 'WheelUp'],
  upgrade: ['KeyU'],
});

const EDGE_ACTIONS = [
  'jump',
  'interact',
  'secondary',
  'pause',
  'rotateRight',
  'rotateLeft',
  'nextMaterial',
  'previousMaterial',
  'upgrade',
] as const;
type EdgeAction = (typeof EDGE_ACTIONS)[number];

export class KeyboardMouseSource {
  readonly #held = new Set<string>();
  readonly #pressed = new Set<EdgeAction>();
  #lookYaw = 0;
  #lookPitch = 0;
  #touched = false;
  #settings: InputSettings;

  constructor(settings: InputSettings) {
    this.#settings = settings;
  }

  set settings(settings: InputSettings) {
    this.#settings = settings;
  }

  handleKeyDown(code: string, repeat = false): void {
    this.#touched = true;
    this.#held.add(code);
    if (repeat) return;
    for (const action of EDGE_ACTIONS) {
      if ((KEYBOARD_BINDINGS[action] as readonly string[]).includes(code)) this.#pressed.add(action);
    }
  }

  handleKeyUp(code: string): void {
    this.#held.delete(code);
  }

  /** Mouse movement only turns the camera while the pointer is locked to the game. */
  handleMouseMove(dx: number, dy: number, pointerLocked: boolean): void {
    if (!pointerLocked || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
    this.#touched = true;
    this.#lookYaw -= dx * this.#settings.mouseSensitivity;
    this.#lookPitch -= dy * this.#settings.mouseSensitivity * (this.#settings.invertY ? -1 : 1);
  }

  /** Each wheel notch is a press-and-release of a virtual WheelUp/WheelDown key. */
  handleWheel(deltaY: number, pointerLocked: boolean): void {
    if (!pointerLocked || !Number.isFinite(deltaY) || deltaY === 0) return;
    const code = deltaY > 0 ? 'WheelDown' : 'WheelUp';
    this.handleKeyDown(code);
    this.handleKeyUp(code);
  }

  /** Releases everything, e.g. when the window loses focus, so no key stays stuck. */
  releaseAll(): void {
    this.#held.clear();
    this.#pressed.clear();
  }

  poll(): ActionFrame {
    const any = (codes: readonly string[]): boolean => codes.some((code) => this.#held.has(code));
    const move = clampMove(
      (any(KEYBOARD_BINDINGS.right) ? 1 : 0) - (any(KEYBOARD_BINDINGS.left) ? 1 : 0),
      (any(KEYBOARD_BINDINGS.forward) ? 1 : 0) - (any(KEYBOARD_BINDINGS.back) ? 1 : 0),
    );
    const frame: ActionFrame = {
      move,
      look: { yaw: this.#lookYaw, pitch: this.#lookPitch },
      jump: this.#pressed.has('jump'),
      interact: this.#pressed.has('interact'),
      interactHeld: any(KEYBOARD_BINDINGS.interact),
      secondary: this.#pressed.has('secondary'),
      pause: this.#pressed.has('pause'),
      rotate: this.#pressed.has('rotateRight') ? 1 : this.#pressed.has('rotateLeft') ? -1 : 0,
      cycleMaterial: this.#pressed.has('nextMaterial') ? 1 : this.#pressed.has('previousMaterial') ? -1 : 0,
      upgrade: this.#pressed.has('upgrade'),
      device: this.#touched ? 'keyboard-mouse' : 'none',
    };
    this.#pressed.clear();
    this.#lookYaw = 0;
    this.#lookPitch = 0;
    this.#touched = false;
    return frame;
  }

  /** Wires DOM events; returns a detach function. */
  attach(target: Window, isPointerLocked: () => boolean): () => void {
    const keyDown = (event: KeyboardEvent): void => {
      if (event.code === 'Space' || event.code.startsWith('Arrow')) event.preventDefault();
      this.handleKeyDown(event.code, event.repeat);
    };
    const keyUp = (event: KeyboardEvent): void => this.handleKeyUp(event.code);
    const mouseMove = (event: MouseEvent): void =>
      this.handleMouseMove(event.movementX, event.movementY, isPointerLocked());
    const mouseDown = (event: MouseEvent): void => {
      if (!isPointerLocked()) return;
      if (event.button === 0) this.handleKeyDown('Mouse0');
      if (event.button === 2) this.handleKeyDown('Mouse2');
    };
    const mouseUp = (event: MouseEvent): void => {
      if (event.button === 0) this.handleKeyUp('Mouse0');
      if (event.button === 2) this.handleKeyUp('Mouse2');
    };
    const wheel = (event: WheelEvent): void => this.handleWheel(event.deltaY, isPointerLocked());
    // Right click is a game action (unload), never the browser context menu.
    const contextMenu = (event: MouseEvent): void => event.preventDefault();
    const blur = (): void => this.releaseAll();
    target.addEventListener('keydown', keyDown);
    target.addEventListener('keyup', keyUp);
    target.addEventListener('mousemove', mouseMove);
    target.addEventListener('mousedown', mouseDown);
    target.addEventListener('mouseup', mouseUp);
    target.addEventListener('contextmenu', contextMenu);
    target.addEventListener('wheel', wheel);
    target.addEventListener('blur', blur);
    return () => {
      target.removeEventListener('keydown', keyDown);
      target.removeEventListener('keyup', keyUp);
      target.removeEventListener('mousemove', mouseMove);
      target.removeEventListener('mousedown', mouseDown);
      target.removeEventListener('mouseup', mouseUp);
      target.removeEventListener('contextmenu', contextMenu);
      target.removeEventListener('wheel', wheel);
      target.removeEventListener('blur', blur);
    };
  }
}
