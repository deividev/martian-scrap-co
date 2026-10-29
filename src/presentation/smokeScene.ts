import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  SRGBColorSpace,
  Scene,
  TextureLoader,
  WebGLRenderer,
} from 'three';
import checkerUrl from '../assets/textures/smoke-checker.png';
import type { PhysicsBodyHandle, PhysicsWorldPort } from '../simulation/physics/physicsPort';
import { runPhysicsProbe } from '../simulation/physics/probe';
import { createRapierWorld } from '../simulation/physics/rapierWorld';

interface CrateSpec {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly size: number;
}

const CRATES: readonly CrateSpec[] = [
  { x: 0, y: 2, z: 0, size: 1 },
  { x: 0.3, y: 4, z: 0.2, size: 0.6 },
  { x: -1.2, y: 5, z: -0.4, size: 0.8 },
  { x: 1.4, y: 6.5, z: 0.6, size: 0.5 },
];

/**
 * Physics sandbox (MSC-011): proves TypeScript, Vite, Three.js and Rapier WASM run together in the
 * browser and in packaged Electron. Not gameplay. The probe summary is exposed on the canvas
 * dataset so runtimes can be compared.
 */
export async function createSmokeScene(canvas: HTMLCanvasElement): Promise<() => void> {
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new Scene();
  scene.background = new Color('#e8a27c');

  const camera = new PerspectiveCamera(60, 1, 0.1, 200);
  camera.position.set(0, 2.2, 6);
  camera.lookAt(0, 0.8, 0);

  const ground = new Mesh(new PlaneGeometry(40, 40), new MeshStandardMaterial({ color: '#b5502f' }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Loads a bundled file asset to prove relative asset URLs work from the packaged app.
  const crateMaterial = new MeshStandardMaterial({ color: '#ffffff' });
  new TextureLoader().load(checkerUrl, (texture) => {
    texture.colorSpace = SRGBColorSpace;
    crateMaterial.map = texture;
    crateMaterial.needsUpdate = true;
    canvas.dataset['assetsLoaded'] = 'true';
  });

  scene.add(new AmbientLight('#ffffff', 0.6));
  const sun = new DirectionalLight('#fff1dc', 1.6);
  sun.position.set(4, 8, 3);
  scene.add(sun);

  const probeWorld = await createRapierWorld();
  canvas.dataset['physicsProbe'] = JSON.stringify(runPhysicsProbe(probeWorld));
  probeWorld.dispose();

  const world: PhysicsWorldPort = await createRapierWorld();
  world.addBox({ kind: 'fixed', position: { x: 0, y: -0.5, z: 0 }, halfExtents: { x: 20, y: 0.5, z: 20 } });
  const crates: { handle: PhysicsBodyHandle; mesh: Mesh }[] = CRATES.map((spec) => {
    const half = spec.size / 2;
    const handle = world.addBox({
      kind: 'dynamic',
      position: { x: spec.x, y: spec.y, z: spec.z },
      halfExtents: { x: half, y: half, z: half },
      massKg: 10 * spec.size,
    });
    const mesh = new Mesh(new BoxGeometry(spec.size, spec.size, spec.size), crateMaterial);
    scene.add(mesh);
    return { handle, mesh };
  });

  const resize = (): void => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  let accumulator = 0;
  let previous = performance.now();
  renderer.setAnimationLoop((now) => {
    // Fixed-step simulation with a bounded catch-up so a stalled frame cannot spiral.
    accumulator = Math.min(accumulator + (now - previous) / 1000, world.fixedStepSeconds * 5);
    previous = now;
    while (accumulator >= world.fixedStepSeconds) {
      world.step();
      accumulator -= world.fixedStepSeconds;
    }
    for (const crate of crates) {
      const { x, y, z } = world.bodyPosition(crate.handle);
      crate.mesh.position.set(x, y, z);
      const rotation = world.bodyRotation(crate.handle);
      crate.mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
    }
    canvas.dataset['awakeBodies'] = String(world.awakeBodyCount());
    renderer.render(scene, camera);
  });

  return () => {
    renderer.setAnimationLoop(null);
    window.removeEventListener('resize', resize);
    world.dispose();
    renderer.dispose();
  };
}
