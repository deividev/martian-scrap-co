import {
  BoxGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  Quaternion,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type MeshStandardMaterial,
  type Object3D,
} from 'three';
import { mulberry32 } from '../simulation/benchmark/denseYardFixture';
import { SCRAP_COLORS, STYLE, paint, part, rounded, scrapGeometry, scrapMaterial } from './styledModels';

/**
 * Base machines, bales and the cart, rebuilt against the approved gameplay concept (sorting bay panel) and
 * the earlier stylized industrial anchor (press panel): chunky bevelled gunmetal frames with yellow trims and
 * bolts, cream sign plates with the material icon, blue-gray panels, hazard stripes, grated plates with yellow
 * edges, and material visibly piled or pressed inside. Decorative detail never changes the colliders.
 */

const GUNMETAL = '#4d5563';
const PANEL_BLUE = '#5b7aa6';
const CREAM = '#efe3cc';
const NAVY = '#26304a';

function bolts(parent: Object3D, points: readonly (readonly [number, number, number])[], size = 0.035): void {
  const material = paint(STYLE.steel, 0.35, 0.6);
  for (const [x, y, z] of points) {
    const bolt = part(new CylinderGeometry(size, size, 0.03, 6), material, parent, x, y, z);
    bolt.rotation.x = Math.PI / 2;
  }
}

function hazardStripes(parent: Object3D, width: number, height: number, x: number, y: number, z: number): void {
  part(rounded(width, height, 0.03, 0.01), paint(STYLE.paintYellow, 0.55), parent, x, y, z);
  const stripes = Math.max(2, Math.round(width / 0.22));
  for (let i = 0; i < stripes; i += 1) {
    const stripe = part(
      new BoxGeometry(0.07, height * 1.35, 0.01),
      paint(STYLE.dark, 0.8),
      parent,
      x - width / 2 + (i + 0.5) * (width / stripes),
      y,
      z + 0.018,
    );
    stripe.rotation.z = 0.6;
    stripe.scale.y = 0.75;
  }
}

/** Flat material icon for a sign plate: the material's own silhouette in its color (icon + color, not color alone). */
function materialIcon(materialId: string, size: number): Mesh {
  const icon = new Mesh(scrapGeometry(materialId, 0), paint(SCRAP_COLORS[materialId] ?? '#ffffff', 0.5));
  icon.scale.set(size, size, size * 0.25);
  return icon;
}

/** Grated metal plate with a yellow border (base floor tiles, output pad). */
export function createGratePlateModel(width: number, depth: number): Group {
  const plate = new Group();
  plate.name = 'grate-plate';
  part(rounded(width, 0.05, depth, 0.015), paint(STYLE.paintYellow, 0.6), plate, 0, 0.025, 0);
  part(rounded(width - 0.14, 0.06, depth - 0.14, 0.01), paint('#3a404b', 0.85, 0.2), plate, 0, 0.03, 0);
  const grid = paint('#262a32', 0.9);
  const step = 0.16;
  for (let x = -width / 2 + 0.14; x <= width / 2 - 0.14; x += step) {
    part(new BoxGeometry(0.02, 0.012, depth - 0.16), grid, plate, x, 0.065, 0);
  }
  for (let z = -depth / 2 + 0.14; z <= depth / 2 - 0.14; z += step) {
    part(new BoxGeometry(width - 0.16, 0.012, 0.02), grid, plate, 0, 0.066, z);
  }
  return plate;
}

// ---------------------------------------------------------------------------------------------
// Sorting bay (gameplay concept): one bay per material, sign plate with icon, material piled inside.

export interface SortingBayApi {
  /** Shows how full a material bay is (0–1) by piling more pieces inside. */
  setFill(materialId: string, ratio: number): void;
}

const BAY_WIDTH = 0.86;
const PILE_SLOTS = 30;

