/** Device the player used most recently; prompts follow it (PRD-022). */
export type InputDevice = 'keyboard-mouse' | 'gamepad' | 'none';

/**
 * One action vocabulary for every device (architecture §1). Gameplay reads only this frame,
 * never raw keys or buttons.
 */
export interface ActionFrame {
  /** Strafe (x, right positive) and forward (y, forward positive); magnitude at most 1. */
  readonly move: { readonly x: number; readonly y: number };
  /** Camera rotation requested this frame, in radians. */
  readonly look: { readonly yaw: number; readonly pitch: number };
  /** Edge-triggered: true only on the frame the action was pressed. */
  readonly jump: boolean;
  readonly interact: boolean;
  /** True every frame the use action is held (vacuum suction). */
  readonly interactHeld: boolean;
  /** Context action, e.g. unload a cart. */
  readonly secondary: boolean;
  readonly pause: boolean;
  /** Edge-triggered rotate step for a held object: -1, 0 or 1. */
  readonly rotate: -1 | 0 | 1;
  /** Edge-triggered step through the collector's unlocked materials: -1, 0 or 1. */
  readonly cycleMaterial: -1 | 0 | 1;
  /** Test-yard stand-in for buying an upgrade of the equipped tool until the shared-credit store exists. */
  readonly upgrade: boolean;
  /** Edge-triggered: zero-based tool slot picked directly this frame, or null. */
  readonly toolSlot: number | null;
  /** Edge-triggered: switch to the next owned tool. */
  readonly cycleTool: boolean;
  readonly device: InputDevice;
}

export const EMPTY_FRAME: ActionFrame = Object.freeze({
  move: Object.freeze({ x: 0, y: 0 }),
  look: Object.freeze({ yaw: 0, pitch: 0 }),
  jump: false,
  interact: false,
  interactHeld: false,
  secondary: false,
  pause: false,
  rotate: 0,
  cycleMaterial: 0,
  upgrade: false,
  toolSlot: null,
  cycleTool: false,
  device: 'none',
});

/** Clamps a move vector to the unit circle so diagonals are not faster. */
export function clampMove(x: number, y: number): { x: number; y: number } {
  const safeX = Number.isFinite(x) ? x : 0;
  const safeY = Number.isFinite(y) ? y : 0;
  const length = Math.hypot(safeX, safeY);
  return length > 1 ? { x: safeX / length, y: safeY / length } : { x: safeX, y: safeY };
}

/** Radial deadzone that rescales the remaining range so small tilts still start at zero. */
export function applyRadialDeadzone(x: number, y: number, deadzone: number): { x: number; y: number } {
  const length = Math.hypot(x, y);
  if (!Number.isFinite(length) || length <= deadzone) return { x: 0, y: 0 };
  const scaled = Math.min((length - deadzone) / (1 - deadzone), 1);
  return { x: (x / length) * scaled, y: (y / length) * scaled };
}

function moveMagnitude(frame: ActionFrame): number {
  return Math.hypot(frame.move.x, frame.move.y);
}

/** Combines device frames: the stronger move wins, looks add up, buttons are OR-ed. */
export function mergeFrames(primary: ActionFrame, secondary: ActionFrame): ActionFrame {
  const move = moveMagnitude(secondary) > moveMagnitude(primary) ? secondary.move : primary.move;
  const secondaryActive =
    secondary.device !== 'none' &&
    (moveMagnitude(secondary) > 0 ||
      secondary.look.yaw !== 0 ||
      secondary.look.pitch !== 0 ||
      secondary.jump ||
      secondary.interact ||
      secondary.interactHeld ||
      secondary.secondary ||
      secondary.pause ||
      secondary.rotate !== 0 ||
      secondary.cycleMaterial !== 0 ||
      secondary.upgrade ||
      secondary.toolSlot !== null ||
      secondary.cycleTool);
  return {
    move,
    look: { yaw: primary.look.yaw + secondary.look.yaw, pitch: primary.look.pitch + secondary.look.pitch },
    jump: primary.jump || secondary.jump,
    interact: primary.interact || secondary.interact,
    interactHeld: primary.interactHeld || secondary.interactHeld,
    secondary: primary.secondary || secondary.secondary,
    pause: primary.pause || secondary.pause,
    rotate: primary.rotate !== 0 ? primary.rotate : secondary.rotate,
    cycleMaterial: primary.cycleMaterial !== 0 ? primary.cycleMaterial : secondary.cycleMaterial,
    upgrade: primary.upgrade || secondary.upgrade,
    toolSlot: primary.toolSlot ?? secondary.toolSlot,
    cycleTool: primary.cycleTool || secondary.cycleTool,
    device: secondaryActive ? secondary.device : primary.device,
  };
}
