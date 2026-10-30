import type { BufferGeometry, Object3D } from 'three';
import {
  BoxGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Shape,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * Procedural low-poly models for the visual style pass (approved anchors: gameplay and character concept
 * sheets). Chunky bevelled shapes, saturated industrial paint, dark rubber parts, no grime textures.
 * Physics stays on simple box colliders; these meshes are scaled to fit them.
 */
export const STYLE = Object.freeze({
  dark: '#2b2e35',
  steel: '#8d96a2',
  steelDark: '#5f6772',
  paintRed: '#d9493a',
  paintBlue: '#3d6fc4',
  paintYellow: '#f2b21c',
  paintOrange: '#f07a1e',
  copper: '#c8692e',
  aluminum: '#d7dce3',
  heliofoil: '#2fb5a8',
  ceramic: '#ead9bb',
  marsGround: '#cf6a3d',
  marsDark: '#a94b2c',
  marsRock: '#b9573a',
  skyTop: '#e39b86',
  skyHorizon: '#f7cdb2',
  stationWhite: '#e7e1d6',
});

/** Faint self-light of loose scrap in its own material color (readability against the ground). */
const GLOW_INTENSITY = 0.14;
const materialCache = new Map<string, MeshStandardMaterial>();
/** Shared flat-shaded materials so hundreds of pieces cost few material switches. */
export function paint(color: string, roughness = 0.6, metalness = 0.05, emissive?: string): MeshStandardMaterial {
  const key = `${color}|${roughness}|${metalness}|${emissive ?? ''}`;
  let material = materialCache.get(key);
  if (!material) {
    material = new MeshStandardMaterial({ color, roughness, metalness, flatShading: true });
    if (emissive) {
      material.emissive.set(emissive);
      material.emissiveIntensity = emissive === color ? GLOW_INTENSITY : 0.8;
    }
    materialCache.set(key, material);
  }
  return material;
}

const rounded = (w: number, h: number, d: number, r: number): BufferGeometry => new RoundedBoxGeometry(w, h, d, 2, r);

function part(geometry: BufferGeometry, material: MeshStandardMaterial, parent: Object3D, x = 0, y = 0, z = 0): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

// ---------------------------------------------------------------------------------------------
// Scrap: one silhouette vocabulary per material family (visual §6). Unit-sized, scaled to colliders.

/**
 * One identifying color per material (owner decision 2026-10-30): every piece reads its material at a
 * glance, by color and by its own silhouette family, and the colors stay apart from each other and from
 * the warm ground. Placeholder values until the scrap pilot (MSC-042).
 */
export const SCRAP_COLORS: Readonly<Record<string, string>> = {
  ferrous: '#8592a3',
  aluminum: '#eef3f9',
  copper: '#ff9640',
  polymer: '#3f7ff2',
  heliofoil: '#2fd3c0',
  'regolith-ceramic': '#b88ae8',
};

function hexNut(): BufferGeometry {
  const outer = new Shape();
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2;
    const point = [Math.cos(angle) * 0.5, Math.sin(angle) * 0.5] as const;
    if (i === 0) outer.moveTo(point[0], point[1]);
    else outer.lineTo(point[0], point[1]);
  }
  outer.closePath();
  const hole = new Shape();
  hole.absarc(0, 0, 0.22, 0, Math.PI * 2, true);
  outer.holes.push(hole);
  const geometry = new ExtrudeGeometry(outer, {
    depth: 0.45,
    bevelEnabled: true,
    bevelSize: 0.04,
    bevelThickness: 0.04,
    bevelSegments: 1,
  });
  geometry.center();
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

function lBracket(): BufferGeometry {
  const shape = new Shape();
  shape.moveTo(-0.5, -0.5);
  shape.lineTo(0.5, -0.5);
  shape.lineTo(0.5, -0.22);
  shape.lineTo(-0.22, -0.22);
  shape.lineTo(-0.22, 0.5);
  shape.lineTo(-0.5, 0.5);
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, { depth: 0.8, bevelEnabled: false });
  geometry.center();
  return geometry;
}

