import { BatchedMesh, type BufferGeometry, type Scene } from 'three';
import {
  largeScrapGeometry,
  scrapGeometry,
  scrapMaterial,
  scrapProxyGeometry,
  scrapVariantCount,
} from '../models/styledModels';

/** A drawn scrap piece: its batch and instance id there. */
export interface ScrapInstance {
  readonly mesh: BatchedMesh;
  readonly id: number;
}

interface MaterialBatch {
  readonly mesh: BatchedMesh;
  readonly parts: number[];
  readonly large: number[];
  /** Distant stand-ins of `parts`, same order. */
  readonly proxies: number[];
}

/** Position and normal only, unindexed, so every silhouette fits one batch layout. */
function batchable(source: BufferGeometry): BufferGeometry {
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  for (const name of Object.keys(geometry.attributes)) {
    if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name);
  }
  if (!geometry.attributes['normal']) geometry.computeVertexNormals();
  return geometry;
}

/**
 * Every scrap silhouette of a material (small/medium shapes and large parts) in one multi-draw batch, so a
 * material costs one draw call (plus one shadow call) however many pieces or shapes are shown (draw-call
 * budget, MSC-019/MSC-020). Instances are scaled unit shapes, like the old instanced pools.
 */
export class ScrapBatches {
  readonly #scene: Scene;
  readonly #glow: boolean;
  readonly #castShadow: boolean;
  readonly #batches = new Map<string, MaterialBatch>();

  constructor(scene: Scene, options: { readonly glow: boolean; readonly castShadow: boolean }) {
    this.#scene = scene;
    this.#glow = options.glow;
    this.#castShadow = options.castShadow;
  }

  add(materialId: string, shape: { readonly large: boolean; readonly variant: number }): ScrapInstance {
    const batch = this.#batch(materialId);
    const ids = shape.large ? batch.large : batch.parts;
    const geometryId = ids[Math.abs(shape.variant) % ids.length] ?? 0;
    if (batch.mesh.instanceCount >= batch.mesh.maxInstanceCount) {
      batch.mesh.setInstanceCount(batch.mesh.maxInstanceCount * 2);
    }
    return { mesh: batch.mesh, id: batch.mesh.addInstance(geometryId) };
  }

  /** Draws a small/medium instance with its full silhouette or, from afar, its few-triangle stand-in. */
  setDistant(instance: ScrapInstance, materialId: string, variant: number, distant: boolean): void {
    const batch = this.#batch(materialId);
    const ids = distant ? batch.proxies : batch.parts;
    const geometryId = ids[Math.abs(variant) % ids.length] ?? 0;
    if (instance.mesh.getGeometryIdAt(instance.id) !== geometryId)
      instance.mesh.setGeometryIdAt(instance.id, geometryId);
  }

  #batch(materialId: string): MaterialBatch {
    let batch = this.#batches.get(materialId);
    if (batch) return batch;
    const parts = Array.from({ length: scrapVariantCount(materialId, 'small') }, (_, v) =>
      batchable(scrapGeometry(materialId, v)),
    );
    const large = Array.from({ length: scrapVariantCount(materialId, 'large') }, (_, v) =>
      batchable(largeScrapGeometry(materialId, v)),
    );
    const proxies = parts.map((_, v) => batchable(scrapProxyGeometry(materialId, v)));
    const vertices = [...parts, ...large, ...proxies].reduce(
      (sum, g) => sum + (g.attributes['position']?.count ?? 0),
      0,
    );
    const mesh = new BatchedMesh(64, vertices, 0, scrapMaterial(materialId, this.#glow));
    // Pieces move and hide every frame: cull per piece, skip whole-batch culling and per-frame sorting.
    mesh.frustumCulled = false;
    mesh.sortObjects = false;
    mesh.castShadow = this.#castShadow;
    mesh.receiveShadow = true;
    mesh.name = `scrap-${materialId}`;
    batch = {
      mesh,
      parts: parts.map((g) => mesh.addGeometry(g)),
      large: large.map((g) => mesh.addGeometry(g)),
      proxies: proxies.map((g) => mesh.addGeometry(g)),
    };
    this.#batches.set(materialId, batch);
    this.#scene.add(mesh);
    return batch;
  }
}
