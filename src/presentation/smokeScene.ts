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

/** Toolchain smoke scene: proves TypeScript, Vite and Three.js render together. Not gameplay. */
export function createSmokeScene(canvas: HTMLCanvasElement): () => void {
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new Scene();
  scene.background = new Color('#e8a27c');

  const camera = new PerspectiveCamera(60, 1, 0.1, 200);
  camera.position.set(0, 1.7, 5);
  camera.lookAt(0, 0.5, 0);

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
  const crate = new Mesh(new BoxGeometry(1, 1, 1), crateMaterial);
  crate.position.y = 0.5;
  scene.add(crate);

  scene.add(new AmbientLight('#ffffff', 0.6));
  const sun = new DirectionalLight('#fff1dc', 1.6);
  sun.position.set(4, 8, 3);
  scene.add(sun);

  const resize = (): void => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  renderer.setAnimationLoop((time) => {
    crate.rotation.y = time / 1000;
    renderer.render(scene, camera);
  });

  return () => {
    renderer.setAnimationLoop(null);
    window.removeEventListener('resize', resize);
    renderer.dispose();
  };
}