function pipeStub(): BufferGeometry {
  const geometry = new CylinderGeometry(0.5, 0.5, 1, 10, 1, true);
  const inner = new CylinderGeometry(0.33, 0.33, 1, 10, 1, true);
  inner.scale(-1, 1, -1);
  const rimTop = new TorusGeometry(0.415, 0.085, 4, 10);
  rimTop.rotateX(Math.PI / 2);
  rimTop.translate(0, 0.5, 0);
  const rimBottom = rimTop.clone().translate(0, -1, 0);
  const merged = mergeGeometries([
    geometry.toNonIndexed(),
    inner.toNonIndexed(),
    rimTop.toNonIndexed(),
    rimBottom.toNonIndexed(),
  ]);
  merged.rotateZ(Math.PI / 2);
  return merged;
}

function ribbedPlate(ribs: number): BufferGeometry {
  const pieces: BufferGeometry[] = [new BoxGeometry(1, 0.45, 1).toNonIndexed()];
  for (let i = 0; i < ribs; i += 1) {
    const rib = new BoxGeometry(0.12, 0.35, 1).toNonIndexed();
    rib.translate(-0.4 + (i * 0.8) / Math.max(1, ribs - 1), 0.38, 0);
    pieces.push(rib);
  }
  const merged = mergeGeometries(pieces);
  merged.computeBoundingBox();
  merged.center();
  return merged;
}

function stampedPanel(): BufferGeometry {
  const panel = new RoundedBoxGeometry(1, 0.6, 1, 1, 0.12).toNonIndexed();
  const triangle = new Shape();
  triangle.moveTo(-0.22, -0.18);
  triangle.lineTo(0.22, -0.18);
  triangle.lineTo(0, 0.22);
  triangle.closePath();
  const stamp = new ExtrudeGeometry(triangle, { depth: 0.15, bevelEnabled: false }).toNonIndexed();
  stamp.rotateX(-Math.PI / 2);
  stamp.translate(0, 0.3, 0);
  return mergeGeometries([panel, stamp]);
}

function coil(): BufferGeometry {
  const turns: BufferGeometry[] = [];
  for (let i = 0; i < 3; i += 1) {
    const ring = new TorusGeometry(0.36, 0.13, 6, 14).toNonIndexed();
    ring.rotateX(Math.PI / 2);
    ring.translate(0, -0.3 + i * 0.3, 0);
    turns.push(ring);
  }
  return mergeGeometries(turns);
}

function housing(): BufferGeometry {
  const body = new RoundedBoxGeometry(1, 1, 1, 2, 0.22).toNonIndexed();
  const grille = new BoxGeometry(0.5, 0.08, 0.06).toNonIndexed();
  const slots = [0.2, 0, -0.2].map((y) => grille.clone().translate(0, y, 0.52));
  return mergeGeometries([body, ...slots]);
}

function foilSheet(): BufferGeometry {
  const layers = [0, 1, 2].map((i) =>
    new BoxGeometry(1 - i * 0.08, 0.28, 1 - i * 0.08).toNonIndexed().translate(0, -0.3 + i * 0.3, 0),
  );
  return mergeGeometries(layers);
}

function ceramicTile(): BufferGeometry {
  const tile = new RoundedBoxGeometry(1, 0.55, 1, 1, 0.1).toNonIndexed();
  const ridges = [-0.3, 0, 0.3].map((x) => new BoxGeometry(0.1, 0.2, 0.9).toNonIndexed().translate(x, 0.32, 0));
  return mergeGeometries([tile, ...ridges]);
}

const SCRAP_SHAPES: Readonly<Record<string, readonly (() => BufferGeometry)[]>> = {
  ferrous: [hexNut, lBracket, pipeStub, () => ribbedPlate(3)],
  aluminum: [stampedPanel],
  copper: [coil],
  polymer: [housing],
  heliofoil: [foilSheet],
  'regolith-ceramic': [ceramicTile],
};

const scrapGeometryCache = new Map<string, BufferGeometry>();
/** Unit-sized (≈1 m) geometry for a material and variant index; scale it to the collider box. */
export function scrapGeometry(materialId: string, variant: number): BufferGeometry {
  const shapes = SCRAP_SHAPES[materialId] ?? SCRAP_SHAPES['ferrous'] ?? [];
  const index = Math.abs(variant) % Math.max(1, shapes.length);
  const key = `${materialId}:${index}`;
  let geometry = scrapGeometryCache.get(key);
  if (!geometry) {
    geometry = (shapes[index] ?? hexNut)();
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (box) {
      const sx = box.max.x - box.min.x || 1;
      const sy = box.max.y - box.min.y || 1;
      const sz = box.max.z - box.min.z || 1;
      geometry.translate(-(box.min.x + box.max.x) / 2, -(box.min.y + box.max.y) / 2, -(box.min.z + box.max.z) / 2);
      geometry.scale(1 / sx, 1 / sy, 1 / sz);
    }
    geometry.computeVertexNormals();
    scrapGeometryCache.set(key, geometry);
  }
  return geometry;
}

