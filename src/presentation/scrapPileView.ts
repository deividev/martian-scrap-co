import { Color, Matrix4, Quaternion, Vector3, type Scene } from 'three';
import type { EntityId } from '../domain/ids';
import { SCRAP_COLORS } from '../models/styledModels';
import type { TargetFeedback } from '../simulation/collection/magneticCollector';
import type { PhysicsWorldPort } from '../simulation/physics/physicsPort';
import type { ScrapField } from '../simulation/scrap/scrapField';
import { ScrapBatches, type ScrapInstance } from './scrapBatch';

/** Readable base color per material (styled models own the palette; kept for instanced views). */
export const MATERIAL_COLORS: Readonly<Record<string, string>> = SCRAP_COLORS;

/** Instance tint for the aimed piece (multiplies the material color). */
const HIGHLIGHT: Record<Exclude<TargetFeedback['state'], 'none'>, Color> = {
  compatible: new Color('#9ffff0'),
  incompatible: new Color('#ffb08a'),
  blocked: new Color('#ffb08a'),
};
const WHITE = new Color('#ffffff');

/** Stable small hash so each piece keeps the same silhouette variant across sessions. */
export function variantOf(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

/**
 * Renders active scrap with material-specific shapes (nut, bracket, pipe, panel, coil…) and highlights the
 * target. One multi-draw batch per material keeps draw calls flat however many pieces are awake (MSC-019
 * budget).
 */
export class ScrapPileView {
  readonly #field: ScrapField;
  readonly #physics: PhysicsWorldPort;
  readonly #batches: ScrapBatches;
  readonly #slots = new Map<EntityId, ScrapInstance>();
  readonly #matrix = new Matrix4();
  #highlighted: EntityId | null = null;

  constructor(scene: Scene, field: ScrapField, physics: PhysicsWorldPort) {
    this.#field = field;
    this.#physics = physics;
    this.#batches = new ScrapBatches(scene, { glow: true, castShadow: true });
  }

  sync(): void {
    const active = new Set<EntityId>();
    for (const target of this.#field.activeTargets()) {
      const piece = this.#field.piece(target.id);
      if (!piece) continue;
      active.add(target.id);
      let slot = this.#slots.get(target.id);
      if (!slot) {
        slot = this.#batches.add(piece.materialId, { large: false, variant: variantOf(target.id) });
        this.#slots.set(target.id, slot);
      }
      const rotation = this.#physics.bodyRotation(target.body);
      this.#matrix.compose(
        new Vector3(target.position.x, target.position.y, target.position.z),
        new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w),
        new Vector3(piece.halfExtents.x * 2, piece.halfExtents.y * 2, piece.halfExtents.z * 2),
      );
      slot.mesh.setMatrixAt(slot.id, this.#matrix);
    }
    for (const [id, slot] of this.#slots) {
      if (active.has(id)) continue;
      slot.mesh.deleteInstance(slot.id);
      this.#slots.delete(id);
      if (this.#highlighted === id) this.#highlighted = null;
    }
  }

  highlight(feedback: TargetFeedback): void {
    const id = feedback.state === 'none' ? null : feedback.id;
    if (this.#highlighted !== null && this.#highlighted !== id) this.#tint(this.#highlighted, WHITE);
    this.#highlighted = id;
    if (id !== null && feedback.state !== 'none') this.#tint(id, HIGHLIGHT[feedback.state]);
  }

  #tint(id: EntityId, color: Color): void {
    const slot = this.#slots.get(id);
    if (slot) slot.mesh.setColorAt(slot.id, color);
  }
}