export function createSortingBayModel(materialIds: readonly string[]): Group & { userData: { bay: SortingBayApi } } {
  const bay = new Group() as Group & { userData: { bay: SortingBayApi } };
  bay.name = 'sorting-bay';
  const frame = paint(GUNMETAL, 0.6, 0.3);
  const yellow = paint(STYLE.paintYellow, 0.55);
  const dark = paint(STYLE.dark, 0.85);
  const width = materialIds.length * BAY_WIDTH;
  part(rounded(width + 0.2, 0.18, 1.0, 0.04), frame, bay, 0, 0.09, 0);
  part(rounded(width + 0.2, 1.5, 0.12, 0.04), frame, bay, 0, 0.9, -0.44);
  part(rounded(width + 0.3, 0.16, 1.06, 0.04), frame, bay, 0, 1.7, -0.02);
  part(rounded(width + 0.34, 0.06, 0.08, 0.02), yellow, bay, 0, 1.64, 0.5);
  const piles = new Map<string, InstancedMesh>();
  const random = mulberry32(11);
  const matrix = new Matrix4();
  const rotation = new Quaternion();
  const axis = new Vector3();
  materialIds.forEach((materialId, index) => {
    const x = -width / 2 + BAY_WIDTH * (index + 0.5);
    // Divider posts with a yellow cap, like the concept's chunky bay frames.
    for (const side of [-1, 1]) {
      part(rounded(0.1, 1.5, 0.95, 0.03), frame, bay, x + (side * BAY_WIDTH) / 2, 0.9, 0);
      part(rounded(0.12, 0.06, 0.97, 0.02), yellow, bay, x + (side * BAY_WIDTH) / 2, 0.5, 0);
    }
    part(rounded(BAY_WIDTH - 0.12, 0.08, 0.86, 0.02), dark, bay, x, 0.22, 0);
    // Cream sign plate with the material icon above each bay.
    part(rounded(BAY_WIDTH - 0.12, 0.42, 0.06, 0.05), paint(CREAM, 0.7), bay, x, 1.38, 0.45);
    const icon = materialIcon(materialId, 0.3);
    icon.position.set(x, 1.38, 0.5);
    bay.add(icon);
    bolts(bay, [
      [x - 0.3, 1.27, 0.47],
      [x + 0.3, 1.27, 0.47],
    ]);
    // Pile of this material inside the bay; the instance count follows the bin fill.
    const pile = new InstancedMesh(scrapGeometry(materialId, index), scrapMaterial(materialId), PILE_SLOTS);
    for (let slot = 0; slot < PILE_SLOTS; slot += 1) {
      const layer = Math.floor(slot / 7);
      const spread = 0.32 - layer * 0.05;
      const size = 0.2 + random() * 0.08;
      axis.set(random() - 0.5, random() - 0.5, random() - 0.5).normalize();
      rotation.setFromAxisAngle(axis, random() * Math.PI);
      matrix.compose(
        new Vector3(x + (random() - 0.5) * spread * 2, 0.34 + layer * 0.15, (random() - 0.5) * spread * 2 + 0.05),
        rotation,
        new Vector3(size, size * 0.8, size),
      );
      pile.setMatrixAt(slot, matrix);
    }
    pile.count = 0;
    pile.castShadow = true;
    bay.add(pile);
    piles.set(materialId, pile);
  });
  hazardStripes(bay, width + 0.2, 0.12, 0, 0.12, 0.5);
  bay.userData.bay = {
    setFill(materialId, ratio) {
      const pile = piles.get(materialId);
      if (pile) pile.count = Math.round(Math.min(1, Math.max(0, ratio)) * PILE_SLOTS);
    },
  };
  return bay;
}

// ---------------------------------------------------------------------------------------------
// Intake hopper: where the container is unloaded; feeds the sorting bay through a short conveyor.