/**
 * Shared scrap material. `glow` adds a faint self-light in the material color so loose pieces stand out
 * from the ground; the decorative mountain leaves it off.
 */
export function scrapMaterial(materialId: string, glow = false): MeshStandardMaterial {
  const metal = materialId === 'ferrous' || materialId === 'aluminum' || materialId === 'copper';
  const color = SCRAP_COLORS[materialId] ?? '#ff00ff';
  return paint(color, metal ? 0.4 : 0.6, metal ? 0.45 : 0.05, glow ? color : undefined);
}

/** Aim highlight on a (cloned) scrap material; `null` restores the material's own faint glow. */
export function setScrapHighlight(material: MeshStandardMaterial, highlight: string | null, materialId: string): void {
  material.emissive.set(highlight ?? SCRAP_COLORS[materialId] ?? '#000000');
  material.emissiveIntensity = highlight ? 0.9 : GLOW_INTENSITY;
}

/** A scrap mesh sized to a collider box (full extents in meters). */
export function createScrapMesh(materialId: string, variant: number, size: { x: number; y: number; z: number }): Mesh {
  const mesh = new Mesh(scrapGeometry(materialId, variant), scrapMaterial(materialId));
  mesh.scale.set(size.x, size.y, size.z);
  mesh.castShadow = true;
  return mesh;
}

// ---------------------------------------------------------------------------------------------
// Magnetic collector (first-person tool): orange drum, dark rim and hose, steel nozzle (gameplay concept).

export function createMagnetToolModel(): Group {
  const tool = new Group();
  tool.name = 'magnet-tool';
  const orange = paint(STYLE.paintOrange, 0.5);
  const dark = paint(STYLE.dark, 0.75);
  const steel = paint(STYLE.steel, 0.35, 0.6);
  const glow = paint('#ffd166', 0.3, 0, '#ffb11a');
  const drum = part(new CylinderGeometry(0.17, 0.19, 0.16, 12), orange, tool);
  drum.rotation.x = Math.PI / 2;
  const rim = part(new TorusGeometry(0.18, 0.035, 5, 14), dark, tool, 0, 0, -0.08);
  rim.rotation.set(0, 0, 0);
  part(new CylinderGeometry(0.12, 0.14, 0.06, 12), dark, tool, 0, 0, 0.1).rotation.x = Math.PI / 2;
  part(rounded(0.06, 0.03, 0.1, 0.01), glow, tool, 0.08, 0.15, 0);
  const nozzle = part(new CylinderGeometry(0.05, 0.065, 0.3, 10), steel, tool, 0, 0, -0.26);
  nozzle.rotation.x = Math.PI / 2;
  part(new TorusGeometry(0.06, 0.018, 5, 10), dark, tool, 0, 0, -0.41);
  const hose = part(new TorusGeometry(0.16, 0.035, 6, 12, Math.PI), dark, tool, -0.02, 0.17, 0.02);
  hose.rotation.y = Math.PI / 2;
  const handle = part(rounded(0.07, 0.16, 0.07, 0.02), dark, tool, 0, -0.16, 0.06);
  handle.rotation.x = 0.3;
  const glove = part(rounded(0.13, 0.11, 0.15, 0.04), paint(STYLE.paintYellow, 0.55), tool, 0.02, -0.22, 0.12);
  glove.rotation.x = 0.2;
  return tool;
}

/** Hand cutter (first-person): dark grip, yellow body and an orange glowing cutting tip. */
export function createCutterToolModel(): Group {
  const tool = new Group();
  tool.name = 'cutter-tool';
  part(rounded(0.1, 0.1, 0.32, 0.03), paint(STYLE.paintYellow, 0.55), tool);
  part(rounded(0.07, 0.16, 0.08, 0.02), paint(STYLE.dark, 0.75), tool, 0, -0.12, 0.08);
  const head = part(new CylinderGeometry(0.035, 0.05, 0.14, 8), paint(STYLE.steel, 0.35, 0.6), tool, 0, 0, -0.22);
  head.rotation.x = Math.PI / 2;
  part(new SphereGeometry(0.03, 8, 6), paint('#ff9a3c', 0.3, 0, '#ff6a00'), tool, 0, 0, -0.3);
  return tool;
}

