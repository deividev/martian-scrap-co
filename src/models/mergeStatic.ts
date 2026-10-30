import {
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Static batching for procedural models (draw-call budget, MSC-019): every plain mesh under `root` is baked into
 * as few meshes as possible, relative to `root`: plain painted materials are baked into vertex colors and grouped by
 * finish (roughness, metalness, side), other materials (glowing, textured) keep one mesh each. Instanced meshes, and any object for which `keep` returns true
 * (animated pivots, a named press head, a lamp whose material changes), keep their own transform; meshes inside
 * a kept subtree are batched separately within that subtree, so animation still moves them together.
 */
export function mergeStatic(root: Object3D, keep: (object: Object3D) => boolean = () => false): Object3D {
  root.updateMatrixWorld(true);
  const toRoot = new Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map<Material, BufferGeometry[]>();
  const merged: Object3D[] = [];
  const nested: Object3D[] = [];

  const visit = (object: Object3D): void => {
    for (const child of [...object.children]) {
      // Hidden parts (unused face expressions) and instanced meshes stay as they are.
      if (child instanceof InstancedMesh || !child.visible) continue;
      if (keep(child)) {
        nested.push(child);
        continue;
      }
      if (child instanceof Mesh && !Array.isArray(child.material)) {
        const source = child.geometry as BufferGeometry;
        let geometry = source.index ? source.toNonIndexed() : source.clone();
        for (const name of Object.keys(geometry.attributes)) {
          if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name);
        }
        if (!geometry.attributes['normal']) geometry.computeVertexNormals();
        geometry = geometry.applyMatrix4(new Matrix4().multiplyMatrices(toRoot, child.matrixWorld));
        const original = child.material as Material;
        const finish = bakeable(original);
        if (finish) {
          const { r, g, b } = finish.color;
          const count = geometry.attributes['position']?.count ?? 0;
          const colors = new Float32Array(count * 3);
          for (let i = 0; i < count; i += 1) colors.set([r, g, b], i * 3);
          geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
        }
        const material = finish ? finishMaterial(finish) : original;
        const list = buckets.get(material) ?? [];
        list.push(geometry);
        buckets.set(material, list);
        merged.push(child);
      }
      visit(child);
    }
  };
  visit(root);

  for (const mesh of merged) {
    // Keep any children of a merged mesh (rare) attached to the root at the same place.
    for (const child of [...mesh.children]) root.attach(child);
    mesh.removeFromParent();
  }
  for (const [material, geometries] of buckets) {
    const geometry = mergeGeometries(geometries);
    if (!geometry) continue;
    const batch = new Mesh(geometry, material);
    batch.castShadow = true;
    batch.receiveShadow = true;
    root.add(batch);
  }
  for (const subtree of nested) mergeStatic(subtree, keep);
  return root;
}

/** Collects objects into one group and batches it (static scenery). */
export function mergeStaticGroup(objects: readonly Object3D[], keep?: (object: Object3D) => boolean): Group {
  const group = new Group();
  for (const object of objects) group.add(object);
  mergeStatic(group, keep);
  return group;
}

const finishes = new Map<string, MeshStandardMaterial>();

/** A plain painted standard material whose color can move into vertex colors, or null. */
function bakeable(material: Material): MeshStandardMaterial | null {
  if (!(material instanceof MeshStandardMaterial)) return null;
  if (material.map || material.vertexColors || material.transparent) return null;
  if (material.emissiveIntensity > 0 && material.emissive.getHex() !== 0) return null;
  return material;
}

/** One shared vertex-colored material per finish. */
function finishMaterial(source: MeshStandardMaterial): MeshStandardMaterial {
  const key = `${source.roughness.toFixed(1)}|${source.metalness.toFixed(1)}|${source.side}|${source.flatShading}`;
  let material = finishes.get(key);
  if (!material) {
    material = new MeshStandardMaterial({
      vertexColors: true,
      roughness: Number(source.roughness.toFixed(1)),
      metalness: Number(source.metalness.toFixed(1)),
      side: source.side,
      flatShading: source.flatShading,
    });
    finishes.set(key, material);
  }
  return material;
}
