import { Mesh, type MeshStandardMaterial, type Object3D, type Scene } from 'three';
import type { EntityId } from '../domain/ids';
import { scrapGeometry, scrapMaterial, setScrapHighlight } from '../models/styledModels';
import type { MediumProp, MediumPropSet } from '../simulation/handling/mediumProps';
import type { PhysicsWorldPort } from '../simulation/physics/physicsPort';
import { variantOf } from './scrapPileView';

/** Optional model for special props (bales); return null to use the material silhouette. */
export type PropModelFactory = (prop: MediumProp) => Object3D | null;

const HIGHLIGHT = '#1e8f84';

/**
 * Renders medium props with their material silhouette (panel, housing, coil…) sized to the collider,
 * adding and removing meshes as props appear (cut chunks, bales) or disappear.
 */
export class PropView {
  readonly #scene: Scene;
  readonly #props: MediumPropSet;
  readonly #physics: PhysicsWorldPort;
  readonly #modelFor: PropModelFactory;
  readonly #objects = new Map<EntityId, Object3D>();

  constructor(scene: Scene, props: MediumPropSet, physics: PhysicsWorldPort, modelFor: PropModelFactory = () => null) {
    this.#scene = scene;
    this.#props = props;
    this.#physics = physics;
    this.#modelFor = modelFor;
  }

  /** Highlights one prop (aim feedback); `null` clears it. */
  highlight(id: EntityId | null): void {
    for (const [propId, object] of this.#objects) {
      const materialId = this.#props.get(propId)?.materialId ?? '';
      const on = propId === id;
      object.traverse((child) => {
        if (!(child instanceof Mesh)) return;
        const material = child.material as MeshStandardMaterial;
        if (object.userData['custom'] === true) material.emissive.set(on ? HIGHLIGHT : '#000000');
        else setScrapHighlight(material, on ? HIGHLIGHT : null, materialId);
      });
    }
  }

  sync(): void {
    const alive = new Set<EntityId>();
    for (const prop of this.#props.all()) {
      alive.add(prop.id);
      let object = this.#objects.get(prop.id);
      if (!object) {
        object = this.#create(prop);
        this.#objects.set(prop.id, object);
        this.#scene.add(object);
      }
      const p = this.#physics.bodyPosition(prop.body);
      const r = this.#physics.bodyRotation(prop.body);
      object.position.set(p.x, p.y, p.z);
      object.quaternion.set(r.x, r.y, r.z, r.w);
    }
    for (const [id, object] of this.#objects) {
      if (alive.has(id)) continue;
      this.#scene.remove(object);
      object.traverse((child) => {
        if (child instanceof Mesh && child.userData['ownMaterial'] === true) {
          (child.material as MeshStandardMaterial).dispose();
        }
      });
      this.#objects.delete(id);
    }
  }

  #create(prop: MediumProp): Object3D {
    const custom = this.#modelFor(prop);
    if (custom) {
      // Own material per mesh so highlighting one prop never tints another.
      custom.userData['custom'] = true;
      custom.traverse((child) => {
        if (!(child instanceof Mesh)) return;
        child.material = (child.material as MeshStandardMaterial).clone();
        child.userData['ownMaterial'] = true;
        child.castShadow = true;
        child.receiveShadow = true;
      });
      return custom;
    }
    const { x, y, z } = prop.halfExtents;
    const mesh = new Mesh(
      scrapGeometry(prop.materialId, variantOf(prop.id)),
      scrapMaterial(prop.materialId, true).clone(),
    );
    mesh.userData['ownMaterial'] = true;
    mesh.scale.set(x * 2, y * 2, z * 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}
