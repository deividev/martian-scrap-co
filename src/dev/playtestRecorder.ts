/**
 * DEV-ONLY playtest recorder (MSC-039 support; remove or keep disabled for release, MSC-118). It turns per-frame
 * yard snapshots into a short timeline the observer would otherwise write by hand: milestone times (M1–M12 of the
 * playtest script), job changes, long stretches on one job, notices, menus, device switches and muting. It only
 * records game state, never names, voices or anything outside the game.
 */

export type MilestoneId = 'M1' | 'M2' | 'M3' | 'M4' | 'M5' | 'M6' | 'M7' | 'M8' | 'M9' | 'M10' | 'M11' | 'M12';

export const MILESTONES: Readonly<Record<MilestoneId, string>> = {
  M1: 'first piece vacuumed',
  M2: 'first unload at the intake',
  M3: 'compactor starts pressing',
  M4: 'first bale picked up',
  M5: 'first sale',
  M6: 'shop opened',
  M7: 'not-enough-credits seen',
  M8: 'collector level 2 bought',
  M9: 'station beacon revealed',
  M10: 'cutter used on the rover',
  M11: 'cart used',
  M12: 'pause menu opened',
};

export interface PlaytestSnapshot {
  readonly collected: number;
  readonly intake: number;
  readonly pressKind: string;
  readonly bales: number;
  readonly holdingBale: boolean;
  readonly credits: number;
  readonly collectorTier: number;
  readonly revealed: boolean;
  /** Share of the station marker cleared, 0–1. */
  readonly clearing: number;
  readonly cuts: number;
  readonly cartLoads: number;
  readonly cartPushed: boolean;
  readonly equipped: string;
  readonly menu: 'shop' | 'pause' | null;
  readonly device: string;
  readonly muted: boolean;
  /** The "Current job" text the player sees. */
  readonly job: string;
  /** Key of the notice on screen (changes with `noticeSerial`). */
  readonly notice: string | null;
  readonly noticeSerial: number;
  readonly saveRevision: number;
}

export interface PlaytestEntry {
  /** Seconds since the session started (one decimal). */
  readonly t: number;
  readonly type: string;
  readonly [field: string]: unknown;
}

/** A job unchanged this long is logged once as a possible stuck point (the script's help ladder starts at 3 min). */
export const STUCK_AFTER_MS = 180_000;
/** A summary line every minute keeps the timeline readable without logging every frame. */
export const SUMMARY_EVERY_MS = 60_000;

export class PlaytestRecorder {
  readonly #emit: (entry: PlaytestEntry) => void;
  readonly #start: number;
  readonly #reached = new Set<MilestoneId>();
  #last: PlaytestSnapshot | null = null;
  #jobSince = 0;
  #stuckLogged = false;
  #lastSummary = 0;

  constructor(emit: (entry: PlaytestEntry) => void, startMs: number) {
    this.#emit = emit;
    this.#start = startMs;
    this.#lastSummary = startMs;
  }

