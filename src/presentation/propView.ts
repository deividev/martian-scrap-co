import { Mesh, type MeshStandardMaterial, type Scene } from 'three';
import type { EntityId } from '../domain/ids';
import { scrapGeometry, scrapMaterial } from '../models/styledModels';
import type { MediumPropSet } from '../simulation/handling/mediumProps';
import type { PhysicsWorldPort } from '../simulation/physics/physicsPort';
import { variantOf } from './scrapPileView';

/**
 * Renders medium props with their material silhouette (panel, housing, coil…) sized to the collider,
 * adding and removing meshes as props appear (cut chunks) or disappear.
 */
export class PropView {
  readonly #scene: Scene;
  readonly #props: MediumPropSet;
  readonly #physics: PhysicsWorldPort;
  readonly #meshes = new Map<EntityId, Mesh>();

  constructor(scene: Scene, props: MediumPropSet, physics: PhysicsWorldPort) {
    this.#scene = scene;
    this.#props = props;
    this.#physics = physics;
  }

  /** Highlights one prop (aim feedback); `null` clears it. */
  highlight(id: EntityId | null): void {
    for (const [propId, mesh] of this.#meshes) {
      (mesh.material as MeshStandardMaterial).emissive.set(propId === id ? '#1e8f84' : '#000000');
    }
  }

  sync(): void {
    const alive = new Set<EntityId>();
    for (const prop of this.#props.all()) {
      alive.add(prop.id);
      let mesh = this.#meshes.get(prop.id);
      if (!mesh) {
        const { x, y, z } = prop.halfExtents;
        mesh = new Mesh(scrapGeometry(prop.materialId, variantOf(prop.id)), scrapMaterial(prop.materialId).clone());
        mesh.scale.set(x * 2, y * 2, z * 2);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.#meshes.set(prop.id, mesh);
        this.#scene.add(mesh);
      }
      const p = this.#physics.bodyPosition(prop.body);
      const r = this.#physics.bodyRotation(prop.body);
      mesh.position.set(p.x, p.y, p.z);
      mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
    for (const [id, mesh] of this.#meshes) {
      if (alive.has(id)) continue;
      this.#scene.remove(mesh);
      (mesh.material as MeshStandardMaterial).dispose();
      this.#meshes.delete(id);
    }
  }
}