// ---------------------------------------------------------------------------------------------
// Cart: yellow hauling cart with a slatted bed, dark wheels and push handle (gameplay concept).

export function createCartModel(half: { x: number; y: number; z: number }): Group {
  const cart = new Group();
  cart.name = 'cart';
  const yellow = paint(STYLE.paintYellow, 0.55);
  const dark = paint(STYLE.dark, 0.75);
  const w = half.x * 2;
  const d = half.z * 2;
  part(rounded(w, 0.08, d, 0.02), dark, cart, 0, -half.y + 0.12, 0);
  part(rounded(w, half.y * 1.4, 0.07, 0.02), yellow, cart, 0, 0.02, -half.z + 0.035);
  part(rounded(w, half.y * 1.4, 0.07, 0.02), yellow, cart, 0, 0.02, half.z - 0.035);
  part(rounded(0.07, half.y * 1.4, d, 0.02), yellow, cart, -half.x + 0.035, 0.02, 0);
  part(rounded(0.07, half.y * 1.4, d, 0.02), yellow, cart, half.x - 0.035, 0.02, 0);
  for (const x of [-w * 0.25, w * 0.25]) part(rounded(0.04, half.y * 1.2, 0.08, 0.01), dark, cart, x, 0.04, half.z);
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      const wheel = part(
        new CylinderGeometry(0.12, 0.12, 0.08, 10),
        dark,
        cart,
        x * (half.x - 0.12),
        -half.y,
        z * (half.z - 0.08),
      );
      wheel.rotation.z = Math.PI / 2;
    }
  }
  const handle = part(new CylinderGeometry(0.025, 0.025, w * 0.8, 8), dark, cart, 0, half.y + 0.25, half.z + 0.18);
  handle.rotation.z = Math.PI / 2;
  for (const x of [-1, 1])
    part(new CylinderGeometry(0.02, 0.02, 0.4, 6), dark, cart, x * w * 0.38, half.y + 0.08, half.z + 0.1).rotation.x =
      -0.5;
  return cart;
}

// ---------------------------------------------------------------------------------------------
// Rover fragments: each matches its authored collider box (fragment id → mesh group).

export function createRoverFragmentModel(fragmentId: string, half: { x: number; y: number; z: number }): Group {
  const group = new Group();
  group.name = `rover-${fragmentId}`;
  const dark = paint(STYLE.dark, 0.8);
  if (fragmentId === 'frame') {
    part(
      rounded(half.x * 2, half.y * 1.2, half.z * 2, 0.06),
      paint(STYLE.steelDark, 0.5, 0.3),
      group,
      0,
      half.y * 0.3,
      0,
    );
    part(rounded(half.x * 2.05, 0.08, half.z * 2.05, 0.02), paint(STYLE.paintRed, 0.55), group, 0, half.y * 0.9, 0);
    for (const x of [-1, 1]) {
      for (const z of [-1, 1]) {
        const tire = part(
          new CylinderGeometry(0.3, 0.3, 0.22, 12),
          dark,
          group,
          x * (half.x - 0.2),
          -half.y + 0.3,
          z * (half.z + 0.08),
        );
        tire.rotation.x = Math.PI / 2;
        const hub = part(
          new CylinderGeometry(0.14, 0.14, 0.24, 8),
          paint(STYLE.steel, 0.4, 0.5),
          group,
          x * (half.x - 0.2),
          -half.y + 0.3,
          z * (half.z + 0.08),
        );
        hub.rotation.x = Math.PI / 2;
      }
    }
  } else if (fragmentId === 'cover') {
    part(rounded(half.x * 2, half.y * 2, half.z * 2, 0.02), paint(STYLE.aluminum, 0.5, 0.3), group);
    for (const x of [-0.6, 0.6])
      part(new CylinderGeometry(0.03, 0.03, 0.03, 6), dark, group, x * half.x, half.y, 0.6 * half.z);
  } else if (fragmentId === 'coil') {
    const mesh = new Mesh(scrapGeometry('copper', 0), scrapMaterial('copper'));
    mesh.scale.set(half.x * 2, half.y * 2, half.z * 2);
    group.add(mesh);
  } else if (fragmentId === 'side') {
    part(rounded(half.x * 2, half.y * 2, half.z * 2, 0.02), paint(STYLE.aluminum, 0.5, 0.3), group);
    part(rounded(half.x * 1.2, 0.05, 0.02, 0.01), paint(STYLE.paintBlue, 0.55), group, 0, half.y * 0.5, half.z + 0.005);
  } else {
    const mesh = new Mesh(scrapGeometry('ferrous', 1), scrapMaterial('ferrous'));
    mesh.scale.set(half.x * 2, half.y * 2, half.z * 2);
    group.add(mesh);
  }
  return group;
}

