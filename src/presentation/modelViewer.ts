import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector3,
  WebGLRenderer,
  type Object3D,
} from 'three';
import { createRobotModel, type RobotColor } from '../models/generated/createRobotModel';
import { MACHINE_MODEL_NAMES, createMachineModel, type MachineModelName } from '../models/machineModels';
import { createStyledModel, STYLED_MODEL_NAMES, type StyledModelName } from '../models/styledModels';

/** Review views used by the sculpt comparison sheets (front, side, three-quarter, back). */
const VIEWS: Readonly<Record<string, number>> = {
  front: 0,
  side: Math.PI / 2,
  'three-quarter': Math.PI / 5,
  back: Math.PI,
  /** Three-quarter from above, like the concept's base views. */
  hero: Math.PI / 5,
};

export function modelForName(name: string, color: string): Object3D | null {
  if (name === 'robot') return createRobotModel((color as RobotColor) || 'orange');
  if ((STYLED_MODEL_NAMES as readonly string[]).includes(name)) return createStyledModel(name as StyledModelName);
  if ((MACHINE_MODEL_NAMES as readonly string[]).includes(name)) return createMachineModel(name as MachineModelName);
  return null;
}

/**
 * Model review viewer (dev/review only): renders one model on a warm studio background similar to the
 * concept sheets, from a named view, so renders can be compared side by side with the references.
 */
export function renderModelView(canvas: HTMLCanvasElement, name: string, view: string, color: string): void {
  const model = modelForName(name, color);
  if (!model) throw new Error(`Unknown model ${name}`);
  const renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.shadowMap.enabled = true;

  const scene = new Scene();
  scene.background = new Color('#f2d3c0');
  scene.add(new HemisphereLight('#fff4e8', '#c8643c', 1.1));
  scene.add(new AmbientLight('#ffffff', 0.25));
  const key = new DirectionalLight('#fff1dc', 2.2);
  key.position.set(2.5, 4, 3.5);
  key.castShadow = true;
  scene.add(key);
  const ground = new Mesh(new PlaneGeometry(20, 20), new MeshStandardMaterial({ color: '#d8643a', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  model.rotation.y = -(VIEWS[view] ?? 0);
  scene.add(model);
  // Stand the model on the ground (some models are centered on their collider, like the cart).
  const lowest = new Box3().setFromObject(model).min.y;
  if (lowest < 0) model.position.y -= lowest;
  const box = new Box3().setFromObject(model);
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  const camera = new PerspectiveCamera(30, canvas.clientWidth / Math.max(canvas.clientHeight, 1), 0.05, 100);
  const distance = (Math.max(size.y, size.x) / (2 * Math.tan((30 * Math.PI) / 360))) * 1.25;
  const lift = view === 'hero' ? distance * 0.45 : size.y * 0.05;
  camera.position.set(center.x, center.y + lift, center.z + distance);
  camera.lookAt(center);
  renderer.render(scene, camera);
  canvas.dataset['modelRendered'] = `${name}:${view}`;
}
