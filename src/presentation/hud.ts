/**
 * Gameplay HUD in the approved UI style (visual §9, UI concept): charcoal/navy rounded panels, warm off-white
 * text, orange focus and teal progress. Sparse: container, tool slots, the collector filter and crew. Text,
 * icon and shape carry state together; color is never the only cue. Built once, updated only on change.
 */

const ICONS = {
  magnet:
    '<svg viewBox="0 0 24 24"><path d="M5 3h4v9a3 3 0 0 0 6 0V3h4v9a7 7 0 0 1-14 0z" fill="currentColor"/><path d="M5 3h4v3H5zM15 3h4v3h-4z" fill="#f4ece1"/></svg>',
  cutter:
    '<svg viewBox="0 0 24 24"><circle cx="15" cy="9" r="6" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="15" cy="9" r="1.8" fill="currentColor"/><path d="M11 13 4 20" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/></svg>',
  box: '<svg viewBox="0 0 24 24"><path d="M3 8h18v12H3z" fill="#f2b21c"/><path d="M3 8l3-4h12l3 4z" fill="#ffd25c"/><path d="M8 11v6M12 11v6M16 11v6" stroke="#2b2e35" stroke-width="1.6"/></svg>',
  coin: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#f2b21c"/><circle cx="12" cy="12" r="6.5" fill="none" stroke="#c98a08" stroke-width="2"/></svg>',
  job: '<svg viewBox="0 0 24 24"><rect x="5" y="4" width="14" height="17" rx="2" fill="#f4ece1"/><rect x="9" y="2" width="6" height="4" rx="1" fill="#2b2e35"/><path d="M8 10h8M8 14h8M8 18h5" stroke="#2b2e35" stroke-width="1.8"/></svg>',
  robot:
    '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="15" rx="5" fill="#f07a1e"/><rect x="6" y="8" width="12" height="8" rx="3" fill="#20242f"/><circle cx="9.5" cy="12" r="1.6" fill="#f4ece1"/><circle cx="14.5" cy="12" r="1.6" fill="#f4ece1"/><path d="M12 2v3" stroke="#f2b21c" stroke-width="2"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2.5"/></svg>',
  wheel:
    '<svg viewBox="0 0 24 24"><rect x="6" y="2" width="12" height="20" rx="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 6v5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>',
} as const;

export type HudIcon = keyof typeof ICONS;

export interface HudMaterialChip {
  readonly id: string;
  readonly symbol: string;
  readonly name: string;
  readonly color: string;
  /** Collector level that unlocks it (1-based). */
  readonly level: number;
  readonly unlocked: boolean;
}

export interface HudToolSlot {
  readonly key: string;
  readonly icon: HudIcon;
  readonly label: string;
  readonly level: number;
  readonly equipped: boolean;
  readonly owned: boolean;
}

export interface HudBin {
  readonly symbol: string;
  readonly name: string;
  readonly color: string;
  readonly count: number;
}

/** Base machines panel, shown near the base (MSC-031–033). */
export interface HudBase {
  readonly title: string;
  readonly capacity: number;
  readonly bins: readonly HudBin[];
  readonly emptyText: string;
  /** One line per machine with an optional 0–1 progress bar. */
  readonly machines: readonly { readonly label: string; readonly progress: number | null }[];
}

export interface HudState {
  readonly labels: {
    readonly container: string;
    readonly containerFull: string;
    readonly crew: string;
    readonly filter: string;
    readonly lockedHint: string;
    readonly wheelHint: string;
    readonly level: string;
  };
  readonly crew: { readonly present: number; readonly max: number };
  readonly container: {
    readonly count: number;
    readonly capacity: number;
    readonly color: string | null;
  };
  readonly tools: readonly HudToolSlot[];
  readonly base: HudBase | null;
  readonly credits: {
    readonly label: string;
    readonly balance: number;
    /** Most recent sale, shown briefly as a "+N C" pop. */
    readonly gain: number | null;
  };
  readonly job: { readonly label: string; readonly text: string };
  /** Panel for the tool in hand: the collector filter or the cutter. */
  readonly inHand:
    | {
        readonly kind: 'collector';
        readonly title: string;
        readonly selected: HudMaterialChip;
        readonly locked: boolean;
        readonly materials: readonly HudMaterialChip[];
      }
    | { readonly kind: 'cutter'; readonly title: string; readonly detail: string };
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  parent?: HTMLElement,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  parent?.append(node);
  return node;
}