export function createIntakeHopperModel(): Group {
  const hopper = new Group();
  hopper.name = 'intake-hopper';
  const frame = paint(GUNMETAL, 0.6, 0.3);
  const yellow = paint(STYLE.paintYellow, 0.55);
  const dark = paint(STYLE.dark, 0.85);
  part(rounded(1.8, 0.9, 1.8, 0.1), frame, hopper, 0, 0.45, 0);
  hazardStripes(hopper, 1.6, 0.16, 0, 0.62, 0.91);
  for (const x of [-0.82, 0.82]) {
    for (const z of [-0.82, 0.82]) {
      part(rounded(0.2, 1.75, 0.2, 0.05), yellow, hopper, x, 0.9, z);
      bolts(hopper, [[x, 1.5, z + 0.11]]);
    }
  }
  const funnel = part(new CylinderGeometry(1.25, 0.6, 0.85, 4, 1, true), yellow, hopper, 0, 1.4, 0);
  funnel.rotation.y = Math.PI / 4;
  (funnel.material as MeshStandardMaterial).side = 2;
  part(new CylinderGeometry(0.62, 0.62, 0.06, 4), dark, hopper, 0, 0.98, 0).rotation.y = Math.PI / 4;
  const rim = part(new TorusGeometry(0.9, 0.08, 4, 4), paint(STYLE.paintOrange, 0.5), hopper, 0, 1.82, 0);
  rim.rotation.set(Math.PI / 2, 0, Math.PI / 4);
  // Down arrow on a cream plate: "unload here".
  part(rounded(0.62, 0.42, 0.05, 0.04), paint(CREAM, 0.7), hopper, 0, 1.2, 0.93);
  const arrow = new Shape();
  arrow.moveTo(-0.08, 0.14);
  arrow.lineTo(0.08, 0.14);
  arrow.lineTo(0.08, 0);
  arrow.lineTo(0.16, 0);
  arrow.lineTo(0, -0.15);
  arrow.lineTo(-0.16, 0);
  arrow.lineTo(-0.08, 0);
  arrow.closePath();
  part(
    new ExtrudeGeometry(arrow, { depth: 0.03, bevelEnabled: false }),
    paint(STYLE.paintOrange, 0.5),
    hopper,
    0,
    1.2,
    0.95,
  );
  // Conveyor on the hopper's right (+x): it reaches the sorting bay when the hopper faces the yard.
  const belt = part(rounded(1.3, 0.12, 0.6, 0.04), dark, hopper, 1.45, 0.75, 0);
  belt.rotation.z = 0.12;
  for (let i = 0; i < 4; i += 1) {
    const roller = part(
      new CylinderGeometry(0.06, 0.06, 0.64, 8),
      paint(STYLE.steel, 0.4, 0.5),
      hopper,
      0.95 + i * 0.32,
      0.7 + i * 0.04,
      0,
    );
    roller.rotation.x = Math.PI / 2;
  }
  part(rounded(0.12, 0.7, 0.12, 0.03), frame, hopper, 1.9, 0.35, 0.22);
  part(rounded(0.12, 0.7, 0.12, 0.03), frame, hopper, 1.9, 0.35, -0.22);
  return hopper;
}

// ---------------------------------------------------------------------------------------------
// Compactor press (stylized press panel): yellow pillars, blue-gray panels, heavy steel plate, control box.

export function createCompactorModel(): Group {
  const machine = new Group();
  machine.name = 'compactor';
  const frame = paint(GUNMETAL, 0.6, 0.3);
  const yellow = paint(STYLE.paintYellow, 0.55);
  const blue = paint(PANEL_BLUE, 0.6, 0.15);
  const steel = paint(STYLE.steel, 0.4, 0.55);
  const dark = paint(STYLE.dark, 0.85);
  // Base and chamber.
  part(rounded(1.7, 0.3, 1.5, 0.06), frame, machine, 0, 0.15, 0);
  part(rounded(1.5, 0.95, 1.3, 0.06), blue, machine, 0, 0.75, -0.05);
  part(rounded(1.1, 0.7, 0.1, 0.03), dark, machine, 0, 0.72, 0.6);
  // Yellow pillars and crossbeam with bolts.
  for (const x of [-0.8, 0.8]) {
    part(rounded(0.24, 2.3, 0.32, 0.05), yellow, machine, x, 1.15, 0);
    bolts(machine, [
      [x, 0.4, 0.17],
      [x, 1.0, 0.17],
      [x, 1.6, 0.17],
      [x, 2.15, 0.17],
    ]);
  }
  part(rounded(1.9, 0.32, 0.5, 0.06), yellow, machine, 0, 2.38, 0);
  part(rounded(0.4, 0.5, 0.4, 0.05), frame, machine, 0, 2.6, 0);
  // Ram and press plate (named so the scene can animate it).
  const head = new Group();
  head.name = 'press-head';
  head.position.set(0, 1.62, -0.02);
  part(new CylinderGeometry(0.11, 0.11, 0.7, 10), steel, head, 0, 0.45, 0);
  part(rounded(1.2, 0.22, 1.0, 0.04), steel, head, 0, 0, 0);
  part(rounded(1.26, 0.06, 1.06, 0.02), dark, head, 0, -0.12, 0);
  machine.add(head);
  // Front hazard band and side control box with a red lever knob.
  hazardStripes(machine, 1.5, 0.14, 0, 0.36, 0.76);
  const box = new Group();
  box.position.set(1.08, 0.75, 0.25);
  part(rounded(0.36, 0.6, 0.36, 0.05), blue, box);
  part(rounded(0.3, 0.08, 0.3, 0.02), yellow, box, 0, 0.32, 0);
  const lever = part(new CylinderGeometry(0.025, 0.025, 0.32, 6), steel, box, 0, 0.5, 0.05);
  lever.rotation.x = -0.3;
  part(new SphereGeometry(0.06, 10, 8), paint(STYLE.paintRed, 0.4), box, 0, 0.66, 0.1);
  machine.add(box);
  // Beacon lamp on top (named for state color).
  part(new CylinderGeometry(0.09, 0.11, 0.08, 10), dark, machine, 0, 2.89, 0);
  const lamp = part(new SphereGeometry(0.1, 12, 8), paint('#7ff0e2', 0.3, 0, STYLE.heliofoil), machine, 0, 2.98, 0);
  lamp.name = 'status-lamp';
  // Feed chute from the intake side (+x when the front faces the yard).
  const chute = part(rounded(0.9, 0.16, 0.5, 0.04), frame, machine, -1.15, 1.05, -0.1);
  chute.rotation.z = -0.35;
  return machine;
}

