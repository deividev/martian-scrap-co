import { BoxGeometry, Mesh, MeshStandardMaterial, type Scene } from 'three';
import type { EntityId } from '../domain/ids';
import type { MediumPropSet } from '../simulation/handling/mediumProps';
import type { PhysicsWorldPort } from '../simulation/physics/physicsPort';
import { MATERIAL_COLORS } from './scrapPileView';

/** Renders medium props, adding and removing meshes as props appear (cut chunks) or disappear. */
export class PropView {
  readonly #scene: Scene;
  readonly #props: MediumPropSet;
  readonly #physics: PhysicsWorldPort;
  readonly #meshes = new Map<EntityId, Mesh<BoxGeometry, MeshStandardMaterial>>();

  constructor(scene: Scene, props: MediumPropSet, physics: PhysicsWorldPort) {
    this.#scene = scene;
    this.#props = props;
    this.#physics = physics;
  }

  sync(): void {
    const alive = new Set<EntityId>();
    for (const prop of this.#props.all()) {
      alive.add(prop.id);
      let mesh = this.#meshes.get(prop.id);
      if (!mesh) {
        const { x, y, z } = prop.halfExtents;
        mesh = new Mesh(
          new BoxGeometry(x * 2, y * 2, z * 2),
          new MeshStandardMaterial({ color: MATERIAL_COLORS[prop.materialId] ?? '#ff00ff', roughness: 0.5 }),
        );
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
      mesh.geometry.dispose();
      mesh.material.dispose();
      this.#meshes.delete(id);
    }
  }
}
