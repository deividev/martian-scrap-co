import { Mesh, type MeshStandardMaterial, type Scene } from 'three';
import type { EntityId } from '../domain/ids';
import { SCRAP_COLORS, scrapGeometry, scrapMaterial, setScrapHighlight } from '../models/styledModels';
import type { TargetFeedback } from '../simulation/collection/magneticCollector';
import type { PhysicsWorldPort } from '../simulation/physics/physicsPort';
import type { ScrapField } from '../simulation/scrap/scrapField';

/** Readable base color per material (styled models own the palette; kept for instanced views). */
export const MATERIAL_COLORS: Readonly<Record<string, string>> = SCRAP_COLORS;

const HIGHLIGHT: Record<Exclude<TargetFeedback['state'], 'none'>, string> = {
  compatible: '#1e8f84',
  incompatible: '#7a3410',
  blocked: '#7a3410',
};

/** Stable small hash so each piece keeps the same silhouette variant across sessions. */
export function variantOf(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

/** Renders active scrap with material-specific shapes (nut, bracket, pipe, panel, coil…) and highlights the target. */
export class ScrapPileView {
  readonly #scene: Scene;
  readonly #field: ScrapField;
  readonly #physics: PhysicsWorldPort;
  readonly #meshes = new Map<EntityId, Mesh>();
  #highlighted: EntityId | null = null;

  constructor(scene: Scene, field: ScrapField, physics: PhysicsWorldPort) {
    this.#scene = scene;
    this.#field = field;
    this.#physics = physics;
  }

  sync(): void {
    const active = new Set<EntityId>();
    for (const target of this.#field.activeTargets()) {
      active.add(target.id);
      let mesh = this.#meshes.get(target.id);
      const piece = this.#field.piece(target.id);
      if (!mesh && piece) {
        // Own material instance so highlighting one piece never tints the others.
        mesh = new Mesh(
          scrapGeometry(piece.materialId, variantOf(piece.id)),
          scrapMaterial(piece.materialId, true).clone(),
        );
        mesh.scale.set(piece.halfExtents.x * 2, piece.halfExtents.y * 2, piece.halfExtents.z * 2);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.#meshes.set(target.id, mesh);
        this.#scene.add(mesh);
      }
      if (!mesh) continue;
      const rotation = this.#physics.bodyRotation(target.body);
      mesh.position.set(target.position.x, target.position.y, target.position.z);
      mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
    }
    for (const [id, mesh] of this.#meshes) {
      if (active.has(id)) continue;
      this.#scene.remove(mesh);
      (mesh.material as MeshStandardMaterial).dispose();
      this.#meshes.delete(id);
      if (this.#highlighted === id) this.#highlighted = null;
    }
  }

  highlight(feedback: TargetFeedback): void {
    const id = feedback.state === 'none' ? null : feedback.id;
    if (this.#highlighted !== null && this.#highlighted !== id) this.#paint(this.#highlighted, null);
    this.#highlighted = id;
    if (id !== null && feedback.state !== 'none') this.#paint(id, HIGHLIGHT[feedback.state]);
  }

  #paint(id: EntityId, highlight: string | null): void {
    const mesh = this.#meshes.get(id);
    const piece = this.#field.piece(id);
    if (mesh && piece) setScrapHighlight(mesh.material as MeshStandardMaterial, highlight, piece.materialId);
  }
}