// ---------------------------------------------------------------------------------------------
// Environment pieces.

export function createRock(seed: number, scale: number): Mesh {
  const geometry = new DodecahedronGeometry(1, 0);
  const position = geometry.attributes['position'];
  if (position) {
    for (let i = 0; i < position.count; i += 1) {
      const n = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
      const jitter = 0.8 + (n - Math.floor(n)) * 0.35;
      position.setXYZ(i, position.getX(i) * jitter, position.getY(i) * jitter * 0.7, position.getZ(i) * jitter);
    }
  }
  geometry.computeVertexNormals();
  const rock = new Mesh(geometry, paint(seed % 2 === 0 ? STYLE.marsRock : STYLE.marsDark, 0.95));
  rock.scale.setScalar(scale);
  rock.castShadow = true;
  rock.receiveShadow = true;
  return rock;
}

/** Half-buried white station ring with yellow trim (station reveal anchor). */
export function createStationDome(radius: number): Group {
  const dome = new Group();
  dome.name = 'station-dome';
  const white = paint(STYLE.stationWhite, 0.55);
  const shell = part(new SphereGeometry(radius, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), white, dome);
  shell.scale.y = 0.6;
  for (let i = 0; i < 3; i += 1) {
    const band = part(
      new TorusGeometry(radius * (0.98 - i * 0.18), radius * 0.03, 4, 24),
      paint(i === 1 ? STYLE.paintYellow : STYLE.steelDark, 0.6),
      dome,
    );
    band.rotation.x = Math.PI / 2;
    band.position.y = radius * (0.08 + i * 0.16);
  }
  const door = part(
    rounded(radius * 0.5, radius * 0.4, radius * 0.2, 0.1),
    paint(STYLE.steelDark, 0.6),
    dome,
    0,
    radius * 0.2,
    radius * 0.85,
  );
  door.rotation.x = -0.1;
  return dome;
}

export function createColonyDome(radius: number): Group {
  const dome = new Group();
  const glass = new MeshStandardMaterial({
    color: '#dfe9ee',
    roughness: 0.15,
    metalness: 0.1,
    transparent: true,
    opacity: 0.8,
  });
  part(new SphereGeometry(radius, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), glass, dome);
  part(
    new CylinderGeometry(radius * 1.02, radius * 1.05, radius * 0.12, 14),
    paint(STYLE.stationWhite, 0.6),
    dome,
    0,
    radius * 0.06,
    0,
  );
  return dome;
}

/** Base intake hopper (gameplay concept sorting bay): dark frame, yellow funnel, orange rim and arrow. */
export function createIntakeHopperModel(): Group {
  const hopper = new Group();
  hopper.name = 'intake-hopper';
  const dark = paint(STYLE.dark, 0.8);
  const yellow = paint(STYLE.paintYellow, 0.55);
  part(rounded(1.8, 0.9, 1.8, 0.08), paint(STYLE.steelDark, 0.6, 0.2), hopper, 0, 0.45, 0);
  const funnel = part(new CylinderGeometry(1.35, 0.7, 0.9, 4, 1, true), yellow, hopper, 0, 1.35, 0);
  funnel.rotation.y = Math.PI / 4;
  (funnel.material as MeshStandardMaterial).side = 2;
  const rim = part(new TorusGeometry(1.0, 0.07, 4, 4), paint(STYLE.paintOrange, 0.5), hopper, 0, 1.8, 0);
  rim.rotation.set(Math.PI / 2, 0, Math.PI / 4);
  for (const x of [-0.85, 0.85]) {
    for (const z of [-0.85, 0.85]) part(rounded(0.16, 1.8, 0.16, 0.03), dark, hopper, x, 0.9, z);
  }
  const arrow = new Shape();
  arrow.moveTo(-0.18, 0.2);
  arrow.lineTo(0.18, 0.2);
  arrow.lineTo(0.18, 0);
  arrow.lineTo(0.32, 0);
  arrow.lineTo(0, -0.3);
  arrow.lineTo(-0.32, 0);
  arrow.lineTo(-0.18, 0);
  arrow.closePath();
  part(new ExtrudeGeometry(arrow, { depth: 0.04, bevelEnabled: false }), yellow, hopper, 0, 0.55, 0.91);
  return hopper;
}