/** Output deck: grated plate on a yellow frame where bales come out. */
export function createOutputPadModel(): Group {
  const pad = createGratePlateModel(1.3, 1.1);
  pad.name = 'output-pad';
  for (const x of [-0.5, 0.5]) {
    const roller = part(new CylinderGeometry(0.05, 0.05, 1.0, 8), paint(STYLE.steel, 0.4, 0.5), pad, x, 0.09, 0);
    roller.rotation.x = Math.PI / 2;
  }
  return pad;
}

// ---------------------------------------------------------------------------------------------
// Bale (gameplay concept): a cube of visibly pressed pieces of one material, strapped, on a yellow pallet.

export function createBaleModel(materialId: string, half: { x: number; y: number; z: number }): Group {
  const bale = new Group();
  bale.name = `bale-${materialId}`;
  const palletHeight = half.y * 0.28;
  const cube = { x: half.x * 0.94, y: half.y - palletHeight / 2, z: half.z * 0.94 };
  const cubeY = -half.y + palletHeight + cube.y;
  // Pallet slats.
  const yellow = paint(STYLE.paintYellow, 0.6);
  for (const z of [-half.z * 0.7, 0, half.z * 0.7]) {
    part(
      rounded(half.x * 2, palletHeight * 0.45, half.z * 0.42, 0.01),
      yellow,
      bale,
      0,
      -half.y + palletHeight * 0.78,
      z,
    );
  }
  for (const x of [-half.x * 0.8, 0, half.x * 0.8]) {
    part(
      rounded(half.x * 0.3, palletHeight * 0.55, half.z * 2, 0.01),
      yellow,
      bale,
      x,
      -half.y + palletHeight * 0.28,
      0,
    );
  }
  // Core block plus pressed pieces on every face.
  part(rounded(cube.x * 2, cube.y * 2, cube.z * 2, 0.03), scrapMaterial(materialId), bale, 0, cubeY, 0);
  // Pressed pieces laid in a tight grid on each face, turned only about the face normal (a mosaic, not spikes).
  const random = mulberry32(materialId.length * 97);
  const grid = 3;
  const pieces = new InstancedMesh(scrapGeometry(materialId, 0), scrapMaterial(materialId), grid * grid * 5);
  const matrix = new Matrix4();
  const rotation = new Quaternion();
  const turn = new Quaternion();
  const cell = { x: (cube.x * 2) / grid, y: (cube.y * 2) / grid, z: (cube.z * 2) / grid };
  const faces = [
    { normal: new Vector3(1, 0, 0), u: 'z', v: 'y' },
    { normal: new Vector3(-1, 0, 0), u: 'z', v: 'y' },
    { normal: new Vector3(0, 0, 1), u: 'x', v: 'y' },
    { normal: new Vector3(0, 0, -1), u: 'x', v: 'y' },
    { normal: new Vector3(0, 1, 0), u: 'x', v: 'z' },
  ] as const;
  let index = 0;
  for (const face of faces) {
    rotation.setFromUnitVectors(new Vector3(0, 1, 0), face.normal);
    for (let i = 0; i < grid; i += 1) {
      for (let j = 0; j < grid; j += 1) {
        const position = new Vector3(face.normal.x * cube.x, cubeY + face.normal.y * cube.y, face.normal.z * cube.z);
        const du = -1 + (2 * i + 1) / grid;
        const dv = -1 + (2 * j + 1) / grid;
        position[face.u] += du * cube[face.u] * 0.92;
        if (face.v === 'y') position.y += dv * cube.y * 0.92;
        else position[face.v] += dv * cube[face.v] * 0.92;
        turn.setFromAxisAngle(face.normal, random() * Math.PI);
        const size = Math.min(cell.x, cell.y, cell.z) * 0.95;
        matrix.compose(position, turn.clone().multiply(rotation), new Vector3(size, size * 0.45, size));
        pieces.setMatrixAt(index, matrix);
        index += 1;
      }
    }
  }
  pieces.castShadow = true;
  bale.add(pieces);
  // Dark straps around the block.
  const strap = paint(STYLE.dark, 0.8);
  for (const x of [-cube.x * 0.5, cube.x * 0.5]) {
    part(rounded(0.04, cube.y * 2.06, cube.z * 2.06, 0.01), strap, bale, x, cubeY, 0);
  }
  return bale;
}