  /** Milestones reached so far with their time in seconds. */
  get reached(): readonly MilestoneId[] {
    return [...this.#reached];
  }

  /** First call: the session start with the state it opened in (a resumed save shows here, for the reopen check). */
  begin(now: number, snapshot: PlaytestSnapshot, details: Readonly<Record<string, unknown>>): void {
    this.#write(now, 'session-start', { ...details, state: summary(snapshot) });
    this.#last = snapshot;
    this.#jobSince = now;
    this.#jobLog(now, snapshot.job);
  }

  /** Something the snapshot cannot show (a refused purchase, a volume change…). */
  note(now: number, type: string, fields: Readonly<Record<string, unknown>> = {}): void {
    if (type === 'purchase-failed') this.#milestone(now, 'M7');
    this.#write(now, type, fields);
  }

  observe(now: number, next: PlaytestSnapshot): void {
    const previous = this.#last;
    if (!previous) return;
    this.#last = next;
    if (next.collected > previous.collected) this.#milestone(now, 'M1');
    if (next.collected < previous.collected && next.intake > previous.intake) {
      this.#milestone(now, 'M2');
      this.#write(now, 'unload', { pieces: next.intake - previous.intake, kept: next.collected });
    }
    if (next.pressKind === 'processing' && previous.pressKind !== 'processing') {
      this.#milestone(now, 'M3');
      this.#write(now, 'press-start');
    }
    if (next.bales > previous.bales) this.#write(now, 'bale-ready', { bales: next.bales });
    if (next.holdingBale && !previous.holdingBale) this.#milestone(now, 'M4');
    if (next.credits > previous.credits) {
      this.#milestone(now, 'M5');
      this.#write(now, 'sale', { credits: next.credits - previous.credits, balance: next.credits });
    } else if (next.credits < previous.credits) {
      this.#write(now, 'purchase', { cost: previous.credits - next.credits, balance: next.credits });
    }
    if (next.menu !== previous.menu) {
      if (next.menu === 'shop') this.#milestone(now, 'M6');
      if (next.menu === 'pause') this.#milestone(now, 'M12');
      this.#write(now, next.menu ? 'menu-open' : 'menu-close', { menu: next.menu ?? previous.menu });
    }
    if (next.collectorTier > previous.collectorTier) {
      if (next.collectorTier >= 2) this.#milestone(now, 'M8');
      this.#write(now, 'collector-level', { level: next.collectorTier });
    }
    if (next.revealed && !previous.revealed) this.#milestone(now, 'M9');
    if (next.cuts > previous.cuts) {
      this.#milestone(now, 'M10');
      this.#write(now, 'cut', { total: next.cuts });
    }
    if (next.cartLoads > previous.cartLoads || (next.cartPushed && !previous.cartPushed)) {
      this.#milestone(now, 'M11');
    }
    if (next.equipped !== previous.equipped) this.#write(now, 'tool', { equipped: next.equipped });
    if (next.device !== previous.device && next.device !== 'none') this.#write(now, 'device', { device: next.device });
    if (next.muted !== previous.muted) this.#write(now, next.muted ? 'mute-on' : 'mute-off');
    if (next.noticeSerial !== previous.noticeSerial && next.notice) this.#write(now, 'notice', { key: next.notice });
    if (next.saveRevision !== previous.saveRevision) this.#write(now, 'saved', { revision: next.saveRevision });
    if (next.job !== previous.job) {
      this.#write(now, 'job-end', { job: previous.job, seconds: round((now - this.#jobSince) / 1000) });
      this.#jobSince = now;
      this.#stuckLogged = false;
      this.#jobLog(now, next.job);
    } else if (!this.#stuckLogged && now - this.#jobSince >= STUCK_AFTER_MS) {
      this.#stuckLogged = true;
      this.#write(now, 'same-job-3min', { job: next.job });
    }
    if (now - this.#lastSummary >= SUMMARY_EVERY_MS) {
      this.#lastSummary = now;
      this.#write(now, 'summary', { state: summary(next), milestones: this.reached });
    }
  }

  /** Last line when the window closes: final state, the milestones and those never reached. */
  end(now: number): void {
    const missing = (Object.keys(MILESTONES) as MilestoneId[]).filter((id) => !this.#reached.has(id));
    this.#write(now, 'session-end', {
      state: this.#last ? summary(this.#last) : null,
      milestones: this.reached,
      notReached: missing,
    });
  }

  #jobLog(now: number, job: string): void {
    this.#write(now, 'job', { job });
  }

  #milestone(now: number, id: MilestoneId): void {
    if (this.#reached.has(id)) return;
    this.#reached.add(id);
    this.#write(now, 'milestone', { id, what: MILESTONES[id] });
  }

  #write(now: number, type: string, fields: Readonly<Record<string, unknown>> = {}): void {
    this.#emit({ t: round((now - this.#start) / 1000), type, ...fields });
  }
}

function round(seconds: number): number {
  return Math.round(seconds * 10) / 10;
}

function summary(snapshot: PlaytestSnapshot) {
  return {
    credits: snapshot.credits,
    collectorLevel: snapshot.collectorTier,
    container: snapshot.collected,
    bins: snapshot.intake,
    bales: snapshot.bales,
    cuts: snapshot.cuts,
    clearing: Math.round(snapshot.clearing * 100),
    revealed: snapshot.revealed,
  };
}