// ---------------------------------------------------------------------------------------------
// Base machines (MSC-032/033): compactor fed by the intake, bales per material, and the sale machine.

/** Compactor: dark steel body, yellow frame and press head (named `press-head`), teal status lamp. */
export function createCompactorModel(): Group {
  const machine = new Group();
  machine.name = 'compactor';
  const yellow = paint(STYLE.paintYellow, 0.55);
  const dark = paint(STYLE.dark, 0.8);
  const steel = paint(STYLE.steel, 0.55, 0.3);
  part(rounded(1.6, 1.2, 1.4, 0.08), steel, machine, 0, 0.6, 0);
  for (const x of [-0.75, 0.75]) part(rounded(0.14, 2.1, 0.14, 0.03), yellow, machine, x, 1.05, -0.2);
  part(rounded(1.64, 0.16, 0.3, 0.04), yellow, machine, 0, 2.05, -0.2);
  const head = part(rounded(1.2, 0.35, 0.9, 0.06), yellow, machine, 0, 1.55, -0.1);
  head.name = 'press-head';
  part(rounded(0.24, 0.5, 0.24, 0.04), steel, machine, 0, 1.85, -0.1);
  for (let i = 0; i < 4; i += 1) {
    const stripe = part(
      rounded(0.12, 0.5, 0.02, 0.01),
      paint(STYLE.paintOrange, 0.5),
      machine,
      -0.45 + i * 0.3,
      0.6,
      0.71,
    );
    stripe.rotation.z = 0.5;
  }
  part(rounded(0.9, 0.5, 0.06, 0.04), dark, machine, 0, 0.35, 0.72);
  const lamp = part(
    new SphereGeometry(0.09, 10, 8),
    paint('#7ff0e2', 0.3, 0, STYLE.heliofoil),
    machine,
    0.6,
    1.35,
    0.68,
  );
  lamp.name = 'status-lamp';
  // Feed chute on the machine's right (+x): it reaches the intake when the front faces the yard.
  const chute = part(new CylinderGeometry(0.22, 0.28, 1.2, 8), dark, machine, 1.1, 1.2, 0);
  chute.rotation.z = -1.1;
  return machine;
}

/** Output pad the compactor drops bales onto: dark plate with a yellow border. */
export function createOutputPadModel(): Group {
  const pad = new Group();
  pad.name = 'output-pad';
  part(rounded(1.2, 0.06, 1.0, 0.02), paint(STYLE.paintYellow, 0.6), pad, 0, 0.03, 0);
  part(rounded(1.0, 0.07, 0.8, 0.02), paint(STYLE.dark, 0.85), pad, 0, 0.04, 0);
  return pad;
}

/**
 * One-material bale (PRD material table): pressed block in the material color with dark straps; copper is a
 * coil roll and polymer a rounded bundle. Sized to the collider half extents.
 */
export function createBaleModel(materialId: string, half: { x: number; y: number; z: number }): Group {
  const bale = new Group();
  bale.name = `bale-${materialId}`;
  const body = scrapMaterial(materialId).clone();
  const strap = paint(STYLE.dark, 0.8);
  if (materialId === 'copper') {
    const roll = part(new CylinderGeometry(half.y, half.y, half.x * 2, 14), body, bale);
    roll.rotation.z = Math.PI / 2;
    part(new CylinderGeometry(half.y * 0.35, half.y * 0.35, half.x * 2.02, 10), strap, bale).rotation.z = Math.PI / 2;
  } else {
    const radius = materialId === 'polymer' ? Math.min(half.x, half.y) * 0.45 : 0.03;
    part(rounded(half.x * 2, half.y * 2, half.z * 2, radius), body, bale);
  }
  for (const x of [-half.x * 0.5, half.x * 0.5]) {
    part(rounded(0.05, half.y * 2.04, half.z * 2.04, 0.01), strap, bale, x, 0, 0);
  }
  part(rounded(half.x * 0.6, half.y * 0.5, 0.02, 0.01), paint(STYLE.stationWhite, 0.6), bale, 0, 0, half.z + 0.012);
  return bale;
}

