import { InstancedMesh, Matrix4, Quaternion, Vector3, type Scene } from 'three';
import type { EntityId } from '../domain/ids';
import { largeScrapGeometry, scrapGeometry, scrapMaterial, scrapVariantCount } from '../models/styledModels';
import type { ScrapField } from '../simulation/scrap/scrapField';
import type { ScrapMountain } from '../simulation/yard/scrapMountain';
import { variantOf } from './scrapPileView';

interface Slot {
  readonly mesh: InstancedMesh;
  readonly index: number;
}

const HIDDEN = new Matrix4().makeScale(0, 0, 0);

/**
 * Draws the scrap mountain with one instanced mesh per material silhouette (owner follow-up R4): embedded
 * medium/large parts and dormant small pieces. A piece that leaves the pile, wakes up or is collected is hidden
 * here and drawn by the prop or scrap views instead, so every visible piece matches a real collider.
 */
export class MountainView {
  readonly #mountain: ScrapMountain;
  readonly #field: ScrapField;
  readonly #slots = new Map<EntityId, Slot>();
  readonly #smallIds: EntityId[] = [];
  readonly #smallShown = new Map<EntityId, boolean>();
  #version = -1;

  constructor(scene: Scene, mountain: ScrapMountain, field: ScrapField, smallIds: readonly EntityId[]) {
    this.#mountain = mountain;
    this.#field = field;
    const groups = new Map<string, { geometryKey: [string, string, number]; ids: EntityId[] }>();
    const add = (key: [string, string, number], id: EntityId): void => {
      const name = key.join(':');
      const group = groups.get(name) ?? { geometryKey: key, ids: [] };
      group.ids.push(id);
      groups.set(name, group);
    };
    for (const piece of mountain.pieces()) {
      // Medium parts use the same silhouette the prop view gives them once they leave the pile.
      const variant = piece.size === 'medium' ? variantOf(piece.id) : piece.variant;
      add([piece.size, piece.materialId, variant % scrapVariantCount(piece.materialId, piece.size)], piece.id);
    }
    for (const id of smallIds) {
      const piece = field.piece(id);
      if (!piece) continue;
      add(['small', piece.materialId, variantOf(id) % scrapVariantCount(piece.materialId, 'small')], id);
      this.#smallIds.push(id);
    }
    for (const { geometryKey, ids } of groups.values()) {
      const [size, materialId, variant] = geometryKey;
      const geometry = size === 'large' ? largeScrapGeometry(materialId, variant) : scrapGeometry(materialId, variant);
      const mesh = new InstancedMesh(geometry, scrapMaterial(materialId), ids.length);
      // Small pieces are too small to read in the shadow map; skipping them saves shadow draw calls.
      mesh.castShadow = size !== 'small';
      mesh.receiveShadow = true;
      ids.forEach((id, index) => this.#slots.set(id, { mesh, index }));
      scene.add(mesh);
    }
    for (const piece of mountain.pieces()) this.#place(piece.id, piece.position, piece.rotation, piece.halfExtents);
    for (const id of this.#smallIds) this.#syncSmall(id, true);
    for (const { mesh } of this.#slots.values()) mesh.instanceMatrix.needsUpdate = true;
    this.#version = mountain.version;
  }

  /** Hides parts that left the pile and shows/hides small pieces as they sleep, wake or are collected. */
  sync(): void {
    if (this.#mountain.version !== this.#version) {
      this.#version = this.#mountain.version;
      for (const piece of this.#mountain.pieces()) {
        if (this.#mountain.state(piece.id) !== 'embedded') this.#hide(piece.id);
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
    else this.#hide(id);
  }

  #place(
    id: EntityId,
    position: { x: number; y: number; z: number },
    rotation: { x: number; y: number; z: number; w: number },
    half: { x: number; y: number; z: number },
  ): void {
    const slot = this.#slots.get(id);
    if (!slot) return;
    slot.mesh.setMatrixAt(
      slot.index,
      new Matrix4().compose(
        new Vector3(position.x, position.y, position.z),
        new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w),
        new Vector3(half.x * 2, half.y * 2, half.z * 2),
      ),
    );
    slot.mesh.instanceMatrix.needsUpdate = true;
  }

  #hide(id: EntityId): void {
    const slot = this.#slots.get(id);
    if (!slot) return;
    slot.mesh.setMatrixAt(slot.index, HIDDEN);
    slot.mesh.instanceMatrix.needsUpdate = true;
  }
}
