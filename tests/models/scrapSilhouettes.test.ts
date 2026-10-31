import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3, type BufferGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import { SCRAP_COLORS, largeScrapGeometry, scrapGeometry, scrapVariantCount } from '../../src/models/styledModels';

/**
 * Gaps between the top (or bottom) face of the unit collider box and the visible shape, from vertical rays over the
 * box footprint. Pieces rest on the box, so a large gap shows them floating (owner check 2026-10-30).
 */
function faceGaps(geometry: BufferGeometry, face: 'top' | 'bottom'): number[] {
  const mesh = new Mesh(geometry, new MeshBasicMaterial({ side: DoubleSide }));
  const raycaster = new Raycaster();
  const down = face === 'top' ? -1 : 1;
  const gaps: number[] = [];
  for (let i = 0; i < 9; i += 1) {
    for (let j = 0; j < 9; j += 1) {
      raycaster.set(new Vector3(-0.4 + i * 0.1, -down * 2, -0.4 + j * 0.1), new Vector3(0, down, 0));
      const hit = raycaster.intersectObject(mesh)[0];
      gaps.push(hit ? Math.abs(hit.point.y + down * 0.5) : 1);
    }
  }
  return gaps.sort((a, b) => a - b);
}

describe('scrap silhouettes fill their collider boxes', () => {
  const shapes = Object.keys(SCRAP_COLORS).flatMap((materialId) => [
    ...Array.from({ length: scrapVariantCount(materialId, 'small') }, (_, variant) => ({
      name: `${materialId} small ${variant}`,
      geometry: scrapGeometry(materialId, variant),
    })),
    ...Array.from({ length: scrapVariantCount(materialId, 'large') }, (_, variant) => ({
      name: `${materialId} large ${variant}`,
      geometry: largeScrapGeometry(materialId, variant),
    })),
  ]);

  it.each(shapes)('$name: top and bottom faces sit on the box', ({ geometry }) => {
    for (const face of ['top', 'bottom'] as const) {
      const gaps = faceGaps(geometry, face);
      // Most of the footprint is within a fifth of the box height of the face; round outlines leave the corners.
      expect(gaps[Math.floor(gaps.length * 0.8)]).toBeLessThanOrEqual(0.2);
    }
  });
});
