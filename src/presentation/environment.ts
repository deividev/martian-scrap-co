import type { Scene } from 'three';
import {
  ACESFilmicToneMapping,
  AmbientLight,
  BackSide,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Fog,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PCFSoftShadowMap,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type WebGLRenderer,
} from 'three';
import { mulberry32 } from '../simulation/benchmark/denseYardFixture';
import { SCRAP_MOUNTAIN, mountainHeight, type BackdropLayout } from '../simulation/yard/backdrop';
import {
  SCRAP_COLORS,
  STYLE,
  createColonyDome,
  createRock,
  createStationDome,
  paint,
  scrapGeometry,
  scrapMaterial,
} from '../models/styledModels';

/**
 * Warm stylized Mars backdrop (approved gameplay concept): peach sky gradient, gentle haze, red ground with
 * rocks and mesas, a huge mixed scrap mountain behind the yard hiding a white station ring, a dish antenna
 * and distant colony domes. Decorative only: nothing here has physics.
 */
export function createMarsEnvironment(scene: Scene, renderer: WebGLRenderer, layout: BackdropLayout): DirectionalLight {
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;

  scene.background = new Color(STYLE.skyHorizon);
  scene.fog = new Fog(STYLE.skyHorizon, 45, 170);

  const sky = new Mesh(
    new SphereGeometry(400, 24, 12),
    new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { top: { value: new Color(STYLE.skyTop) }, horizon: { value: new Color(STYLE.skyHorizon) } },
      vertexShader:
        'varying vec3 vPos; void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: [
        'uniform vec3 top;',
        'uniform vec3 horizon;',
        'varying vec3 vPos;',
        'void main() {',
        '  float h = clamp(normalize(vPos).y * 2.2, 0.0, 1.0);',
        '  gl_FragColor = vec4(mix(horizon, top, h), 1.0);',
        '  #include <tonemapping_fragment>',
        '  #include <colorspace_fragment>',
        '}',
      ].join('\n'),
    }),
  );
  scene.add(sky);

  scene.add(new HemisphereLight('#ffe9d6', '#b4532f', 0.9));
  scene.add(new AmbientLight('#ffffff', 0.15));
  const sun = new DirectionalLight('#fff0dc', 2.4);
  sun.position.set(18, 26, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const shadowCamera = sun.shadow.camera;
  shadowCamera.left = -30;
  shadowCamera.right = 30;
  shadowCamera.top = 30;
  shadowCamera.bottom = -30;
  shadowCamera.far = 80;
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  // Wide visual ground beyond the playable yard (the yard's own blocks render on top).
  const outerGround = new Mesh(new PlaneGeometry(500, 500, 1, 1), paint(STYLE.marsGround, 1));
  outerGround.rotation.x = -Math.PI / 2;
  outerGround.position.y = -0.02;
  outerGround.receiveShadow = true;
  scene.add(outerGround);

  const random = mulberry32(42);

  // Rocks and far mesas come from the shared backdrop layout, so each one also has a collider.
  for (const entry of layout.rocks) {
    const rock = createRock(entry.seed, entry.scale);
    rock.position.set(entry.position.x, 0, entry.position.z);
    rock.rotation.y = entry.yaw;
    scene.add(rock);
  }
  for (const entry of layout.mesas) {
    const mesa = new Mesh(
      new CylinderGeometry(entry.radiusTop, entry.radiusBottom, entry.height, 7),
      paint(STYLE.marsDark, 1),
    );
    mesa.position.set(entry.position.x, entry.position.y, entry.position.z);
    scene.add(mesa);
  }

  // The scrap mountain: instanced styled scrap resting on the mountain collider surface.
  const { center } = SCRAP_MOUNTAIN;
  const matrix = new Matrix4();
  const rotation = new Quaternion();
  const axis = new Vector3();
  for (const materialId of Object.keys(SCRAP_COLORS)) {
    const variants = materialId === 'ferrous' ? 4 : 1;
    for (let variant = 0; variant < variants; variant += 1) {
      const count = materialId === 'ferrous' ? 700 : 450;
      const mound = new InstancedMesh(scrapGeometry(materialId, variant), scrapMaterial(materialId), count);
      for (let i = 0; i < count; i += 1) {
        const angle = random() * Math.PI * 2;
        const radius = Math.sqrt(random()) * 0.98;
        const x = center.x + Math.cos(angle) * radius * SCRAP_MOUNTAIN.radiusX;
        const z = center.z + Math.sin(angle) * radius * SCRAP_MOUNTAIN.radiusZ;
        const surface = mountainHeight(x, z);
        const height = surface * (SCRAP_MOUNTAIN.colliderScale + random() * (1 - SCRAP_MOUNTAIN.colliderScale));
        const size = 0.6 + random() * 1.8;
        axis.set(random() - 0.5, random() - 0.5, random() - 0.5).normalize();
        rotation.setFromAxisAngle(axis, random() * Math.PI);
        matrix.compose(new Vector3(x, height, z), rotation, new Vector3(size, size * (0.5 + random() * 0.6), size));
        mound.setMatrixAt(i, matrix);
      }
      mound.castShadow = true;
      mound.receiveShadow = true;
      scene.add(mound);
    }
  }
  // Painted crates and housings sitting on the mountain surface for the colorful concept look.
  const crateColors = [STYLE.paintRed, STYLE.paintBlue, STYLE.paintYellow, STYLE.stationWhite];
  for (let i = 0; i < 40; i += 1) {
    const angle = random() * Math.PI - Math.PI;
    const radius = 0.4 + random() * 0.5;
    const x = center.x + Math.cos(angle) * radius * SCRAP_MOUNTAIN.radiusX;
    const z = center.z + Math.sin(angle) * radius * SCRAP_MOUNTAIN.radiusZ;
    const crate = new Mesh(
      scrapGeometry('polymer', 0),
      paint(crateColors[i % crateColors.length] ?? STYLE.paintRed, 0.6),
    );
    const size = 1.2 + random() * 1.6;
    crate.scale.set(size * 1.4, size, size);
    crate.position.set(x, mountainHeight(x, z) * SCRAP_MOUNTAIN.colliderScale + size * 0.3, z);
    crate.rotation.set(random() * 0.4, random() * Math.PI, random() * 0.4);
    crate.castShadow = true;
    scene.add(crate);
  }

  // Half-buried station ring peeking out of the mountain (the campaign reveal).
  const station = createStationDome(layout.station.radius);
  station.position.set(layout.station.position.x, layout.station.position.y, layout.station.position.z);
  station.rotation.y = 0.3;
  scene.add(station);

  // Dish antenna on the pile and the colony domes on the horizon.
  const dishMast = new Mesh(new CylinderGeometry(0.25, 0.35, 8, 8), paint(STYLE.steelDark, 0.5));
  dishMast.position.set(16, 12, -48);
  scene.add(dishMast);
  const dish = new Mesh(new SphereGeometry(3.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3), paint(STYLE.stationWhite, 0.5));
  dish.position.set(16, 16.5, -48);
  dish.rotation.set(-1.0, 0.4, 0);
  scene.add(dish);
  for (const entry of layout.colonies) {
    const colony = createColonyDome(entry.radius);
    colony.position.set(entry.position.x, entry.position.y, entry.position.z);
    scene.add(colony);
  }
  const tower = new Mesh(new CylinderGeometry(1.2, 1.6, 18, 10), new MeshBasicMaterial({ color: '#f1ddd0' }));
  tower.position.set(92, 9, -126);
  scene.add(tower);

  return sun;
}