function icon(name: HudIcon, className = 'hud-icon'): HTMLSpanElement {
  const span = element('span', className);
  span.innerHTML = ICONS[name];
  span.setAttribute('aria-hidden', 'true');
  return span;
}

export class GameHud {
  readonly #root: HTMLElement;
  readonly #containerCount: HTMLElement;
  readonly #containerLabel: HTMLElement;
  readonly #containerBar: HTMLElement;
  readonly #containerPanel: HTMLElement;
  readonly #crewLabel: HTMLElement;
  readonly #crewIcons: HTMLElement;
  readonly #tools: HTMLElement;
  readonly #hand: HTMLElement;
  readonly #base: HTMLElement;
  readonly #creditsLabel: HTMLElement;
  readonly #creditsValue: HTMLElement;
  readonly #creditsGain: HTMLElement;
  readonly #jobLabel: HTMLElement;
  readonly #jobText: HTMLElement;
  #lastKey = '';

  constructor(root: HTMLElement) {
    this.#root = root;
    root.classList.add('hud');

    const creditsPanel = element('section', 'hud-panel hud-credits', root);
    creditsPanel.append(icon('coin', 'hud-icon hud-icon-lg'));
    const creditsText = element('div', 'hud-stack', creditsPanel);
    this.#creditsLabel = element('span', 'hud-label', creditsText);
    this.#creditsValue = element('span', 'hud-value', creditsText);
    this.#creditsGain = element('span', 'hud-gain', creditsPanel);
    const jobPanel = element('section', 'hud-panel hud-job', root);
    jobPanel.append(icon('job', 'hud-icon hud-icon-md'));
    const jobText = element('div', 'hud-stack', jobPanel);
    this.#jobLabel = element('span', 'hud-label', jobText);
    this.#jobText = element('span', 'hud-detail', jobText);

    this.#containerPanel = element('section', 'hud-panel hud-container', root);
    this.#containerPanel.append(icon('box', 'hud-icon hud-icon-lg'));
    const containerText = element('div', 'hud-stack', this.#containerPanel);
    this.#containerLabel = element('span', 'hud-label', containerText);
    this.#containerCount = element('span', 'hud-value', containerText);
    const track = element('div', 'hud-bar', containerText);
    this.#containerBar = element('div', 'hud-bar-fill', track);

    const crew = element('section', 'hud-panel hud-crew', root);
    this.#crewIcons = element('div', 'hud-crew-icons', crew);
    this.#crewLabel = element('span', 'hud-label', crew);

    this.#tools = element('section', 'hud-tools', root);
    this.#hand = element('section', 'hud-panel hud-hand', root);
    this.#base = element('section', 'hud-panel hud-base', root);
  }

  get root(): HTMLElement {
    return this.#root;
  }

  update(state: HudState): void {
    const key = JSON.stringify(state);
    if (key === this.#lastKey) return;
    this.#lastKey = key;

    this.#creditsLabel.textContent = state.credits.label;
    this.#creditsValue.textContent = `${state.credits.balance.toLocaleString()} C`;
    this.#creditsGain.textContent = state.credits.gain === null ? '' : `+${state.credits.gain} C`;
    this.#jobLabel.textContent = state.job.label;
    this.#jobText.textContent = state.job.text;

    const { count, capacity, color } = state.container;
    const full = count >= capacity;
    this.#containerLabel.textContent = full
      ? `${state.labels.container} · ${state.labels.containerFull}`
      : state.labels.container;
    this.#containerCount.textContent = `${count} / ${capacity}`;
    this.#containerBar.style.width = `${Math.round((count / Math.max(1, capacity)) * 100)}%`;
    this.#containerBar.style.background = color ?? '';
    this.#containerPanel.dataset['full'] = String(full);

    this.#crewLabel.textContent = `${state.labels.crew} ${state.crew.present}/${state.crew.max}`;
    this.#crewIcons.replaceChildren(
      ...Array.from({ length: state.crew.max }, (_, index) => {
        const robot = icon('robot');
        robot.classList.toggle('hud-absent', index >= state.crew.present);
        return robot;
      }),
    );

    this.#tools.replaceChildren(
      ...state.tools.map((tool) => {
        const slot = element('div', 'hud-slot');
        slot.dataset['equipped'] = String(tool.equipped);
        slot.dataset['owned'] = String(tool.owned);
        slot.title = tool.label;
        slot.append(icon(tool.icon));
        element('span', 'hud-slot-key', slot).textContent = tool.key;
        element('span', 'hud-slot-level', slot).textContent = `${state.labels.level}${tool.level}`;
        return slot;
      }),
    );

    this.#renderBase(state.base);

    const hand = state.inHand;
    this.#hand.replaceChildren();
    this.#hand.dataset['kind'] = hand.kind;
    const header = element('div', 'hud-row', this.#hand);
    header.append(icon(hand.kind === 'collector' ? 'magnet' : 'cutter', 'hud-icon hud-icon-lg'));
    const titles = element('div', 'hud-stack', header);
    element('span', 'hud-label', titles).textContent = hand.title;
    if (hand.kind === 'cutter') {
      element('span', 'hud-detail', titles).textContent = hand.detail;
      return;
    }
    const filter = element('span', 'hud-filter', titles);
    filter.append(state.labels.filter, ' ');
    const swatch = element('span', 'hud-swatch', filter);
    swatch.style.background = hand.selected.color;
    element('strong', '', filter).textContent = `${hand.selected.symbol} ${hand.selected.name}`;
    if (hand.locked) filter.append(icon('lock', 'hud-icon hud-icon-sm hud-lock'));
    const chips = element('div', 'hud-chips', this.#hand);
    for (const material of hand.materials) {
      const chip = element('span', 'hud-chip', chips);
      chip.dataset['selected'] = String(material.id === hand.selected.id);
      chip.dataset['unlocked'] = String(material.unlocked);
      chip.title = material.name;
      const dot = element('span', 'hud-swatch', chip);
      dot.style.background = material.color;
      element('span', '', chip).textContent = material.unlocked
        ? material.symbol
        : `${material.symbol} ${state.labels.level}${material.level}`;
    }
    const footer = element('div', 'hud-row hud-footer', this.#hand);
    footer.append(icon(hand.locked ? 'lock' : 'wheel', 'hud-icon hud-icon-sm'));
    element('span', '', footer).textContent = hand.locked ? state.labels.lockedHint : state.labels.wheelHint;
  }

  #renderBase(base: HudBase | null): void {
    this.#base.hidden = base === null;
    this.#base.replaceChildren();
    if (!base) return;
    element('span', 'hud-label', this.#base).textContent = base.title;
    const bins = element('div', 'hud-bins', this.#base);
    if (base.bins.length === 0) element('span', 'hud-detail', bins).textContent = base.emptyText;
    for (const bin of base.bins) {
      const row = element('div', 'hud-bin', bins);
      row.title = bin.name;
      const swatch = element('span', 'hud-swatch', row);
      swatch.style.background = bin.color;
      element('span', 'hud-bin-name', row).textContent = bin.symbol;
      const track = element('div', 'hud-bar', row);
      const fill = element('div', 'hud-bar-fill', track);
      fill.style.width = `${Math.round((bin.count / Math.max(1, base.capacity)) * 100)}%`;
      fill.style.background = bin.color;
      element('span', 'hud-bin-count', row).textContent = `${bin.count}/${base.capacity}`;
    }
    for (const machine of base.machines) {
      const row = element('div', 'hud-machine', this.#base);
      element('span', '', row).textContent = machine.label;
      if (machine.progress !== null) {
        const track = element('div', 'hud-bar', row);
        element('div', 'hud-bar-fill', track).style.width = `${Math.round(machine.progress * 100)}%`;
      }
    }
  }
}