/** Sale machine: navy kiosk with a glowing teal screen, coin badge, yellow bale tray and orange button. */
export function createSaleTerminalModel(): Group {
  const kiosk = new Group();
  kiosk.name = 'sale-terminal';
  const navy = paint('#26304a', 0.6, 0.15);
  part(rounded(1.3, 1.9, 0.9, 0.1), navy, kiosk, 0, 0.95, 0);
  part(rounded(0.95, 0.6, 0.06, 0.05), paint('#7ff0e2', 0.3, 0, STYLE.heliofoil), kiosk, 0, 1.4, 0.46);
  const coin = part(
    new CylinderGeometry(0.16, 0.16, 0.05, 16),
    paint(STYLE.paintYellow, 0.4, 0.5),
    kiosk,
    0,
    2.05,
    0.2,
  );
  coin.rotation.x = Math.PI / 2;
  part(rounded(1.1, 0.12, 0.7, 0.03), paint(STYLE.paintYellow, 0.55), kiosk, 0, 0.62, 0.7);
  part(rounded(0.9, 0.3, 0.06, 0.03), paint(STYLE.dark, 0.85), kiosk, 0, 0.8, 0.46);
  part(new SphereGeometry(0.07, 10, 8), paint(STYLE.paintOrange, 0.4, 0, '#ff6a00'), kiosk, 0.45, 1.0, 0.47);
  return kiosk;
}

/** Named models for the review viewer. */
export const STYLED_MODEL_NAMES = [
  'magnet-tool',
  'cutter-tool',
  'cart',
  'scrap-set',
  'rover',
  'station-dome',
  'intake-hopper',
  'compactor',
  'sale-terminal',
  'bale-set',
] as const;
export type StyledModelName = (typeof STYLED_MODEL_NAMES)[number];

export function createStyledModel(name: StyledModelName): Object3D {
  switch (name) {
    case 'magnet-tool':
      return createMagnetToolModel();
    case 'cutter-tool':
      return createCutterToolModel();
    case 'cart':
      return createCartModel({ x: 0.6, y: 0.25, z: 0.45 });
    case 'station-dome':
      return createStationDome(3);
    case 'intake-hopper':
      return createIntakeHopperModel();
    case 'compactor':
      return createCompactorModel();
    case 'sale-terminal':
      return createSaleTerminalModel();
    case 'bale-set': {
      const group = new Group();
      Object.keys(SCRAP_COLORS).forEach((id, index) => {
        const bale = createBaleModel(id, { x: 0.3, y: 0.3, z: 0.3 });
        bale.position.set((index - 2.5) * 0.8, 0.3, 0);
        group.add(bale);
      });
      return group;
    }
    case 'rover': {
      const group = new Group();
      const layout: Record<string, { p: [number, number, number]; h: [number, number, number] }> = {
        frame: { p: [0, 0.4, 0], h: [0.9, 0.4, 0.6] },
        coil: { p: [-0.3, 0.95, 0], h: [0.15, 0.15, 0.15] },
        cover: { p: [0, 1.15, 0], h: [0.7, 0.05, 0.5] },
        side: { p: [0, 0.4, 0.65], h: [0.8, 0.35, 0.05] },
        bracket: { p: [0.4, 0.45, 0.75], h: [0.1, 0.1, 0.05] },
      };
      for (const [id, entry] of Object.entries(layout)) {
        const fragment = createRoverFragmentModel(id, { x: entry.h[0], y: entry.h[1], z: entry.h[2] });
        fragment.position.set(...entry.p);
        group.add(fragment);
      }
      return group;
    }
    case 'scrap-set': {
      const group = new Group();
      const ids = Object.keys(SCRAP_COLORS);
      ids.forEach((id, index) => {
        const variants = SCRAP_SHAPES[id]?.length ?? 1;
        for (let v = 0; v < variants; v += 1) {
          const mesh = createScrapMesh(id, v, { x: 0.35, y: 0.25, z: 0.35 });
          mesh.position.set((index - 2.5) * 0.5, 0.15 + v * 0.35, 0);
          group.add(mesh);
        }
      });
      return group;
    }
  }
}
