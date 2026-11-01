import { describe, expect, it } from 'vitest';
import { EMPTY_FRAME, mergeFrames } from '../../src/input/actions';
import { GamepadSource, type GamepadLike } from '../../src/input/gamepadSource';
import { DEFAULT_INPUT_SETTINGS } from '../../src/input/inputSettings';
import { KeyboardMouseSource } from '../../src/input/keyboardMouseSource';
import { MenuFocus } from '../../src/presentation/menuFocus';

function pad(axes: number[], pressed: number[] = []): GamepadLike {
  return {
    connected: true,
    mapping: 'standard',
    axes,
    buttons: Array.from({ length: 17 }, (_, index) => ({ pressed: pressed.includes(index) })),
  };
}

describe('menu input', () => {
  it('keyboard: W/S and arrows step focus, E/Enter/click confirm, Esc/Backspace/right click go back', () => {
    const source = new KeyboardMouseSource(DEFAULT_INPUT_SETTINGS);
    source.handleKeyDown('ArrowDown');
    expect(source.poll()).toMatchObject({ navigate: 1, confirm: false, back: false });
    source.handleKeyUp('ArrowDown');
    source.handleKeyDown('KeyW');
    expect(source.poll().navigate).toBe(-1);
    expect(source.poll().navigate).toBe(0);
    for (const code of ['Enter', 'KeyE', 'Mouse0']) {
      source.handleKeyDown(code);
      expect(source.poll().confirm).toBe(true);
      source.handleKeyUp(code);
    }
    for (const code of ['Escape', 'Backspace', 'Mouse2']) {
      source.handleKeyDown(code);
      expect(source.poll().back).toBe(true);
      source.handleKeyUp(code);
    }
  });

  it('controller: D-pad steps, A/X confirm, B backs, and the stick steps once per tilt', () => {
    let state = pad([0, 0, 0, 0]);
    const source = new GamepadSource(DEFAULT_INPUT_SETTINGS, () => [state]);
    state = pad([0, 0, 0, 0], [13]);
    expect(source.poll(0.016).navigate).toBe(1);
    state = pad([0, 0, 0, 0], [12]);
    expect(source.poll(0.016).navigate).toBe(-1);
    state = pad([0, 0, 0, 0], [0]);
    expect(source.poll(0.016).confirm).toBe(true);
    state = pad([0, 0, 0, 0], [1]);
    expect(source.poll(0.016).back).toBe(true);
    // Stick pushed down: one step, no repeat while held, re-armed after release.
    state = pad([0, 0.9, 0, 0]);
    expect(source.poll(0.016).navigate).toBe(1);
    expect(source.poll(0.016).navigate).toBe(0);
    state = pad([0, 0.45, 0, 0]);
    expect(source.poll(0.016).navigate).toBe(0);
    state = pad([0, 0.1, 0, 0]);
    source.poll(0.016);
    state = pad([0, -0.8, 0, 0]);
    expect(source.poll(0.016).navigate).toBe(-1);
  });

  it('merging keeps menu actions from either device', () => {
    const merged = mergeFrames(
      { ...EMPTY_FRAME, device: 'keyboard-mouse' },
      { ...EMPTY_FRAME, navigate: 1, back: true, device: 'gamepad' },
    );
    expect(merged).toMatchObject({ navigate: 1, back: true, confirm: false, device: 'gamepad' });
  });
});

describe('MenuFocus', () => {
  const frame = (overrides: Partial<{ navigate: -1 | 0 | 1; confirm: boolean; back: boolean }>) => ({
    navigate: 0 as const,
    confirm: false,
    back: false,
    ...overrides,
  });

  it('starts on the first control, wraps both ways and activates the focused one', () => {
    const focus = new MenuFocus([
      { id: 'buy', enabled: true },
      { id: 'back', enabled: true },
    ]);
    expect(focus.focused).toBe('buy');
    expect(focus.apply(frame({ navigate: 1 }))).toEqual({ kind: 'none' });
    expect(focus.focused).toBe('back');
    focus.apply(frame({ navigate: 1 }));
    expect(focus.focused).toBe('buy');
    focus.apply(frame({ navigate: -1 }));
    expect(focus.apply(frame({ confirm: true }))).toEqual({ kind: 'activate', id: 'back', enabled: true });
  });

  it('a disabled control keeps focus and reports itself, so the player gets an explanation', () => {
    const focus = new MenuFocus([
      { id: 'buy', enabled: false },
      { id: 'back', enabled: true },
    ]);
    expect(focus.apply(frame({ confirm: true }))).toEqual({ kind: 'activate', id: 'buy', enabled: false });
    expect(focus.focused).toBe('buy');
  });

  it('back always wins, even with confirm pressed in the same frame', () => {
    const focus = new MenuFocus([{ id: 'buy', enabled: true }]);
    expect(focus.apply(frame({ confirm: true, back: true }))).toEqual({ kind: 'back' });
  });

  it('keeps focus on the same control when the list changes, else falls back to the first', () => {
    const focus = new MenuFocus([
      { id: 'buy', enabled: true },
      { id: 'back', enabled: true },
    ]);
    focus.focus('back');
    focus.setControls([{ id: 'back', enabled: true }]);
    expect(focus.focused).toBe('back');
    focus.setControls([{ id: 'resume', enabled: true }]);
    expect(focus.focused).toBe('resume');
    expect(() => focus.setControls([])).toThrow(RangeError);
    expect(focus.focus('missing')).toBe(false);
  });
});
