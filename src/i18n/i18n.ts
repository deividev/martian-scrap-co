/** Approved launch languages (owner decision 2026-10-30): English and Spanish. */
export const LOCALES = ['en', 'es'] as const;
export type Locale = (typeof LOCALES)[number];

/** Every player-facing string, in every approved language. A missing translation fails the tests. */
export const STRINGS = {
  'language.current': { en: 'Language: English · L to switch', es: 'Idioma: Español · L para cambiar' },

  'hint.none': {
    en: 'Click to play · WASD or left stick to move',
    es: 'Haz clic para jugar · WASD o stick izquierdo para moverte',
  },
  'hint.keyboard': {
    en: 'WASD move · Mouse look · E / click use or cut · F unload · Q/R rotate · Space jump · Esc release mouse',
    es: 'WASD moverse · Ratón mirar · E / clic usar o cortar · F descargar · Q/R rotar · Espacio saltar · Esc soltar ratón',
  },
  'hint.gamepad': {
    en: 'Left stick move · Right stick look · X use or cut · Y unload · LB/RB rotate · A jump · Menu pause',
    es: 'Stick izq. moverse · Stick der. mirar · X usar o cortar · Y descargar · LB/RB rotar · A saltar · Menú pausa',
  },

  'platform.browser': {
    en: 'Browser build · native features unavailable',
    es: 'Versión navegador · funciones nativas no disponibles',
  },
  'platform.electron': {
    en: 'Electron {electron} · {platform} · v{version}',
    es: 'Electron {electron} · {platform} · v{version}',
  },

  'container.status': { en: 'Container {count}/{capacity}', es: 'Contenedor {count}/{capacity}' },
  'container.full': { en: 'FULL', es: 'LLENO' },

  'collect.ready': { en: '{symbol} {material}: collect', es: '{symbol} {material}: recoger' },
  'collect.notMagnetic': {
    en: "{symbol} {material} isn't magnetic. Collect with: {tools}.",
    es: '{symbol} {material} no es magnético. Recógelo con: {tools}.',
  },
  'collect.tooBig': { en: '{symbol} Too big for the magnet.', es: '{symbol} Demasiado grande para el imán.' },
  'collect.containerFull': {
    en: '{symbol} Container full. Unload at the base intake.',
    es: '{symbol} Contenedor lleno. Descárgalo en la tolva de la base.',
  },

  'grip.grab': { en: '{name}: grab', es: '{name}: agarrar' },
  'grip.holding': { en: 'Holding {name} · place', es: 'Sujetando {name} · colocar' },
  'grip.holdingOverCart': { en: 'Holding {name} · load into cart', es: 'Sujetando {name} · cargar en el carrito' },
  'place.blocked': {
    en: 'Cannot place here: something is in the way.',
    es: 'No se puede colocar aquí: hay algo en medio.',
  },
  'place.overlapsPlayer': {
    en: 'Cannot place here: too close to you.',
    es: 'No se puede colocar aquí: está demasiado cerca de ti.',
  },

  'cart.idle': {
    en: 'Cart ({loads}/{max}) · use to push · unload',
    es: 'Carrito ({loads}/{max}) · usar para empujar · descargar',
  },
  'cart.pushing': {
    en: 'Pushing cart ({loads}/{max}) · use to let go · unload',
    es: 'Empujando carrito ({loads}/{max}) · usar para soltar · descargar',
  },
  'cart.full': { en: 'Cart full ({max} items).', es: 'Carrito lleno ({max} objetos).' },
  'cart.tooHeavy': { en: 'Too heavy for the cart.', es: 'Demasiado pesado para el carrito.' },
  'cart.claimed': { en: 'Someone else is holding that.', es: 'Otra persona lo está sujetando.' },

  'cut.ready': { en: 'Cut: {joint}', es: 'Cortar: {joint}' },
  'cut.blocked': { en: 'Blocked: cut {joints} first', es: 'Bloqueado: corta primero {joints}' },
  'list.and': { en: ' and ', es: ' y ' },

  'material.ferrous': { en: 'Ferrous scrap', es: 'Chatarra férrica' },
  'material.aluminum': { en: 'Aluminum', es: 'Aluminio' },
  'material.copper': { en: 'Copper', es: 'Cobre' },
  'material.polymer': { en: 'Polymer', es: 'Polímero' },
  'material.heliofoil': { en: 'Heliofoil', es: 'Heliolámina' },
  'material.regolith-ceramic': { en: 'Regolith ceramic', es: 'Cerámica de regolito' },

  'tool.hands': { en: 'Hands', es: 'Manos' },
  'tool.magnetic-collector': { en: 'Magnetic collector', es: 'Imán colector' },
  'tool.grabber': { en: 'Grabber', es: 'Pinza' },
  'tool.cutter': { en: 'Cutter', es: 'Cortador' },
  'tool.cart': { en: 'Cart', es: 'Carrito' },

  'prop.aluminumPanel': { en: 'Aluminum panel', es: 'Panel de aluminio' },
  'prop.polymerHousing': { en: 'Polymer housing', es: 'Carcasa de polímero' },
  'prop.copperSpoolBox': { en: 'Copper spool box', es: 'Caja de bobina de cobre' },

  'fragment.roverFrame': { en: 'Rover frame', es: 'Chasis del rover' },
  'fragment.coverPanel': { en: 'Cover panel', es: 'Tapa' },
  'fragment.copperCoil': { en: 'Copper coil', es: 'Bobina de cobre' },
  'fragment.sidePanel': { en: 'Side panel', es: 'Panel lateral' },
  'fragment.bracket': { en: 'Bracket', es: 'Escuadra' },

  'joint.cover-left': { en: 'cover left', es: 'tapa izquierda' },
  'joint.cover-right': { en: 'cover right', es: 'tapa derecha' },
  'joint.coil-mount': { en: 'coil mount', es: 'soporte de la bobina' },
  'joint.side-bolt': { en: 'side bolt', es: 'perno lateral' },
  'joint.bracket-weld': { en: 'bracket weld', es: 'soldadura de la escuadra' },
} as const satisfies Record<string, Record<Locale, string>>;