// ---------------------------------------------------------------------------------------------
// Sale machine: navy and yellow kiosk with a glowing credit screen and a roller intake for bales.

export function createSaleTerminalModel(): Group {
  const kiosk = new Group();
  kiosk.name = 'sale-terminal';
  const navy = paint(NAVY, 0.6, 0.15);
  const yellow = paint(STYLE.paintYellow, 0.55);
  const dark = paint(STYLE.dark, 0.85);
  part(rounded(1.5, 0.2, 1.1, 0.05), paint(GUNMETAL, 0.6, 0.3), kiosk, 0, 0.1, 0);
  part(rounded(1.3, 1.9, 0.85, 0.12), navy, kiosk, 0, 1.15, -0.05);
  for (const x of [-0.68, 0.68]) {
    part(rounded(0.1, 2.0, 0.92, 0.04), navy, kiosk, x, 1.2, -0.05);
    part(rounded(0.12, 2.0, 0.08, 0.03), yellow, kiosk, x, 1.2, 0.42);
  }
  part(rounded(1.5, 0.18, 0.95, 0.05), yellow, kiosk, 0, 2.2, -0.05);
  // Screen with a big coin (credits).
  part(rounded(0.95, 0.62, 0.05, 0.05), paint('#163a44', 0.4), kiosk, 0, 1.55, 0.39);
  part(rounded(0.85, 0.52, 0.02, 0.04), paint('#7ff0e2', 0.3, 0, STYLE.heliofoil), kiosk, 0, 1.55, 0.42);
  const coin = part(
    new CylinderGeometry(0.16, 0.16, 0.03, 18),
    paint(STYLE.paintYellow, 0.35, 0.4, '#f2b21c'),
    kiosk,
    0,
    1.55,
    0.44,
  );
  coin.rotation.x = Math.PI / 2;
  // Roller intake for the bale.
  part(rounded(1.2, 0.12, 0.6, 0.03), dark, kiosk, 0, 0.72, 0.62);
  for (let i = 0; i < 4; i += 1) {
    const roller = part(
      new CylinderGeometry(0.05, 0.05, 1.05, 8),
      paint(STYLE.steel, 0.4, 0.5),
      kiosk,
      0,
      0.8,
      0.4 + i * 0.15,
    );
    roller.rotation.z = Math.PI / 2;
  }
  part(rounded(1.0, 0.45, 0.06, 0.04), dark, kiosk, 0, 0.98, 0.38);
  hazardStripes(kiosk, 1.3, 0.12, 0, 0.3, 0.42);
  // Big orange button, coin badge on top, beacon.
  part(
    new CylinderGeometry(0.09, 0.09, 0.06, 12),
    paint(STYLE.paintOrange, 0.4, 0, '#ff6a00'),
    kiosk,
    0.45,
    1.05,
    0.42,
  ).rotation.x = Math.PI / 2;
  part(new CylinderGeometry(0.04, 0.04, 0.3, 8), paint(STYLE.dark, 0.8), kiosk, 0, 2.38, 0);
  const badge = part(
    new CylinderGeometry(0.22, 0.22, 0.06, 18),
    paint(STYLE.paintYellow, 0.35, 0.4),
    kiosk,
    0,
    2.55,
    0,
  );
  badge.rotation.x = Math.PI / 2;
  part(new TorusGeometry(0.15, 0.025, 6, 18), paint('#c98a08', 0.4, 0.3), kiosk, 0, 2.55, 0.035);
  return kiosk;
}

// ---------------------------------------------------------------------------------------------
// Cart (gameplay concept): yellow tub with a dark chunky rim, corner bumpers, ribbed sides, hub wheels.

