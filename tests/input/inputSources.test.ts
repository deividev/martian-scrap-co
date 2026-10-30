import { describe, expect, it } from 'vitest';
import { EMPTY_FRAME, applyRadialDeadzone, clampMove, mergeFrames } from '../../src/input/actions';
import { GamepadSource, type GamepadLike } from '../../src/input/gamepadSource';
import { DEFAULT_INPUT_SETTINGS } from '../../src/input/inputSettings';
import { KeyboardMouseSource } from '../../src/input/keyboardMouseSource';

function pad(axes: number[], pressed: number[] = []): GamepadLike {
  return {
    connected: true,
    mapping: 'standard',
    axes,
    buttons: Array.from({ length: 17 }, (_, index) => ({ pressed: pressed.includes(index) })),
  };
}

describe('action helpers', () => {
  it('normalizes diagonal movement and rejects non-finite values', () => {
    const diagonal = clampMove(1, 1);
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1);
    expect(clampMove(Number.NaN, Number.POSITIVE_INFINITY)).toEqual({ x: 0, y: 0 });
  });

  it('applies a rescaled radial deadzone', () => {
    expect(applyRadialDeadzone(0.1, 0.05, 0.15)).toEqual({ x: 0, y: 0 });
    expect(applyRadialDeadzone(1, 0, 0.15).x).toBeCloseTo(1);
    expect(applyRadialDeadzone(0.575, 0, 0.15).x).toBeCloseTo(0.5);
  });

  it('merges devices: stronger move wins, looks add, buttons OR', () => {
    const merged = mergeFrames(
      { ...EMPTY_FRAME, move: { x: 0.2, y: 0 }, look: { yaw: 0.1, pitch: 0 }, device: 'keyboard-mouse' },
      { ...EMPTY_FRAME, move: { x: 0, y: 0.9 }, look: { yaw: 0.05, pitch: 0.02 }, jump: true, device: 'gamepad' },
    );
    expect(merged.move).toEqual({ x: 0, y: 0.9 });
    expect(merged.look.yaw).toBeCloseTo(0.15);
    expect(merged.jump).toBe(true);
    expect(merged.device).toBe('gamepad');
  });
});

describe('KeyboardMouseSource', () => {
  it('maps WASD and arrows, with jump/interact/pause as single-frame edges', () => {
    const source = new KeyboardMouseSource(DEFAULT_INPUT_SETTINGS);
    source.handleKeyDown('KeyA');
    source.handleKeyDown('ArrowUp');
    source.handleKeyDown('Space');
    const first = source.poll();
    expect(first.move.x).toBeCloseTo(-Math.SQRT1_2);
    expect(first.move.y).toBeCloseTo(Math.SQRT1_2);
    expect(first.jump).toBe(true);
    expect(source.poll().jump).toBe(false);
    source.handleKeyDown('Space', true);
    expect(source.poll().jump).toBe(false);
  });

  it('turns the camera only while the pointer is locked', () => {
    const source = new KeyboardMouseSource(DEFAULT_INPUT_SETTINGS);
    source.handleMouseMove(100, 0, false);
    expect(source.poll().look.yaw).toBe(0);
    source.handleMouseMove(100, -50, true);
    const frame = source.poll();
    expect(frame.look.yaw).toBeCloseTo(-100 * DEFAULT_INPUT_SETTINGS.mouseSensitivity);
    expect(frame.look.pitch).toBeCloseTo(50 * DEFAULT_INPUT_SETTINGS.mouseSensitivity);
  });

  it('releases held keys on blur so movement cannot stick', () => {
    const source = new KeyboardMouseSource(DEFAULT_INPUT_SETTINGS);
    source.handleKeyDown('KeyW');
    source.releaseAll();
    expect(source.poll().move).toEqual({ x: 0, y: 0 });
  });
});

describe('GamepadSource', () => {
  it('reads sticks with deadzone and scales look by time', () => {
    const source = new GamepadSource(DEFAULT_INPUT_SETTINGS, () => [pad([0.05, 0.05, 1, 0])]);
    const frame = source.poll(0.5);
    expect(frame.move).toEqual({ x: 0, y: 0 });
    expect(frame.look.yaw).toBeCloseTo(-DEFAULT_INPUT_SETTINGS.gamepadLookSpeed * 0.5);
    expect(frame.device).toBe('gamepad');
  });

  it('edge-triggers A/X/Start and ignores non-standard or missing pads', () => {
    let current = pad([0, 0, 0, 0], [0, 2, 9]);
    const source = new GamepadSource(DEFAULT_INPUT_SETTINGS, () => [null, current]);
    const pressed = source.poll(1 / 60);
    expect([pressed.jump, pressed.interact, pressed.pause]).toEqual([true, true, true]);
    expect(source.poll(1 / 60).jump).toBe(false);
    current = { ...current, mapping: '' };
    expect(source.poll(1 / 60).device).toBe('none');
    expect(new GamepadSource(DEFAULT_INPUT_SETTINGS, () => []).poll(1 / 60)).toBe(EMPTY_FRAME);
  });

  it('treats NaN axes as centered', () => {
    const frame = new GamepadSource(DEFAULT_INPUT_SETTINGS, () => [pad([Number.NaN, Number.NaN, 0, 0])]).poll(1 / 60);
    expect(frame.move).toEqual({ x: 0, y: 0 });
  });
});

