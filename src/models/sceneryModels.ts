import { BoxGeometry, CylinderGeometry, DodecahedronGeometry, Group, SphereGeometry, type BufferGeometry } from 'three';
import { mulberry32 } from '../simulation/benchmark/denseYardFixture';
import { STYLE, paint, part, rounded } from './styledModels';

/**
 * Mars scenery rebuilt against the approved gameplay concept (owner follow-up R3): layered red rock with
 * darker strata, stepped mesas, colorful ribbed shipping containers around the base and floodlight poles.
 * Shapes stay chunky and readable; colliders come from the shared backdrop layout, not from these meshes.
 */

const ROCK_TONES = ['#c45a37', '#b14a2d', '#d36f45'] as const;
const STRATA = '#8f3b25';

function jitteredRock(seed: number): BufferGeometry {
  const geometry = new DodecahedronGeometry(1, 0);
  const position = geometry.attributes['position'];
  if (position) {
    for (let i = 0; i < position.count; i += 1) {
      const n = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
      const jitter = 0.82 + (n - Math.floor(n)) * 0.3;
      position.setXYZ(i, position.getX(i) * jitter, position.getY(i) * jitter * 0.6, position.getZ(i) * jitter);
    }
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** Layered boulder: two or three flattened chunks stacked with a darker strata band (unit scale ≈ 1 m). */
export function createLayeredRock(seed: number, scale: number): Group {
  const rock = new Group();
  rock.name = 'rock';
  const random = mulberry32(seed + 1);
  const layers = 2 + (seed % 2);
  let y = 0.3;
  for (let i = 0; i < layers; i += 1) {
    const width = 1 - i * 0.22;
    const chunk = part(
      jitteredRock(seed * 7 + i),
      paint(ROCK_TONES[(seed + i) % ROCK_TONES.length] ?? STYLE.marsRock, 0.95),
      rock,
    );
    chunk.scale.set(width * (0.9 + random() * 0.2), 0.55, width * (0.9 + random() * 0.2));
    chunk.position.set((random() - 0.5) * 0.2, y, (random() - 0.5) * 0.2);
    chunk.rotation.y = random() * Math.PI;
    if (i < layers - 1) {
      const band = part(
        new CylinderGeometry(width * 0.82, width * 0.88, 0.08, 7),
        paint(STRATA, 1),
        rock,
        0,
        y + 0.3,
        0,
      );
      band.rotation.y = random() * Math.PI;
    }
    y += 0.55;
  }
  rock.scale.setScalar(scale);
  return rock;
}

/** Stepped mesa: tiers that narrow upward, alternating rock tones with strata lips (concept horizon cliffs). */
export function createMesa(radiusTop: number, radiusBottom: number, height: number, seed: number): Group {
  const mesa = new Group();
  mesa.name = 'mesa';
  const tiers = 3;
  const tierHeight = height / tiers;
  for (let i = 0; i < tiers; i += 1) {
    const t0 = i / tiers;
    const t1 = (i + 1) / tiers;
    const r0 = radiusBottom + (radiusTop - radiusBottom) * t0;
    const r1 = radiusBottom + (radiusTop - radiusBottom) * t1;
    const tier = part(
      new CylinderGeometry(r1 * 0.97, r0, tierHeight, 7),
      paint(ROCK_TONES[(seed + i) % ROCK_TONES.length] ?? STYLE.marsRock, 1),
      mesa,
      0,
      -height / 2 + tierHeight * (i + 0.5),
      0,
    );
    tier.rotation.y = seed * 0.7 + i * 0.4;
    const lip = part(
      new CylinderGeometry(r1, r1 * 1.02, tierHeight * 0.08, 7),
      paint(STRATA, 1),
      mesa,
      0,
      -height / 2 + tierHeight * (i + 1),
      0,
    );
    lip.rotation.y = tier.rotation.y;
  }
  return mesa;
}

/** Ribbed shipping container (concept base dressing): 6 × 2.5 × 2.4 m, painted, with dark doors and frame. */
export function createContainerModel(color: string): Group {
  const container = new Group();
  container.name = 'container';
  const body = paint(color, 0.65);
  const dark = paint(STYLE.dark, 0.8);
  part(rounded(6, 2.4, 2.4, 0.06), body, container, 0, 1.2, 0);
  for (let i = 0; i < 14; i += 1) {
    const x = -2.7 + i * 0.415;
    part(new BoxGeometry(0.12, 2.1, 2.48), body, container, x, 1.2, 0);
  }
  for (const y of [0.06, 2.34]) part(rounded(6.08, 0.14, 2.5, 0.03), dark, container, 0, y, 0);
  for (const x of [-2.98, 2.98]) part(rounded(0.12, 2.4, 2.5, 0.03), dark, container, x, 1.2, 0);
  part(rounded(0.05, 2.0, 2.2, 0.02), paint(STYLE.steelDark, 0.6), container, 3.02, 1.2, 0);
  for (const z of [-0.5, 0.5]) part(new CylinderGeometry(0.03, 0.03, 1.9, 6), dark, container, 3.06, 1.2, z);
  return container;
}

/** Floodlight pole for the base: yellow mast, dark head, warm lamp. */
export function createFloodlightModel(): Group {
  const pole = new Group();
  pole.name = 'floodlight';
  part(rounded(0.5, 0.2, 0.5, 0.04), paint(STYLE.dark, 0.8), pole, 0, 0.1, 0);
  part(new CylinderGeometry(0.08, 0.1, 5, 8), paint(STYLE.paintYellow, 0.55), pole, 0, 2.6, 0);
  part(rounded(0.9, 0.25, 0.35, 0.05), paint(STYLE.dark, 0.8), pole, 0, 5.15, 0.1);
  part(rounded(0.75, 0.12, 0.05, 0.03), paint('#fff3c4', 0.3, 0, '#ffd27a'), pole, 0, 5.1, 0.29);
  part(new SphereGeometry(0.08, 8, 6), paint(STYLE.paintOrange, 0.4, 0, '#ff6a00'), pole, 0, 5.36, 0.1);
  return pole;
}