export function createCartModel(half: { x: number; y: number; z: number }): Group {
  const cart = new Group();
  cart.name = 'cart';
  const yellow = paint(STYLE.paintYellow, 0.55);
  const dark = paint(STYLE.dark, 0.8);
  const hub = paint(STYLE.steel, 0.4, 0.5);
  const w = half.x * 2;
  const d = half.z * 2;
  const wallH = half.y * 1.4;
  part(rounded(w * 0.96, 0.1, d * 0.96, 0.03), dark, cart, 0, -half.y + 0.14, 0);
  // Tub walls, slightly flared, with vertical ribs.
  for (const side of [-1, 1]) {
    part(rounded(w, wallH, 0.08, 0.03), yellow, cart, 0, 0.02, side * (half.z - 0.04));
    part(rounded(0.08, wallH, d, 0.03), yellow, cart, side * (half.x - 0.04), 0.02, 0);
    for (const x of [-w * 0.3, 0, w * 0.3]) {
      part(rounded(0.06, wallH * 0.8, 0.05, 0.015), yellow, cart, x, 0, side * (half.z + 0.005));
    }
  }
  // Chunky dark rim and corner bumpers.
  for (const side of [-1, 1]) {
    part(rounded(w + 0.08, 0.09, 0.13, 0.03), dark, cart, 0, wallH / 2 + 0.03, side * half.z);
    part(rounded(0.13, 0.09, d + 0.08, 0.03), dark, cart, side * half.x, wallH / 2 + 0.03, 0);
  }
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      part(rounded(0.14, wallH + 0.06, 0.14, 0.04), dark, cart, x * half.x, 0.02, z * half.z);
      const wheel = part(
        new CylinderGeometry(0.15, 0.15, 0.1, 14),
        dark,
        cart,
        x * (half.x - 0.14),
        -half.y,
        z * (half.z - 0.1),
      );
      wheel.rotation.z = Math.PI / 2;
      const cap = part(
        new CylinderGeometry(0.07, 0.07, 0.11, 10),
        hub,
        cart,
        x * (half.x - 0.14),
        -half.y,
        z * (half.z - 0.1),
      );
      cap.rotation.z = Math.PI / 2;
    }
  }
  // Push handle with grips.
  const handle = part(new CylinderGeometry(0.03, 0.03, w * 0.85, 8), dark, cart, 0, wallH / 2 + 0.28, half.z + 0.24);
  handle.rotation.z = Math.PI / 2;
  for (const x of [-1, 1]) {
    // Side bar from the rim up and back to the handle.
    const bar = part(
      new CylinderGeometry(0.025, 0.025, 0.36, 6),
      dark,
      cart,
      x * w * 0.4,
      wallH / 2 + 0.16,
      half.z + 0.12,
    );
    bar.rotation.x = Math.PI / 4;
    part(
      rounded(0.1, 0.07, 0.07, 0.02),
      paint(STYLE.paintOrange, 0.5),
      cart,
      x * w * 0.3,
      wallH / 2 + 0.28,
      half.z + 0.24,
    );
  }
  return cart;
}

export const MACHINE_MODEL_NAMES = [
  'intake-hopper',
  'sorting-bay',
  'compactor',
  'sale-terminal',
  'bale-set',
  'cart',
  'output-pad',
] as const;
export type MachineModelName = (typeof MACHINE_MODEL_NAMES)[number];

export function createMachineModel(name: MachineModelName): Object3D {
  switch (name) {
    case 'intake-hopper':
      return createIntakeHopperModel();
    case 'sorting-bay': {
      const materials = Object.keys(SCRAP_COLORS);
      const bay = createSortingBayModel(materials);
      materials.forEach((id, index) => bay.userData.bay.setFill(id, (index + 1) / materials.length));
      return bay;
    }
    case 'compactor':
      return createCompactorModel();
    case 'sale-terminal':
      return createSaleTerminalModel();
    case 'cart':
      return createCartModel({ x: 0.6, y: 0.25, z: 0.45 });
    case 'output-pad':
      return createOutputPadModel();
    case 'bale-set': {
      const group = new Group();
      Object.keys(SCRAP_COLORS).forEach((id, index) => {
        const bale = createBaleModel(id, { x: 0.32, y: 0.36, z: 0.32 });
        bale.position.set((index - 2.5) * 0.85, 0.36, 0);
        group.add(bale);
      });
      return group;
    }
  }
}
