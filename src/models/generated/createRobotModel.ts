import {
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  RingGeometry,
  Shape,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * Rounded recycling robot (approved character anchor: references/scrap-magnet-mars-character-concepts.png).
 * Same body for every crew color; color is never a class. Proportions measured from the front reference:
 * head ≈ 31 % of height and slightly wider than the barrel torso, short dark limbs, big dark feet.
 * Faces +Z. Origin at the feet. Total height ≈ 1.6 m to match the player capsule.
 * Stylized reconstruction: hidden back/side details are inferred from the side view.
 */
export type RobotColor = 'orange' | 'teal' | 'yellow' | 'purple';
export type RobotExpression = 'happy' | 'neutral' | 'surprised' | 'focused';

export const ROBOT_PALETTES: Readonly<Record<RobotColor, string>> = {
  orange: '#f07a1e',
  teal: '#1f9e95',
  yellow: '#f2b21c',
  purple: '#7a55c9',
};

const DARK = '#2b2e35';
const SCREEN = '#101218';
const EYE = '#fbf6ea';
const BEACON = '#ffb11a';
const EMBLEM = '#f6e9dc';

export interface RobotRuntime {
  readonly pivots: Readonly<
    Record<'hips' | 'neck' | 'head' | 'shoulderL' | 'shoulderR' | 'elbowL' | 'elbowR' | 'legL' | 'legR', Object3D>
  >;
  readonly sockets: Readonly<Record<'handL' | 'handR' | 'carry' | 'beacon' | 'firstPersonTool', Object3D>>;
  /** Capsule matching the player collider (PLAYER_TUNING radius/halfHeight), centered above the feet. */
  readonly collider: {
    readonly kind: 'capsule';
    readonly radius: number;
    readonly halfHeight: number;
    readonly centerY: number;
  };
  setExpression(expression: RobotExpression): void;
}

function roundedBox(width: number, height: number, depth: number, radius: number): BufferGeometry {
  return new RoundedBoxGeometry(width, height, depth, 2, radius);
}

function roundedRectShape(width: number, height: number, radius: number): Shape {
  const x = -width / 2;
  const y = -height / 2;
  const shape = new Shape();
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  return shape;
}

function pivot(name: string, parent: Object3D, x: number, y: number, z: number): Object3D {
  const node = new Object3D();
  node.name = name;
  node.position.set(x, y, z);
  parent.add(node);
  return node;
}

function mesh(name: string, geometry: BufferGeometry, material: MeshStandardMaterial, parent: Object3D): Mesh {
  const part = new Mesh(geometry, material);
  part.name = name;
  part.castShadow = true;
  part.receiveShadow = true;
  parent.add(part);
  return part;
}

export function createRobotModel(color: RobotColor = 'orange'): Group & { userData: { sculptRuntime: RobotRuntime } } {
  const shell = new MeshStandardMaterial({
    color: ROBOT_PALETTES[color],
    roughness: 0.55,
    metalness: 0.05,
    flatShading: true,
  });
  const dark = new MeshStandardMaterial({ color: DARK, roughness: 0.75, flatShading: true });
  const screen = new MeshStandardMaterial({ color: SCREEN, roughness: 0.18, metalness: 0.2 });
  const eye = new MeshStandardMaterial({ color: EYE, emissive: EYE, emissiveIntensity: 0.9, roughness: 0.4 });
  const beacon = new MeshStandardMaterial({ color: BEACON, emissive: BEACON, emissiveIntensity: 0.8, roughness: 0.3 });
  const emblem = new MeshStandardMaterial({ color: EMBLEM, roughness: 0.6 });

  const root = new Group() as Group & { userData: { sculptRuntime: RobotRuntime } };
  root.name = `robot-${color}`;

  // Legs and feet: short dark columns, wide chamfered feet with a thin shell-color ankle band.
  const legs = { legL: 0, legR: 0 } as Record<'legL' | 'legR', Object3D | number>;
  for (const side of [-1, 1] as const) {
    const legPivot = pivot(side < 0 ? 'legL' : 'legR', root, side * 0.15, 0.36, 0);
    mesh('leg', roundedBox(0.2, 0.2, 0.2, 0.04), dark, legPivot).position.y = -0.1;
    const foot = mesh('foot', roundedBox(0.27, 0.14, 0.34, 0.04), dark, legPivot);
    foot.position.set(side * 0.01, -0.29, 0.03);
    const band = mesh('ankleBand', roundedBox(0.2, 0.035, 0.22, 0.01), shell, legPivot);
    band.position.set(side * 0.01, -0.2, 0.02);
    legs[side < 0 ? 'legL' : 'legR'] = legPivot;
  }

  // Torso: rounded barrel block with a seam, chest hexagon emblem and dark hip skirt.
  const hips = pivot('hips', root, 0, 0.36, 0);
  mesh('hipSkirt', roundedBox(0.52, 0.1, 0.42, 0.04), dark, hips).position.y = 0.03;
  const torso = mesh('torso', roundedBox(0.72, 0.6, 0.56, 0.12), shell, hips);
  torso.position.y = 0.35;
  const seam = mesh('torsoSeam', roundedBox(0.725, 0.014, 0.565, 0.007), dark, hips);
  seam.position.y = 0.17;
  const hexagon = mesh('chestEmblem', new RingGeometry(0.055, 0.115, 6, 1), emblem, hips);
  hexagon.position.set(0, 0.41, 0.282);
  hexagon.rotation.z = Math.PI / 6;

  // Head: wide rounded box on a short dark neck, inset glossy screen, ear discs and amber beacon.
  const neck = pivot('neck', hips, 0, 0.65, 0);
  mesh('neckCollar', new CylinderGeometry(0.15, 0.17, 0.07, 12), dark, neck).position.y = 0.02;
  const head = pivot('head', neck, 0, 0.05, 0);
  const headShell = mesh('headShell', roundedBox(0.8, 0.52, 0.6, 0.1), shell, head);
  headShell.position.y = 0.26;
  const screenGeometry = new ExtrudeGeometry(roundedRectShape(0.62, 0.36, 0.07), {
    depth: 0.02,
    bevelEnabled: false,
  });
  const faceScreen = mesh('faceScreen', screenGeometry, screen, head);
  faceScreen.position.set(0, 0.26, 0.29);
  for (const side of [-1, 1] as const) {
    const ear = mesh('earDisc', new CylinderGeometry(0.075, 0.075, 0.07, 14), dark, head);
    ear.rotation.z = Math.PI / 2;
    ear.position.set(side * 0.42, 0.26, 0);
  }
  const beaconCollar = mesh('beaconCollar', new CylinderGeometry(0.07, 0.08, 0.05, 12), dark, head);
  beaconCollar.position.y = 0.545;
  const beaconSocket = pivot('beaconSocket', head, 0, 0.57, 0);
  mesh('beaconBody', new CylinderGeometry(0.07, 0.075, 0.07, 12), beacon, beaconSocket).position.y = 0.035;
  mesh('beaconDome', new SphereGeometry(0.07, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), beacon, beaconSocket).position.y =
    0.07;

  // Expressions live on the screen as simple emissive shapes (cheap and readable without bloom).
  const faces = new Map<RobotExpression, Object3D>();
  const faceRoot = pivot('faceFeatures', head, 0, 0.27, 0.315);
  const eyeArc = (): BufferGeometry => new TorusGeometry(0.085, 0.03, 6, 16, Math.PI);
  const happy = pivot('face-happy', faceRoot, 0, 0, 0);
  for (const side of [-1, 1]) mesh('eye', eyeArc(), eye, happy).position.set(side * 0.14, -0.01, 0);
  const neutral = pivot('face-neutral', faceRoot, 0, 0, 0);
  for (const side of [-1, 1]) {
    const dot = mesh('eye', new CylinderGeometry(0.055, 0.055, 0.01, 16), eye, neutral);
    dot.rotation.x = Math.PI / 2;
    dot.position.set(side * 0.13, 0, 0);
  }
  const surprised = pivot('face-surprised', faceRoot, 0, 0, 0);
  for (const side of [-1, 1])
    mesh('eye', new TorusGeometry(0.06, 0.02, 6, 16), eye, surprised).position.set(side * 0.13, 0, 0);
  const focused = pivot('face-focused', faceRoot, 0, 0, 0);
  for (const side of [-1, 1]) {
    const lid = mesh('eye', roundedBox(0.13, 0.035, 0.01, 0.01), eye, focused);
    lid.position.set(side * 0.13, 0, 0);
    lid.rotation.z = side * -0.25;
  }
  faces.set('happy', happy).set('neutral', neutral).set('surprised', surprised).set('focused', focused);

  // Arms: dark ball shoulders, short dark upper arms, shell-color forearm cuffs, dark claw grippers.
  const arm = (side: -1 | 1) => {
    const shoulder = pivot(side < 0 ? 'shoulderL' : 'shoulderR', hips, side * 0.44, 0.52, 0);
    mesh('shoulderBall', new SphereGeometry(0.12, 12, 8), dark, shoulder);
    const upper = mesh('upperArm', roundedBox(0.17, 0.18, 0.17, 0.05), dark, shoulder);
    upper.position.set(side * 0.03, -0.12, 0);
    const elbow = pivot(side < 0 ? 'elbowL' : 'elbowR', shoulder, side * 0.04, -0.22, 0);
    const forearm = mesh('forearm', roundedBox(0.23, 0.24, 0.23, 0.06), shell, elbow);
    forearm.position.y = -0.07;
    const hand = pivot(side < 0 ? 'handL' : 'handR', elbow, 0, -0.24, 0.02);
    mesh('palm', roundedBox(0.19, 0.11, 0.18, 0.04), dark, hand);
    // Chunky C-shaped claw: a thick curved finger hooking around a stubby thumb.
    const finger = mesh('clawFinger', new TorusGeometry(0.075, 0.042, 6, 10, Math.PI * 1.25), dark, hand);
    finger.rotation.set(0, Math.PI / 2, side < 0 ? Math.PI * 0.62 : Math.PI * 0.12);
    finger.position.set(side * 0.02, -0.12, 0);
    const thumb = mesh('clawThumb', roundedBox(0.07, 0.1, 0.12, 0.03), dark, hand);
    thumb.position.set(-side * 0.065, -0.1, 0.01);
    shoulder.rotation.z = side * 0.1;
    elbow.rotation.x = -0.15;
    return { shoulder, elbow, hand };
  };
  const left = arm(-1);
  const right = arm(1);

  const carry = pivot('carrySocket', hips, 0, 0.3, 0.45);
  const firstPersonTool = pivot('firstPersonToolSocket', right.hand, 0, -0.05, 0.08);

  const runtime: RobotRuntime = {
    pivots: {
      hips,
      neck,
      head,
      shoulderL: left.shoulder,
      shoulderR: right.shoulder,
      elbowL: left.elbow,
      elbowR: right.elbow,
      legL: legs.legL as Object3D,
      legR: legs.legR as Object3D,
    },
    sockets: { handL: left.hand, handR: right.hand, carry, beacon: beaconSocket, firstPersonTool },
    collider: { kind: 'capsule', radius: 0.35, halfHeight: 0.45, centerY: 0.8 },
    setExpression(expression) {
      for (const [name, node] of faces) node.visible = name === expression;
    },
  };
  runtime.setExpression('happy');
  root.userData.sculptRuntime = runtime;
  return root;
}
