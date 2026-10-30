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
    en: 'WASD move · Hold left click / E vacuum or use · Right click / F unload or break · Q/R rotate · Space jump · Esc release mouse',
    es: 'WASD moverse · Mantén clic izq. / E aspirar o usar · Clic der. / F descargar o romper · Q/R rotar · Espacio saltar · Esc soltar ratón',
  },
  'hint.gamepad': {
    en: 'Left stick move · Right stick look · Hold RT / X vacuum or use · Y unload or break · LB/RB rotate · A jump · Menu pause',
    es: 'Stick izq. moverse · Stick der. mirar · Mantén RT / X aspirar o usar · Y descargar o romper · LB/RB rotar · A saltar · Menú pausa',
  },

  'tip.collect': {
    en: 'Tip: hold left click (RT) to vacuum the gray iron pieces, then unload them with right click at the base intake.',
    es: 'Consejo: mantén clic izquierdo (RT) para aspirar las piezas grises de hierro y descárgalas con clic derecho en la tolva de la base.',
  },
  'tip.cut': {
    en: 'Tip: aim at the glowing orange rings on the rover and press E (X) to cut.',
    es: 'Consejo: apunta a los anillos naranjas del rover y pulsa E (X) para cortar.',
  },
  'tip.cart': {
    en: 'Tip: hold an object over the cart and press E to load it. Aim at the cart and press E to push it.',
    es: 'Consejo: sujeta un objeto sobre el carrito y pulsa E para cargarlo. Apunta al carrito y pulsa E para empujarlo.',
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
  'grip.grabOrBreak': {
    en: '{name}: use to grab · right click to break',
    es: '{name}: usar para agarrar · clic derecho para romper',
  },
  'intake.prompt': {
    en: 'Base intake: right click / F / Y to unload the container',
    es: 'Tolva de la base: clic derecho / F / Y para descargar el contenedor',
  },
  'intake.contents': { en: 'Intake: {list}', es: 'Tolva: {list}' },
  'intake.empty': { en: 'empty', es: 'vacía' },
  'unload.done': {
    en: 'Unloaded {count} pieces into the intake, ready to compact.',
    es: 'Descargadas {count} piezas en la tolva, listas para compactar.',
  },
  'unload.empty': { en: 'The container is empty.', es: 'El contenedor está vacío.' },
  'unload.needIntake': {
    en: 'Go to the base intake to unload what you collected.',
    es: 'Ve a la tolva de la base para descargar lo que has aspirado.',
  },
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
  'prop.oldMachine': { en: 'Old machine housing', es: 'Carcasa de máquina vieja' },
  'prop.cableBox': { en: 'Cable junction box', es: 'Caja de empalmes de cables' },
  'prop.brokenSolar': { en: 'Broken solar panel', es: 'Panel solar roto' },
  'prop.heatShield': { en: 'Heat shield block', es: 'Bloque de escudo térmico' },
  'prop.roverDoor': { en: 'Rover door', es: 'Puerta de rover' },

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
