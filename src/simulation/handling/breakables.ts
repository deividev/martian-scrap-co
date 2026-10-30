import type { ContentId, EntityId } from '../../domain/ids';
import type { PhysicsWorldPort, Vec3 } from '../physics/physicsPort';
import type { ScrapField, ScrapPieceSpec } from '../scrap/scrapField';
import type { ClaimRegistry } from './claims';
import type { MediumPropSet, MediumPropSpec } from './mediumProps';

export interface Yield {
  readonly materialId: ContentId;
  readonly count: number;
}

/** A medium junk object that breaks into small pieces of several materials (owner feedback 2026-10-30). */
export interface BreakableSpec extends MediumPropSpec {
  readonly yields: readonly Yield[];
}

/** How a breakable comes apart: junk is broken open, large metal parts are cut into pieces. */
export type BreakMethod = 'break' | 'cut';

/** First-pass mass of one small piece cut from a large part; not an approved value (MSC-020 review). */
export const CUT_PIECE_MASS_KG = 3;

/**
 * Small pieces from cutting a large part (owner decision 2026-10-30): the magnet ignores large parts, so
 * they are cut into small pieces of the same material, roughly one per CUT_PIECE_MASS_KG, 2 to 12 each.
 */
export function cutYields(parts: readonly { readonly materialId: ContentId; readonly massKg: number }[]): Yield[] {
  const totals = new Map<ContentId, number>();
  for (const part of parts) {
    const count = Math.min(12, Math.max(2, Math.round(part.massKg / CUT_PIECE_MASS_KG)));
    totals.set(part.materialId, (totals.get(part.materialId) ?? 0) + count);
  }
  return [...totals].map(([materialId, count]) => ({ materialId, count: Math.min(count, MAX_YIELD) }));
}

export type BreakResult =
  | { readonly ok: true; readonly created: readonly EntityId[] }
  | { readonly ok: false; readonly reason: 'unknown' | 'claimed' | 'already-broken' };

const MAX_YIELD = 24;

/**
 * Breaking turns one medium prop into a new cluster of small scrap at the same spot, with a gentle pop.
 * Each breakable breaks exactly once; new piece ids come from the world allocator and are never reused.
 */
export class Breakables {
  readonly #props: MediumPropSet;
  readonly #field: ScrapField;
  readonly #physics: PhysicsWorldPort;
  readonly #claims: ClaimRegistry;
  readonly #allocate: () => EntityId;
  readonly #specs = new Map<EntityId, { readonly yields: readonly Yield[]; readonly method: BreakMethod }>();
  readonly #broken = new Set<EntityId>();

  constructor(
    props: MediumPropSet,
    field: ScrapField,
    physics: PhysicsWorldPort,
    claims: ClaimRegistry,
    allocate: () => EntityId,
    specs: readonly BreakableSpec[],
  ) {
    this.#props = props;
    this.#field = field;
    this.#physics = physics;
    this.#claims = claims;
    this.#allocate = allocate;
    for (const spec of specs) {
      this.#register(spec.id, spec.yields, 'break');
      props.add(spec);
    }
  }

  /** Makes a medium prop that already exists (e.g. a chunk cut from an assembly) breakable. */
  registerExisting(id: EntityId, yields: readonly Yield[], method: BreakMethod = 'cut'): void {
    if (!this.#props.get(id)) throw new RangeError(`Unknown prop ${id}`);
    this.#register(id, yields, method);
  }

  /** Drops a breakable whose prop was retired elsewhere (a chunk split by another cut). */
  forget(id: EntityId): void {
    this.#specs.delete(id);
  }

  isBreakable(id: EntityId): boolean {
    return this.#specs.has(id) && !this.#broken.has(id);
  }

  method(id: EntityId): BreakMethod | undefined {
    return this.#specs.get(id)?.method;
  }

  break(id: EntityId): BreakResult {
    const spec = this.#specs.get(id);
    if (!spec) return { ok: false, reason: 'unknown' };
    if (this.#broken.has(id)) return { ok: false, reason: 'already-broken' };
    if (this.#claims.holderOf(id) !== undefined) return { ok: false, reason: 'claimed' };
    const prop = this.#props.get(id);
    if (!prop) return { ok: false, reason: 'unknown' };
    const origin = this.#physics.bodyPosition(prop.body);
    this.#props.remove(id);
    this.#broken.add(id);
    return { ok: true, created: this.shatter(origin, spec.yields, `broken-${id}`) };
  }

  /** Spawns small pieces at a point with a gentle pop, as a new active cluster; returns their ids. */
  shatter(origin: Vec3, yields: readonly Yield[], clusterId: string): EntityId[] {
    Breakables.#validate(clusterId, yields);
    const pieces: ScrapPieceSpec[] = [];
    let index = 0;
    for (const entry of yields) {
      for (let n = 0; n < entry.count; n += 1) {
        const angle = index * 2.399963; // golden angle spreads the pieces evenly
        const ring = 0.12 + 0.06 * Math.sqrt(index);
        pieces.push({
          id: this.#allocate(),
          materialId: entry.materialId,
          position: {
            x: origin.x + Math.cos(angle) * ring,
            y: Math.max(0.15, origin.y) + (index % 3) * 0.12,
            z: origin.z + Math.sin(angle) * ring,
          },
          halfExtents: { x: 0.09 + (index % 3) * 0.02, y: 0.06 + (index % 2) * 0.03, z: 0.1 },
          massKg: 1 + (index % 3) * 0.4,
        });
        index += 1;
      }
    }
    this.#field.addCluster({ id: clusterId, pieces, decorativeInstances: 0 });
    this.#field.activateCluster(clusterId);
    pieces.forEach((piece, i) => {
      const body = this.#field.bodyOf(piece.id);
      if (body === undefined) return;
      const angle = i * 2.399963;
      this.#physics.setLinearVelocity(body, { x: Math.cos(angle) * 1.2, y: 2.2, z: Math.sin(angle) * 1.2 });
    });
    return pieces.map((piece) => piece.id);
  }

  #register(id: EntityId, yields: readonly Yield[], method: BreakMethod): void {
    Breakables.#validate(id, yields);
    this.#specs.set(id, { yields, method });
  }

  static #validate(id: string, yields: readonly Yield[]): void {
    const total = yields.reduce((sum, entry) => sum + entry.count, 0);
    if (total < 1 || total > MAX_YIELD || yields.some((entry) => !Number.isInteger(entry.count) || entry.count < 0)) {
      throw new RangeError(`Invalid yield for ${id}`);
    }
  }
}