export type StringKey = keyof typeof STRINGS;

export function isStringKey(key: string): key is StringKey {
  return Object.hasOwn(STRINGS, key);
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** Picks Spanish for any Spanish system language, English otherwise. */
export function localeFromLanguage(language: string | undefined): Locale {
  return language?.toLowerCase().startsWith('es') ? 'es' : 'en';
}

const STORAGE_KEY = 'msc.locale';

/** Current language, translation and switching. The choice is a local per-device setting (MSC-004). */
export class I18n {
  #locale: Locale;
  readonly #storage: Pick<Storage, 'getItem' | 'setItem'> | undefined;

  constructor(locale: Locale, storage?: Pick<Storage, 'getItem' | 'setItem'>) {
    this.#locale = locale;
    this.#storage = storage;
  }

  /** Saved choice first, then the system language. Storage failures fall back silently. */
  static detect(storage?: Pick<Storage, 'getItem' | 'setItem'>, language?: string): I18n {
    let saved: string | null;
    try {
      saved = storage?.getItem(STORAGE_KEY) ?? null;
    } catch {
      saved = null;
    }
    return new I18n(isLocale(saved) ? saved : localeFromLanguage(language), storage);
  }

  get locale(): Locale {
    return this.#locale;
  }

  setLocale(locale: Locale): void {
    this.#locale = locale;
    try {
      this.#storage?.setItem(STORAGE_KEY, locale);
    } catch {
      // A blocked storage only means the choice is not remembered.
    }
  }

  toggle(): Locale {
    this.setLocale(this.#locale === 'en' ? 'es' : 'en');
    return this.#locale;
  }

  /** Translates a key and fills `{name}` placeholders. */
  t(key: StringKey, params: Readonly<Record<string, string | number>> = {}): string {
    return STRINGS[key][this.#locale].replace(/\{(\w+)\}/g, (match, name: string) =>
      name in params ? String(params[name]) : match,
    );
  }

  /** Translates a dynamic key (content ids), falling back to the given text when unknown. */
  tKey(key: string, fallback: string): string {
    return isStringKey(key) ? this.t(key) : fallback;
  }
}
