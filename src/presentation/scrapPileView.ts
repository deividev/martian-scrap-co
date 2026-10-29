import { BoxGeometry, Color, Mesh, MeshStandardMaterial, type Scene } from 'three';
import type { EntityId } from '../domain/ids';
import type { TargetFeedback } from '../simulation/collection/magneticCollector';
import type { PhysicsWorldPort } from '../simulation/physics/physicsPort';
import type { ScrapField } from '../simulation/scrap/scrapField';

/** First-pass readable material colors (visual direction); shape and symbol cues come with real art. */
export const MATERIAL_COLORS: Readonly<Record<string, string>> = {
  ferrous: '#8c939c',
  aluminum: '#d9dde3',
  copper: '#c8743a',
  polymer: '#3f7fd9',
  heliofoil: '#2fb5a8',
  'regolith-ceramic': '#e8dcc0',
};

const HIGHLIGHT: Record<TargetFeedback['state'], Color> = {
  none: new Color('#000000'),
  compatible: new Color('#1e6f66'),
  incompatible: new Color('#5a2a12'),
  blocked: new Color('#5a2a12'),
};

/** Renders active scrap pieces and highlights the current target. Presentation only. */
export class ScrapPileView {
  readonly #scene: Scene;
  readonly #field: ScrapField;
  readonly #physics: PhysicsWorldPort;
  readonly #meshes = new Map<EntityId, Mesh<BoxGeometry, MeshStandardMaterial>>();
  #highlighted: EntityId | null = null;

  constructor(scene: Scene, field: ScrapField, physics: PhysicsWorldPort) {
    this.#scene = scene;
    this.#field = field;
    this.#physics = physics;
  }

  /** Creates meshes for newly active pieces, removes meshes of removed pieces and syncs poses. */
  sync(): void {
    const active = new Set<EntityId>();
    for (const target of this.#field.activeTargets()) {
      active.add(target.id);
      let mesh = this.#meshes.get(target.id);
      const piece = this.#field.piece(target.id);
      if (!mesh && piece) {
        const { x, y, z } = piece.halfExtents;
        mesh = new Mesh(
          new BoxGeometry(x * 2, y * 2, z * 2),
          new MeshStandardMaterial({ color: MATERIAL_COLORS[piece.materialId] ?? '#ff00ff', roughness: 0.6 }),
        );
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
      mesh.geometry.dispose();
      mesh.material.dispose();
      this.#meshes.delete(id);
      if (this.#highlighted === id) this.#highlighted = null;
    }
  }

  highlight(feedback: TargetFeedback): void {
    const id = feedback.state === 'none' ? null : feedback.id;
    if (this.#highlighted !== null && this.#highlighted !== id) {
      this.#meshes.get(this.#highlighted)?.material.emissive.copy(HIGHLIGHT.none);
    }
    this.#highlighted = id;
    if (id !== null) this.#meshes.get(id)?.material.emissive.copy(HIGHLIGHT[feedback.state]);
  }
}
