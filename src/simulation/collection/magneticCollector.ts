import type { ContentPack } from '../../content/schema';
import { contentId, type EntityId } from '../../domain/ids';
import { checkCompatibility, type MaterialDefinition, type ToolDefinition } from '../../domain/materials';
import type { PhysicsWorldPort, Vec3 } from '../physics/physicsPort';
import type { ScrapField } from '../scrap/scrapField';
import { TARGETING, type TargetPick } from './targeting';

export type TargetFeedback =
  | { readonly state: 'none' }
  | { readonly state: 'compatible'; readonly id: EntityId; readonly material: MaterialDefinition }
  | {
      readonly state: 'incompatible';
      readonly id: EntityId;
      readonly material: MaterialDefinition;
      /** Player-facing explanation; the piece stays where it is. */
      readonly reason: string;
    };

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
  #pulling: EntityId | null = null;

  constructor(pack: ContentPack, field: ScrapField, physics: PhysicsWorldPort, toolId = 'magnetic-collector') {
    const tool = pack.tools.get(contentId(toolId));
    if (!tool) throw new RangeError(`Unknown tool ${toolId}`);
    this.#pack = pack;
    this.#field = field;
    this.#physics = physics;
    this.#tool = tool;
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
    if (result.compatible) return { state: 'compatible', id: piece.id, material };
    const tools = material.collectableBy
      .map((toolId) => this.#pack.tools.get(toolId)?.displayName)
      .filter((name): name is string => name !== undefined);
    const reason =
      result.reason === 'scale-not-handled'
        ? `Too big for the ${this.#tool.displayName}.`
        : `${material.displayName} isn't magnetic. Collect with: ${tools.join(', ')}.`;
    return { state: 'incompatible', id: piece.id, material, reason };
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

  /** Moves the pulled piece toward the collector; returns the id when ownership transfers. */
  fixedUpdate(collector: Vec3): EntityId | null {
    const id = this.#pulling;
    if (id === null) return null;
    const body = this.#field.bodyOf(id);
    if (this.#field.piece(id)?.state !== 'active' || body === undefined) {
      this.#pulling = null;
      return null;
    }
    const position = this.#physics.bodyPosition(body);
    const delta = { x: collector.x - position.x, y: collector.y - position.y, z: collector.z - position.z };
    const distance = Math.hypot(delta.x, delta.y, delta.z);
    if (distance > COLLECTOR_TUNING.dropDistance) {
      this.#pulling = null;
      return null;
    }
    if (distance <= COLLECTOR_TUNING.captureDistance) {
      this.#pulling = null;
      return this.#field.removePiece(id) ? id : null;
    }
    const speed = COLLECTOR_TUNING.pullSpeed / distance;
    this.#physics.setLinearVelocity(body, { x: delta.x * speed, y: delta.y * speed, z: delta.z * speed });
    return null;
  }
}