describe('rotate action', () => {
  it('maps R/Q and RB/LB to single-frame rotate steps', () => {
    const keyboard = new KeyboardMouseSource(DEFAULT_INPUT_SETTINGS);
    keyboard.handleKeyDown('KeyR');
    expect(keyboard.poll().rotate).toBe(1);
    expect(keyboard.poll().rotate).toBe(0);
    keyboard.handleKeyDown('KeyQ');
    expect(keyboard.poll().rotate).toBe(-1);
    const source = new GamepadSource(DEFAULT_INPUT_SETTINGS, () => [pad([0, 0, 0, 0], [4])]);
    expect(source.poll(1 / 60).rotate).toBe(-1);
    expect(source.poll(1 / 60).rotate).toBe(0);
  });
});

describe('held use and right click', () => {
  it('reports the use action as held every frame and right click as the secondary action', () => {
    const keyboard = new KeyboardMouseSource(DEFAULT_INPUT_SETTINGS);
    keyboard.handleKeyDown('Mouse0');
    expect(keyboard.poll()).toMatchObject({ interact: true, interactHeld: true });
    expect(keyboard.poll()).toMatchObject({ interact: false, interactHeld: true });
    keyboard.handleKeyUp('Mouse0');
    expect(keyboard.poll().interactHeld).toBe(false);
    keyboard.handleKeyDown('Mouse2');
    expect(keyboard.poll().secondary).toBe(true);
  });

  it('treats RT as a held vacuum trigger on the controller', () => {
    const source = new GamepadSource(DEFAULT_INPUT_SETTINGS, () => [pad([0, 0, 0, 0], [7])]);
    expect(source.poll(1 / 60)).toMatchObject({ interactHeld: true, interact: false, device: 'gamepad' });
  });
});

describe('collector material selector input', () => {
  it('maps only the mouse wheel to material steps and U to the test upgrade', () => {
    const keyboard = new KeyboardMouseSource(DEFAULT_INPUT_SETTINGS);
    keyboard.handleKeyDown('KeyC');
    expect(keyboard.poll().cycleMaterial).toBe(0);
    keyboard.handleKeyDown('KeyZ');
    expect(keyboard.poll().cycleMaterial).toBe(0);
    keyboard.handleWheel(120, false);
    expect(keyboard.poll().cycleMaterial).toBe(0);
    keyboard.handleWheel(120, true);
    expect(keyboard.poll().cycleMaterial).toBe(1);
    keyboard.handleWheel(-120, true);
    expect(keyboard.poll().cycleMaterial).toBe(-1);
    keyboard.handleKeyDown('KeyU');
    expect(keyboard.poll().upgrade).toBe(true);
  });

  it('maps the D-pad to material steps and the test upgrade', () => {
    expect(new GamepadSource(DEFAULT_INPUT_SETTINGS, () => [pad([0, 0, 0, 0], [15])]).poll(1 / 60).cycleMaterial).toBe(
      1,
    );
    expect(new GamepadSource(DEFAULT_INPUT_SETTINGS, () => [pad([0, 0, 0, 0], [14])]).poll(1 / 60).cycleMaterial).toBe(
      -1,
    );
    expect(new GamepadSource(DEFAULT_INPUT_SETTINGS, () => [pad([0, 0, 0, 0], [12])]).poll(1 / 60).upgrade).toBe(true);
  });
});

describe('tool switching input', () => {
  it('maps 1/2 to direct tool slots and the D-pad down to the next tool', () => {
    const keyboard = new KeyboardMouseSource(DEFAULT_INPUT_SETTINGS);
    expect(keyboard.poll().toolSlot).toBeNull();
    keyboard.handleKeyDown('Digit2');
    expect(keyboard.poll().toolSlot).toBe(1);
    expect(keyboard.poll().toolSlot).toBeNull();
    keyboard.handleKeyDown('Numpad1');
    expect(keyboard.poll().toolSlot).toBe(0);
    const frame = new GamepadSource(DEFAULT_INPUT_SETTINGS, () => [pad([0, 0, 0, 0], [13])]).poll(1 / 60);
    expect(frame.cycleTool).toBe(true);
    expect(mergeFrames(EMPTY_FRAME, frame).cycleTool).toBe(true);
    expect(mergeFrames({ ...EMPTY_FRAME, toolSlot: 1 }, EMPTY_FRAME).toolSlot).toBe(1);
  });
});
