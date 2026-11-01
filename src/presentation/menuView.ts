/** One control as drawn; `focused` comes from `MenuFocus`. */
export interface MenuViewControl {
  readonly id: string;
  readonly label: string;
  readonly enabled: boolean;
  readonly focused: boolean;
}

export interface MenuViewState {
  readonly title: string;
  /** Short paragraphs, e.g. the shared-money explanation. */
  readonly body: readonly string[];
  /** Label/value rows, e.g. the before/after comparison of an upgrade. */
  readonly rows: readonly { readonly label: string; readonly value: string; readonly highlight: boolean }[];
  readonly controls: readonly MenuViewControl[];
  /** Result of the last action; an error is announced to screen readers. */
  readonly message: { readonly text: string; readonly tone: 'error' | 'success' } | null;
  /** Device-specific keys for choose / confirm / back. */
  readonly footer: string;
}

/**
 * Modal menu panel in the approved UI style (MSC-037, visual §4): charcoal panel, warm text, orange focus ring and
 * an explicit back control. Focus is drawn from state (never from mouse hover or DOM focus, so Enter cannot
 * activate twice); a mouse click activates a control directly. Rebuilt only when its state changes.
 */
export class MenuView {
  readonly #root: HTMLElement;
  #rendered = '';

  constructor(parent: HTMLElement, onActivate: (id: string) => void) {
    this.#root = document.createElement('section');
    this.#root.id = 'menu';
    this.#root.setAttribute('role', 'dialog');
    this.#root.setAttribute('aria-modal', 'true');
    this.#root.hidden = true;
    this.#root.addEventListener('click', (event) => {
      const button = (event.target as Element | null)?.closest('button[data-id]');
      const id = button?.getAttribute('data-id');
      if (id) onActivate(id);
    });
    parent.appendChild(this.#root);
  }

  get element(): HTMLElement {
    return this.#root;
  }

  render(state: MenuViewState | null): void {
    const key = state ? JSON.stringify(state) : '';
    if (key === this.#rendered) return;
    this.#rendered = key;
    this.#root.hidden = state === null;
    this.#root.replaceChildren();
    if (!state) return;
    const panel = element('div', 'menu-panel');
    const title = element('h2', 'menu-title', state.title);
    title.id = 'menu-title';
    this.#root.setAttribute('aria-labelledby', title.id);
    panel.appendChild(title);
    for (const text of state.body) panel.appendChild(element('p', 'menu-body', text));
    if (state.rows.length > 0) {
      const table = element('dl', 'menu-rows');
      for (const row of state.rows) {
        const line = element('div', row.highlight ? 'menu-row menu-row-next' : 'menu-row');
        line.append(element('dt', '', row.label), element('dd', '', row.value));
        table.appendChild(line);
      }
      panel.appendChild(table);
    }
    if (state.message) {
      const message = element('p', `menu-message menu-${state.message.tone}`, state.message.text);
      message.setAttribute('role', state.message.tone === 'error' ? 'alert' : 'status');
      panel.appendChild(message);
    }
    const controls = element('div', 'menu-controls');
    for (const control of state.controls) {
      const button = element('button', control.focused ? 'menu-button menu-focused' : 'menu-button', '');
      button.type = 'button';
      button.tabIndex = -1;
      button.dataset['id'] = control.id;
      button.setAttribute('aria-disabled', String(!control.enabled));
      if (control.focused) button.setAttribute('aria-current', 'true');
      // The focus marker is a shape and text, not only the orange ring.
      button.textContent = `${control.focused ? '▶ ' : ''}${control.label}`;
      controls.appendChild(button);
    }
    panel.appendChild(controls);
    panel.appendChild(element('p', 'menu-footer', state.footer));
    this.#root.appendChild(panel);
  }

  dispose(): void {
    this.#root.remove();
  }
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
