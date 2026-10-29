import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Euler,
  Fog,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  TextureLoader,
  WebGLRenderer,
} from 'three';
import checkerUrl from '../assets/textures/smoke-checker.png';
import { mergeFrames, type InputDevice } from '../input/actions';
import { GamepadSource } from '../input/gamepadSource';
import { DEFAULT_INPUT_SETTINGS } from '../input/inputSettings';
import { KeyboardMouseSource } from '../input/keyboardMouseSource';
import { PHYSICS_CONVENTIONS } from '../simulation/physics/conventions';
import type { PhysicsBodyHandle } from '../simulation/physics/physicsPort';
import { runPhysicsProbe } from '../simulation/physics/probe';
import { createRapierWorld } from '../simulation/physics/rapierWorld';
import { PlayerController } from '../simulation/player/playerController';
import { TEST_YARD_BLOCKS, TEST_YARD_RECOVERY_ZONES, TEST_YARD_SPAWN, yardBodySpec } from '../simulation/yard/testYard';
import { createRobotProxy } from './robotProxy';

const PROMPTS: Record<InputDevice, string> = {
  'keyboard-mouse': 'WASD move · Mouse look · Space jump · Esc release mouse',
  gamepad: 'Left stick move · Right stick look · A jump · Menu pause',
  none: 'Click to play · WASD or left stick to move',
};

/**
 * First-person movement test yard (MSC-013): ramps, steps, a corner and a recovery pit, plus a few
 * physics crates and a robot proxy for scale. Debug data is exposed on the canvas dataset.
 */
export async function createTestYardScene(canvas: HTMLCanvasElement, hint: HTMLElement | null): Promise<() => void> {
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new Scene();
  scene.background = new Color('#e8a27c');
  scene.fog = new Fog('#e8a27c', 30, 90);
  scene.add(new AmbientLight('#ffffff', 0.65));
  const sun = new DirectionalLight('#fff1dc', 1.6);
  sun.position.set(6, 12, 4);
  scene.add(sun);

  const camera = new PerspectiveCamera(70, 1, 0.05, 200);
  camera.rotation.order = 'YXZ';

  const probeWorld = await createRapierWorld();
  canvas.dataset['physicsProbe'] = JSON.stringify(runPhysicsProbe(probeWorld));
  probeWorld.dispose();

  const world = await createRapierWorld();
  for (const block of TEST_YARD_BLOCKS) {
    world.addBox(yardBodySpec(block));
    const { x, y, z } = block.halfExtents;
    const mesh = new Mesh(new BoxGeometry(x * 2, y * 2, z * 2), new MeshStandardMaterial({ color: block.color }));
    mesh.position.set(block.position.x, block.position.y, block.position.z);
    if (block.rotation) mesh.quaternion.set(block.rotation.x, block.rotation.y, block.rotation.z, block.rotation.w);
    scene.add(mesh);
  }

  // Bundled texture proves relative asset loading in the packaged app (MSC-007).
  const crateMaterial = new MeshStandardMaterial({ color: '#ffffff' });
  new TextureLoader().load(checkerUrl, (texture) => {
    texture.colorSpace = SRGBColorSpace;
    crateMaterial.map = texture;
    crateMaterial.needsUpdate = true;
    canvas.dataset['assetsLoaded'] = 'true';
  });
  const crates: { handle: PhysicsBodyHandle; mesh: Mesh }[] = [0, 1, 2, 3].map((index) => {
    const size = 0.5 + index * 0.1;
    const handle = world.addBox({
      kind: 'dynamic',
      position: { x: 3 + index * 0.4, y: 1 + index * 0.8, z: 5 },
      halfExtents: { x: size / 2, y: size / 2, z: size / 2 },
      massKg: 8 * size,
    });
    const mesh = new Mesh(new BoxGeometry(size, size, size), crateMaterial);
    scene.add(mesh);
    return { handle, mesh };
  });

  const proxy = createRobotProxy('#f2b134');
  proxy.position.set(-1.5, 0.8, 4);
  proxy.rotation.y = Math.PI / 5;
  scene.add(proxy);

  const player = new PlayerController(
    world,
    TEST_YARD_SPAWN,
    PHYSICS_CONVENTIONS.marsGravity,
    TEST_YARD_RECOVERY_ZONES,
  );
  const keyboard = new KeyboardMouseSource(DEFAULT_INPUT_SETTINGS);
  const gamepad = new GamepadSource(DEFAULT_INPUT_SETTINGS);
  const isLocked = (): boolean => document.pointerLockElement === canvas;
  const detachKeyboard = keyboard.attach(window, isLocked);
  const lockPointer = (): void => {
    if (!isLocked()) void canvas.requestPointerLock();
  };
  canvas.addEventListener('click', lockPointer);

  const resize = (): void => {
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    camera.aspect = canvas.clientWidth / Math.max(canvas.clientHeight, 1);
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  let device: InputDevice = 'none';
  let accumulator = 0;
  let previous = performance.now();
  const step = PHYSICS_CONVENTIONS.fixedStepSeconds;
  const euler = new Euler(0, 0, 0, 'YXZ');

  renderer.setAnimationLoop((now) => {
    const dt = Math.min((now - previous) / 1000, 0.1);
    previous = now;
    const frame = mergeFrames(keyboard.poll(), gamepad.poll(dt));
    if (frame.device !== 'none' && frame.device !== device) {
      device = frame.device;
      if (hint) hint.textContent = PROMPTS[device];
    }
    if (frame.pause && isLocked()) document.exitPointerLock();
    player.applyLook(frame);

    // Fixed-step simulation with bounded catch-up.
    accumulator = Math.min(accumulator + dt, step * 5);
    while (accumulator >= step) {
      player.fixedUpdate(frame.move, step);
      world.step();
      accumulator -= step;
    }

    const view = player.view();
    camera.position.set(view.eye.x, view.eye.y, view.eye.z);
    euler.set(view.pitch, view.yaw, 0);
    camera.quaternion.setFromEuler(euler);
    for (const crate of crates) {
      const p = world.bodyPosition(crate.handle);
      const r = world.bodyRotation(crate.handle);
      crate.mesh.position.set(p.x, p.y, p.z);
      crate.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
    canvas.dataset['player'] = JSON.stringify({
      x: Number(view.position.x.toFixed(2)),
      y: Number(view.position.y.toFixed(2)),
      z: Number(view.position.z.toFixed(2)),
      grounded: view.grounded,
      recoveries: view.recoveries,
      device,
    });
    canvas.dataset['awakeBodies'] = String(world.awakeBodyCount());
    renderer.render(scene, camera);
  });

  if (hint) hint.textContent = PROMPTS.none;
  return () => {
    renderer.setAnimationLoop(null);
    detachKeyboard();
    canvas.removeEventListener('click', lockPointer);
    window.removeEventListener('resize', resize);
    world.dispose();
    renderer.dispose();
  };
}
