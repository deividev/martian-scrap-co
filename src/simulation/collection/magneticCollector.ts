import type { ContentPack } from '../../content/schema';
import type { ContainerItem } from '../../domain/container';
import { contentId, type ContentId, type EntityId } from '../../domain/ids';
import { checkCompatibility, type MaterialDefinition, type ToolDefinition } from '../../domain/materials';
import type { PhysicsWorldPort, Vec3 } from '../physics/physicsPort';
import type { ScrapField } from '../scrap/scrapField';
import { TARGETING, type TargetPick } from './targeting';

export type TargetFeedback =
  | { readonly state: 'none' }
  | { readonly state: 'compatible'; readonly id: EntityId; readonly material: MaterialDefinition }
  | {
      /** Wrong tool for the material; the piece stays where it is. */
      readonly state: 'incompatible';
      readonly id: EntityId;
      readonly material: MaterialDefinition;
      readonly reason: 'not-magnetic' | 'too-big';
      /** Tools that can collect it, for the player-facing hint (localized by the UI). */
      readonly collectableBy: readonly ContentId[];
    }
  | {
      /** Compatible, but intake is refused because the container is full. */
      readonly state: 'blocked';
      readonly id: EntityId;
      readonly material: MaterialDefinition;
      readonly reason: 'container-full';
    };

/** Where collected pieces go. Capture removes a piece from the world only if the sink accepts it. */
export interface CollectionSink {
  canAccept(id: EntityId): boolean;
  /** Called exactly once per captured piece, in the same step it leaves the world. */
  accept(item: ContainerItem): void;
}

export type PullOutcome =
  | { readonly kind: 'none' }
  | { readonly kind: 'collected'; readonly id: EntityId }
  | { readonly kind: 'dropped'; readonly id: EntityId; readonly reason: 'out-of-range' | 'sink-full' | 'gone' };

export const COLLECTOR_TUNING = Object.freeze({
  pullSpeed: 6,
  /** Ownership transfers once the piece is this close to the collector. */
  captureDistance: 0.7,
  /** A pull is dropped (piece left intact) if the piece ends up farther than this. */
  dropDistance: TARGETING.reachMeters + 1,
});

/**
 * Ordinary magnetic collector (MSC-014). It attracts only materials whose content definition lists
 * it; everything else is left untouched with a reason. A piece is collected exactly once, when it
 * reaches the collector, never at button press.
 */
export class MagneticCollector {
  readonly #pack: ContentPack;
  readonly #field: ScrapField;
  readonly #physics: PhysicsWorldPort;
  readonly #tool: ToolDefinition;
  readonly #sink: CollectionSink;
  #pulling: EntityId | null = null;

  constructor(
    pack: ContentPack,
    field: ScrapField,
    physics: PhysicsWorldPort,
    sink: CollectionSink,
    toolId = 'magnetic-collector',
  ) {
    const tool = pack.tools.get(contentId(toolId));
    if (!tool) throw new RangeError(`Unknown tool ${toolId}`);
    this.#pack = pack;
    this.#field = field;
    this.#physics = physics;
    this.#tool = tool;
    this.#sink = sink;
  }

  get pulling(): EntityId | null {
    return this.#pulling;
  }

  evaluate(pick: TargetPick | null): TargetFeedback {
    if (!pick) return { state: 'none' };
    const piece = this.#field.piece(pick.candidate.id);
    const material = piece ? this.#pack.materials.get(piece.materialId) : undefined;
    if (!piece || piece.state !== 'active' || !material) return { state: 'none' };
    const result = checkCompatibility(this.#tool, material, 'small');
    if (result.compatible) {
      return this.#sink.canAccept(piece.id)
        ? { state: 'compatible', id: piece.id, material }
        : { state: 'blocked', id: piece.id, material, reason: 'container-full' };
    }
    return {
      state: 'incompatible',
      id: piece.id,
      material,
      reason: result.reason === 'scale-not-handled' ? 'too-big' : 'not-magnetic',
      collectableBy: material.collectableBy,
    };
  }

  /** Starts pulling a compatible target. Returns false (and changes nothing) otherwise. */
  tryStartPull(feedback: TargetFeedback): boolean {
    if (feedback.state !== 'compatible' || this.#pulling !== null) return false;
    this.#pulling = feedback.id;
    return true;
  }

  cancelPull(): void {
    this.#pulling = null;
  }

  /** Moves the pulled piece toward the collector; transfers ownership atomically on arrival. */
  fixedUpdate(collector: Vec3): PullOutcome {
    const id = this.#pulling;
    if (id === null) return { kind: 'none' };
    const piece = this.#field.piece(id);
    const body = this.#field.bodyOf(id);
    if (piece?.state !== 'active' || body === undefined) {
      this.#pulling = null;
      return { kind: 'dropped', id, reason: 'gone' };
    }
    const position = this.#physics.bodyPosition(body);
    const delta = { x: collector.x - position.x, y: collector.y - position.y, z: collector.z - position.z };
    const distance = Math.hypot(delta.x, delta.y, delta.z);
    if (distance > COLLECTOR_TUNING.dropDistance) {
      this.#pulling = null;
      return { kind: 'dropped', id, reason: 'out-of-range' };
    }
    if (distance <= COLLECTOR_TUNING.captureDistance) {
      this.#pulling = null;
      // Full at arrival: the piece stays in the world (never deleted), it just stops being pulled.
      if (!this.#sink.canAccept(id)) return { kind: 'dropped', id, reason: 'sink-full' };
      if (!this.#field.removePiece(id)) return { kind: 'dropped', id, reason: 'gone' };
      this.#sink.accept({ id, materialId: piece.materialId, massKg: piece.massKg });
      return { kind: 'collected', id };
    }
    const speed = COLLECTOR_TUNING.pullSpeed / distance;
    this.#physics.setLinearVelocity(body, { x: delta.x * speed, y: delta.y * speed, z: delta.z * speed });
    return { kind: 'none' };
  }
}
