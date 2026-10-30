import { Color, InstancedMesh, Matrix4, Quaternion, Vector3, type Scene } from 'three';
import type { EntityId } from '../domain/ids';
import { SCRAP_COLORS, scrapGeometry, scrapMaterial, scrapVariantCount } from '../models/styledModels';
import type { TargetFeedback } from '../simulation/collection/magneticCollector';
import type { PhysicsWorldPort } from '../simulation/physics/physicsPort';
import type { ScrapField } from '../simulation/scrap/scrapField';

/** Readable base color per material (styled models own the palette; kept for instanced views). */
export const MATERIAL_COLORS: Readonly<Record<string, string>> = SCRAP_COLORS;

/** Instance tint for the aimed piece (multiplies the material color). */
const HIGHLIGHT: Record<Exclude<TargetFeedback['state'], 'none'>, Color> = {
  compatible: new Color('#9ffff0'),
  incompatible: new Color('#ffb08a'),
  blocked: new Color('#ffb08a'),
};
const WHITE = new Color('#ffffff');
const HIDDEN = new Matrix4().makeScale(0, 0, 0);

/** Stable small hash so each piece keeps the same silhouette variant across sessions. */
export function variantOf(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

interface Pool {
  mesh: InstancedMesh;
  readonly materialId: string;
  readonly variant: number;
  ids: (EntityId | null)[];
}

/**
 * Renders active scrap with material-specific shapes (nut, bracket, pipe, panel, coil…) and highlights the
 * target. One instanced mesh per material silhouette keeps draw calls flat however many pieces are awake
 * (MSC-019 budget); pools grow by doubling.
 */
export class ScrapPileView {
  readonly #scene: Scene;
  readonly #field: ScrapField;
  readonly #physics: PhysicsWorldPort;
  readonly #pools = new Map<string, Pool>();
  readonly #slots = new Map<EntityId, { readonly pool: Pool; readonly index: number }>();
  readonly #matrix = new Matrix4();
  #highlighted: EntityId | null = null;

  constructor(scene: Scene, field: ScrapField, physics: PhysicsWorldPort) {
    this.#scene = scene;
    this.#field = field;
    this.#physics = physics;
  }

  sync(): void {
    const active = new Set<EntityId>();
    const touched = new Set<Pool>();
    for (const target of this.#field.activeTargets()) {
      const piece = this.#field.piece(target.id);
      if (!piece) continue;
      active.add(target.id);
      const slot = this.#slots.get(target.id) ?? this.#assign(target.id, piece.materialId);
      const rotation = this.#physics.bodyRotation(target.body);
      this.#matrix.compose(
        new Vector3(target.position.x, target.position.y, target.position.z),
        new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w),
        new Vector3(piece.halfExtents.x * 2, piece.halfExtents.y * 2, piece.halfExtents.z * 2),
      );
      slot.pool.mesh.setMatrixAt(slot.index, this.#matrix);
      touched.add(slot.pool);
    }
    for (const [id, slot] of this.#slots) {
      if (active.has(id)) continue;
      slot.pool.mesh.setMatrixAt(slot.index, HIDDEN);
      slot.pool.mesh.setColorAt(slot.index, WHITE);
      slot.pool.ids[slot.index] = null;
      this.#slots.delete(id);
      touched.add(slot.pool);
      if (this.#highlighted === id) this.#highlighted = null;
    }
    for (const pool of touched) {
      pool.mesh.instanceMatrix.needsUpdate = true;
      if (pool.mesh.instanceColor) pool.mesh.instanceColor.needsUpdate = true;
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
    if (!slot) return;
    slot.pool.mesh.setColorAt(slot.index, color);
    if (slot.pool.mesh.instanceColor) slot.pool.mesh.instanceColor.needsUpdate = true;
  }

  #assign(id: EntityId, materialId: string): { readonly pool: Pool; readonly index: number } {
    const variant = variantOf(id) % scrapVariantCount(materialId, 'small');
    const key = `${materialId}:${variant}`;
    let pool = this.#pools.get(key);
    if (!pool) {
      pool = {
        mesh: this.#createMesh(materialId, variant, 32),
        materialId,
        variant,
        ids: new Array<EntityId | null>(32).fill(null),
      };
      this.#pools.set(key, pool);
    }
    let index = pool.ids.indexOf(null);
    if (index < 0) {
      this.#grow(pool);
      index = pool.ids.indexOf(null);
    }
    pool.ids[index] = id;
    const slot = { pool, index };
    this.#slots.set(id, slot);
    pool.mesh.setColorAt(index, WHITE);
    return slot;
  }

  #createMesh(materialId: string, variant: number, capacity: number): InstancedMesh {
    const mesh = new InstancedMesh(scrapGeometry(materialId, variant), scrapMaterial(materialId, true), capacity);
    for (let i = 0; i < capacity; i += 1) {
      mesh.setMatrixAt(i, HIDDEN);
      mesh.setColorAt(i, WHITE);
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.#scene.add(mesh);
    return mesh;
  }

  #grow(pool: Pool): void {
    const old = pool.mesh;
    const capacity = old.count * 2;
    const mesh = this.#createMesh(pool.materialId, pool.variant, capacity);
    for (let i = 0; i < old.count; i += 1) {
      old.getMatrixAt(i, this.#matrix);
      mesh.setMatrixAt(i, this.#matrix);
    }
    this.#scene.remove(old);
    old.dispose();
    pool.mesh = mesh;
    pool.ids = [...pool.ids, ...new Array<EntityId | null>(capacity - pool.ids.length).fill(null)];
  }
}
