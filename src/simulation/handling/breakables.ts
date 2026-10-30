import type { ContentId, EntityId } from '../../domain/ids';
import type { PhysicsWorldPort } from '../physics/physicsPort';
import type { ScrapField, ScrapPieceSpec } from '../scrap/scrapField';
import type { ClaimRegistry } from './claims';
import type { MediumPropSet, MediumPropSpec } from './mediumProps';

/** A medium junk object that breaks into small pieces of several materials (owner feedback 2026-10-30). */
export interface BreakableSpec extends MediumPropSpec {
  readonly yields: readonly { readonly materialId: ContentId; readonly count: number }[];
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
  readonly #specs = new Map<EntityId, BreakableSpec>();
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
      const total = spec.yields.reduce((sum, entry) => sum + entry.count, 0);
      if (
        total < 1 ||
        total > MAX_YIELD ||
        spec.yields.some((entry) => !Number.isInteger(entry.count) || entry.count < 0)
      ) {
        throw new RangeError(`Invalid yield for ${spec.id}`);
      }
      this.#specs.set(spec.id, spec);
      props.add(spec);
    }
  }

  isBreakable(id: EntityId): boolean {
    return this.#specs.has(id) && !this.#broken.has(id);
  }

  spec(id: EntityId): BreakableSpec | undefined {
    return this.#specs.get(id);
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

    const pieces: ScrapPieceSpec[] = [];
    let index = 0;
    for (const entry of spec.yields) {
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
    const clusterId = `broken-${id}`;
    this.#field.addCluster({ id: clusterId, pieces, decorativeInstances: 0 });
    this.#field.activateCluster(clusterId);
    pieces.forEach((piece, i) => {
      const body = this.#field.bodyOf(piece.id);
      if (body === undefined) return;
      const angle = i * 2.399963;
      this.#physics.setLinearVelocity(body, { x: Math.cos(angle) * 1.2, y: 2.2, z: Math.sin(angle) * 1.2 });
    });
    return { ok: true, created: pieces.map((piece) => piece.id) };
  }
}
