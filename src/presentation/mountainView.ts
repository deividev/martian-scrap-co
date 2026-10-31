import { Matrix4, Quaternion, Vector3, type Scene } from 'three';
import type { EntityId } from '../domain/ids';
import type { ScrapField } from '../simulation/scrap/scrapField';
import type { ScrapMountain } from '../simulation/yard/scrapMountain';
import { ScrapBatches, type ScrapInstance } from './scrapBatch';
import { variantOf } from './scrapPileView';

/** Small mountain pieces farther than this (horizontal, meters) use their few-triangle stand-in. */
const SMALL_DETAIL_DISTANCE = 18;
/** The view re-checks detail levels when the viewer moved this far, meters. */
const REFRESH_MOVE = 1;
/**
 * Small pieces switch detail by ground cell (meters), not one by one: a refresh checks a few hundred cells instead of
 * every piece (frame-time spikes on the dense mountain).
 */
const DETAIL_CELL = 4;

interface DetailCell {
  readonly x: number;
  readonly z: number;
  readonly ids: EntityId[];
  distant: boolean | undefined;
}

/**
 * Draws the scrap mountain with one multi-draw batch per material (owner follow-up R4): embedded medium/large
 * parts and dormant small pieces. A piece that leaves the pile, wakes up or is collected is hidden here and
 * drawn by the prop or scrap views instead, so every visible piece matches a real collider.
 */
export class MountainView {
  readonly #mountain: ScrapMountain;
  readonly #field: ScrapField;
  readonly #slots = new Map<EntityId, ScrapInstance>();
  readonly #smallShown = new Map<EntityId, boolean>();
  readonly #cells = new Map<string, DetailCell>();
  /** Small pieces whose state changed since the last sync. */
  readonly #dirty = new Set<EntityId>();
  readonly #smallBatches: ScrapBatches;
  readonly #viewer = new Vector3();
  readonly #refreshedAt = new Vector3(Infinity, 0, 0);
  readonly #matrix = new Matrix4();
  #version = -1;

  constructor(scene: Scene, mountain: ScrapMountain, field: ScrapField, smallIds: readonly EntityId[]) {
    this.#mountain = mountain;
    this.#field = field;
    const batches = new ScrapBatches(scene, { glow: false, castShadow: true });
    // Small pieces cast shadows too: without them they read as hovering over what holds them up.
    const smallBatches = new ScrapBatches(scene, { glow: false, castShadow: true });
    this.#smallBatches = smallBatches;
    for (const piece of mountain.pieces()) {
      // Medium parts use the same silhouette the prop view gives them once they leave the pile.
      const variant = piece.size === 'medium' ? variantOf(piece.id) : piece.variant;
      this.#slots.set(piece.id, batches.add(piece.materialId, { large: piece.size === 'large', variant }));
      this.#place(piece.id, piece.position, piece.rotation, piece.halfExtents);
    }
    for (const id of smallIds) {
      const piece = field.piece(id);
      if (!piece) continue;
      this.#slots.set(id, smallBatches.add(piece.materialId, { large: false, variant: variantOf(id) }));
      // A piece keeps the cell it was laid out in (detail only; it rests near there).
      const col = Math.floor(piece.position.x / DETAIL_CELL);
      const row = Math.floor(piece.position.z / DETAIL_CELL);
      const key = `${col}:${row}`;
      let cell = this.#cells.get(key);
      if (!cell) {
        cell = { x: (col + 0.5) * DETAIL_CELL, z: (row + 0.5) * DETAIL_CELL, ids: [], distant: undefined };
        this.#cells.set(key, cell);
      }
      cell.ids.push(id);
      this.#syncSmall(id);
    }
    field.onStateChange((id) => {
      if (this.#smallShown.has(id)) this.#dirty.add(id);
    });
    this.#version = mountain.version;
  }

  /**
   * Hides parts that left the pile and shows/hides small pieces as they sleep, wake or are collected. Small
   * pieces farther than `SMALL_DETAIL_DISTANCE` from the viewer use a few-triangle stand-in (triangle budget).
   */
  sync(viewer: { x: number; y: number; z: number }): void {
    this.#viewer.set(viewer.x, viewer.y, viewer.z);
    if (this.#mountain.version !== this.#version) {
      this.#version = this.#mountain.version;
      for (const piece of this.#mountain.pieces()) {
        if (this.#mountain.state(piece.id) !== 'embedded') this.#show(piece.id, false);
      }
    }
    for (const id of this.#dirty) this.#syncSmall(id);
    this.#dirty.clear();
    const moved = Math.hypot(this.#viewer.x - this.#refreshedAt.x, this.#viewer.z - this.#refreshedAt.z);
    if (moved < REFRESH_MOVE) return;
    this.#refreshedAt.copy(this.#viewer);
    for (const cell of this.#cells.values()) {
      const distant = Math.hypot(cell.x - this.#viewer.x, cell.z - this.#viewer.z) > SMALL_DETAIL_DISTANCE;
      if (cell.distant === distant) continue;
      cell.distant = distant;
      for (const id of cell.ids) {
        const slot = this.#slots.get(id);
        const piece = this.#field.piece(id);
        if (slot && piece) this.#smallBatches.setDistant(slot, piece.materialId, variantOf(id), distant);
      }
    }
  }

  #syncSmall(id: EntityId): void {
    const piece = this.#field.piece(id);
    const show = piece?.state === 'dormant';
    if (this.#smallShown.get(id) === show) return;
    this.#smallShown.set(id, show);
    // A piece that slept again may rest elsewhere.
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
