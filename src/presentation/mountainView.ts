import { Matrix4, Quaternion, Vector3, type Scene } from 'three';
import type { EntityId } from '../domain/ids';
import type { ScrapField } from '../simulation/scrap/scrapField';
import type { ScrapMountain } from '../simulation/yard/scrapMountain';
import { ScrapBatches, type ScrapInstance } from './scrapBatch';
import { variantOf } from './scrapPileView';

/**
 * Draws the scrap mountain with one multi-draw batch per material (owner follow-up R4): embedded medium/large
 * parts and dormant small pieces. A piece that leaves the pile, wakes up or is collected is hidden here and
 * drawn by the prop or scrap views instead, so every visible piece matches a real collider.
 */
export class MountainView {
  readonly #mountain: ScrapMountain;
  readonly #field: ScrapField;
  readonly #slots = new Map<EntityId, ScrapInstance>();
  readonly #smallIds: EntityId[] = [];
  readonly #smallShown = new Map<EntityId, boolean>();
  readonly #matrix = new Matrix4();
  #version = -1;

  constructor(scene: Scene, mountain: ScrapMountain, field: ScrapField, smallIds: readonly EntityId[]) {
    this.#mountain = mountain;
    this.#field = field;
    const batches = new ScrapBatches(scene, { glow: false, castShadow: true });
    for (const piece of mountain.pieces()) {
      // Medium parts use the same silhouette the prop view gives them once they leave the pile.
      const variant = piece.size === 'medium' ? variantOf(piece.id) : piece.variant;
      this.#slots.set(piece.id, batches.add(piece.materialId, { large: piece.size === 'large', variant }));
      this.#place(piece.id, piece.position, piece.rotation, piece.halfExtents);
    }
    for (const id of smallIds) {
      const piece = field.piece(id);
      if (!piece) continue;
      this.#slots.set(id, batches.add(piece.materialId, { large: false, variant: variantOf(id) }));
      this.#smallIds.push(id);
      this.#syncSmall(id, true);
    }
    this.#version = mountain.version;
  }

  /** Hides parts that left the pile and shows/hides small pieces as they sleep, wake or are collected. */
  sync(): void {
    if (this.#mountain.version !== this.#version) {
      this.#version = this.#mountain.version;
      for (const piece of this.#mountain.pieces()) {
        if (this.#mountain.state(piece.id) !== 'embedded') this.#show(piece.id, false);
      }
    }
    for (const id of this.#smallIds) this.#syncSmall(id, false);
  }

  #syncSmall(id: EntityId, force: boolean): void {
    const piece = this.#field.piece(id);
    const show = piece?.state === 'dormant';
    if (!force && this.#smallShown.get(id) === show) return;
    this.#smallShown.set(id, show);
    if (show && piece) this.#place(id, piece.position, piece.rotation, piece.halfExtents);
    this.#show(id, show);
  }

  #place(
    id: EntityId,
    position: { x: number; y: number; z: number },
    rotation: { x: number; y: number; z: number; w: number },
    half: { x: number; y: number; z: number },
  ): void {
    const slot = this.#slots.get(id);
    if (!slot) return;
    this.#matrix.compose(
      new Vector3(position.x, position.y, position.z),
      new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w),
      new Vector3(half.x * 2, half.y * 2, half.z * 2),
    );
    slot.mesh.setMatrixAt(slot.id, this.#matrix);
  }

  #show(id: EntityId, visible: boolean): void {
    const slot = this.#slots.get(id);
    if (slot && slot.mesh.getVisibleAt(slot.id) !== visible) slot.mesh.setVisibleAt(slot.id, visible);
  }
}
