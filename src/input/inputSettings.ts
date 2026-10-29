/** Comfort settings (PRD-022). Stored locally per device in a later task; defaults here. */
export interface InputSettings {
  /** Radians of rotation per pixel of mouse movement. */
  readonly mouseSensitivity: number;
  /** Radians per second at full right-stick tilt. */
  readonly gamepadLookSpeed: number;
  readonly invertY: boolean;
  readonly stickDeadzone: number;
}

export const DEFAULT_INPUT_SETTINGS: InputSettings = Object.freeze({
  mouseSensitivity: 0.0022,
  gamepadLookSpeed: 2.6,
  invertY: false,
  stickDeadzone: 0.15,
});
