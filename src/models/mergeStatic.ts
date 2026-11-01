import {
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  type BufferGeometry,
  type Material,
  type Side,
  type Object3D,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Static batching for procedural models (draw-call budget, MSC-019): every plain mesh under `root` is baked into
 * as few meshes as possible, relative to `root`. Plain standard materials move into vertex attributes (color,
 * roughness/metalness, emissive; flat-shaded parts get face normals), so a subtree becomes one mesh per face side;
 * other materials (textured, transparent) keep one mesh each. Instanced meshes, and any object for which `keep`
 * returns true (animated pivots, a named press head, a lamp whose material changes), keep their own transform;
 * meshes inside a kept subtree are batched separately within that subtree, so animation still moves them together.
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
        const original = child.material as Material;
        const finish = bakeable(original);
        // Unindexed geometry gets one normal per face, which is what flat shading shows.
        if (!geometry.attributes['normal'] || finish?.flatShading) geometry.computeVertexNormals();
        geometry = geometry.applyMatrix4(new Matrix4().multiplyMatrices(toRoot, child.matrixWorld));
        if (finish) bake(geometry, finish);
        const material = finish ? finishMaterial(finish.side) : original;
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

/** A plain standard material whose look can move into vertex attributes, or null. */
function bakeable(material: Material): MeshStandardMaterial | null {
  if (!(material instanceof MeshStandardMaterial) || material.type !== 'MeshStandardMaterial') return null;
  if (material.map || material.vertexColors || material.transparent) return null;
  return material;
}

/** Writes the material's color, roughness/metalness and emissive light into per-vertex attributes. */
function bake(geometry: BufferGeometry, material: MeshStandardMaterial): void {
  const count = geometry.attributes['position']?.count ?? 0;
  const color = new Float32Array(count * 3);
  const finish = new Float32Array(count * 2);
  const glow = new Float32Array(count * 3);
  const { r, g, b } = material.color;
  const e = material.emissive.clone().multiplyScalar(material.emissiveIntensity);
  for (let i = 0; i < count; i += 1) {
    color.set([r, g, b], i * 3);
    finish.set([material.roughness, material.metalness], i * 2);
    glow.set([e.r, e.g, e.b], i * 3);
  }
  geometry.setAttribute('color', new Float32BufferAttribute(color, 3));
  geometry.setAttribute('finish', new Float32BufferAttribute(finish, 2));
  geometry.setAttribute('glow', new Float32BufferAttribute(glow, 3));
}

/** Clones a material, keeping the baked-finish shader patch that `Material.clone()` does not copy. */
export function cloneMaterial<T extends Material>(source: T): T {
  const clone = source.clone();
  if (clone.userData['bakedFinish'] === true) patchBakedFinish(clone);
  return clone;
}

const finishes = new Map<Side, MeshStandardMaterial>();
const NL = '\n';
const VARYINGS = ['varying vec2 vFinish;', 'varying vec3 vGlow;'].join(NL);

/** Makes a standard material read color, finish and emissive light from the vertex attributes `bake` writes. */
function patchBakedFinish(material: Material): void {
  material.userData['bakedFinish'] = true;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        ['#include <common>', 'attribute vec2 finish;', 'attribute vec3 glow;', VARYINGS].join(NL),
      )
      .replace('#include <begin_vertex>', ['#include <begin_vertex>', 'vFinish = finish;', 'vGlow = glow;'].join(NL));
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', ['#include <common>', VARYINGS].join(NL))
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vFinish.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vFinish.y;')
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance = vGlow + emissive;');
  };
  material.customProgramCacheKey = () => 'baked-finish';
}

/**
 * One shared material per face side; its own `emissive` still adds on top of the baked light (aim highlight on
 * a clone made with {@link cloneMaterial}).
 */
function finishMaterial(side: Side): MeshStandardMaterial {
  let material = finishes.get(side);
  if (!material) {
    material = new MeshStandardMaterial({ vertexColors: true, side });
    patchBakedFinish(material);
    finishes.set(side, material);
  }
  return material;
}
