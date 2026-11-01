import type { ActionFrame } from '../input/actions';

export interface MenuControl {
  readonly id: string;
  /** A disabled control keeps focus and explains why when activated (an error path, never a dead end). */
  readonly enabled: boolean;
}

export type MenuEvent =
  | { readonly kind: 'none' }
  | { readonly kind: 'activate'; readonly id: string; readonly enabled: boolean }
  | { readonly kind: 'back' };

/**
 * Explicit menu focus for keyboard and controller (MSC-037, PRD-022): one focused control at a time, moved by
 * navigate steps (wrapping, so focus never gets stuck), activated by confirm; back always leaves. Mouse clicks
 * activate controls directly; hover never moves focus.
 */
export class MenuFocus {
  #controls: readonly MenuControl[] = [];
  #index = 0;

  constructor(controls: readonly MenuControl[], focusId?: string) {
    this.setControls(controls, focusId);
  }

  get focused(): string | undefined {
    return this.#controls[this.#index]?.id;
  }

  /** Replaces the controls, keeping focus on the same id when it still exists (or on `focusId`). */
  setControls(controls: readonly MenuControl[], focusId: string | undefined = this.focused): void {
    if (controls.length === 0) throw new RangeError('A menu needs at least one control');
    this.#controls = controls;
    const index = controls.findIndex((control) => control.id === focusId);
    this.#index = index >= 0 ? index : 0;
  }

  focus(id: string): boolean {
    const index = this.#controls.findIndex((control) => control.id === id);
    if (index < 0) return false;
    this.#index = index;
    return true;
  }

  /** Applies one input frame: back wins over confirm, then confirm, then a focus step. */
  apply(frame: Pick<ActionFrame, 'navigate' | 'confirm' | 'back'>): MenuEvent {
    if (frame.back) return { kind: 'back' };
    if (frame.confirm) {
      const control = this.#controls[this.#index];
      return control ? { kind: 'activate', id: control.id, enabled: control.enabled } : { kind: 'none' };
    }
    if (frame.navigate !== 0) {
      const count = this.#controls.length;
      this.#index = (this.#index + frame.navigate + count) % count;
    }
    return { kind: 'none' };
  }
}
