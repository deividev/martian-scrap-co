import type { Scene } from 'three';
import {
  ACESFilmicToneMapping,
  AmbientLight,
  BackSide,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Float32BufferAttribute,
  Fog,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  type WebGLRenderer,
} from 'three';
import { SCRAP_MOUNTAIN, mountainHeight, type BackdropLayout } from '../simulation/yard/backdrop';
import { mergeStatic } from '../models/mergeStatic';
import { STYLE, createColonyDome, createStationDome, paint } from '../models/styledModels';
import { createContainerModel, createFloodlightModel, createLayeredRock, createMesa } from '../models/sceneryModels';

/**
 * Warm stylized Mars backdrop (approved gameplay concept): peach sky gradient, gentle haze, red ground with
 * rocks and mesas, a huge mixed scrap mountain behind the yard hiding a white station ring, a dish antenna
 * and distant colony domes. The mountain's pieces are drawn by MountainView; colliders come from the backdrop layout.
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

  scene.add(new HemisphereLight('#fff0e2', '#c9653d', 1.3));
  scene.add(new AmbientLight('#ffffff', 0.3));
  const sun = new DirectionalLight('#fff0dc', 2.4);
  // High side sun from +x, slightly toward the mountain, so the base fronts and the mountain slopes both read.
  sun.position.set(22, 30, -6);
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

  // Wide visual ground with broad, soft tone patches (concept ground reads warm but not flat).
  const groundGeometry = new PlaneGeometry(500, 500, 125, 125);
  const groundPositions = groundGeometry.attributes['position'];
  const tones = [new Color(STYLE.marsGround), new Color('#c25c34'), new Color('#d9784a')];
  const colors: number[] = [];
  const tone = new Color();
  for (let i = 0; i < (groundPositions?.count ?? 0); i += 1) {
    const x = groundPositions?.getX(i) ?? 0;
    const y = groundPositions?.getY(i) ?? 0;
    const n = Math.sin(x * 0.045) * Math.cos(y * 0.05) + Math.sin((x + y) * 0.018) * 0.6;
    const [a, b] = n > 0 ? [tones[0], tones[2]] : [tones[0], tones[1]];
    tone.copy(a ?? tones[0]!).lerp(b ?? tones[0]!, Math.min(1, Math.abs(n) * 0.55));
    colors.push(tone.r, tone.g, tone.b);
  }
  groundGeometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  const outerGround = new Mesh(groundGeometry, new MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  outerGround.rotation.x = -Math.PI / 2;
  outerGround.position.y = -0.02;
  outerGround.receiveShadow = true;
  scene.add(outerGround);

  // Static scenery is batched into a few meshes (draw-call budget); colliders come from the backdrop layout.
  const scenery = new Group();

  // The mountain core: a packed mound of dark scrap under the real pieces (same surface as its collider).
  const coreGeometry = new PlaneGeometry(SCRAP_MOUNTAIN.radiusX * 2, SCRAP_MOUNTAIN.radiusZ * 2, 96, 56);
  coreGeometry.rotateX(-Math.PI / 2);
  const corePositions = coreGeometry.attributes['position'];
  const coreColors: number[] = [];
  const coreTones = [new Color('#4f4a4c'), new Color('#6b5248'), new Color('#3f4450')];
  for (let i = 0; i < (corePositions?.count ?? 0); i += 1) {
    const x = (corePositions?.getX(i) ?? 0) + SCRAP_MOUNTAIN.center.x;
    const z = (corePositions?.getZ(i) ?? 0) + SCRAP_MOUNTAIN.center.z;
    corePositions?.setY(i, mountainHeight(x, z) * SCRAP_MOUNTAIN.colliderScale - 0.05);
    const n = Math.abs(Math.sin(x * 1.7) * Math.cos(z * 1.3) + Math.sin((x - z) * 0.9));
    const pick = coreTones[Math.floor(n * 1.5) % coreTones.length] ?? coreTones[0];
    if (pick) coreColors.push(pick.r, pick.g, pick.b);
  }
  coreGeometry.setAttribute('color', new Float32BufferAttribute(coreColors, 3));
  coreGeometry.computeVertexNormals();
  const core = new Mesh(
    coreGeometry,
    new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }),
  );
  core.position.set(SCRAP_MOUNTAIN.center.x, 0, SCRAP_MOUNTAIN.center.z);
  core.receiveShadow = true;
  scene.add(core);

  // Rocks and far mesas come from the shared backdrop layout, so each one also has a collider.
  for (const entry of layout.rocks) {
    const rock = createLayeredRock(entry.seed, entry.scale);
    rock.position.set(entry.position.x, 0, entry.position.z);
    rock.rotation.y = entry.yaw;
    scenery.add(rock);
  }
  layout.mesas.forEach((entry, index) => {
    const mesa = createMesa(entry.radiusTop, entry.radiusBottom, entry.height, index);
    mesa.position.set(entry.position.x, entry.position.y, entry.position.z);
    scenery.add(mesa);
  });
  for (const entry of layout.containers) {
    const container = createContainerModel(entry.color);
    container.position.set(entry.position.x, entry.position.y, entry.position.z);
    container.rotation.y = entry.yaw;
    scenery.add(container);
  }
  for (const entry of layout.floodlights) {
    const light = createFloodlightModel();
    light.position.set(entry.x, 0, entry.z);
    light.rotation.y = Math.PI;
    scenery.add(light);
  }

  // The scrap mountain itself is real pieces now (simulation/yard/scrapMountain.ts, presentation/mountainView.ts).

  // Half-buried station ring peeking out of the mountain (the campaign reveal).
  const station = createStationDome(layout.station.radius);
  station.position.set(layout.station.position.x, layout.station.position.y, layout.station.position.z);
  station.rotation.y = 0.3;
  scenery.add(station);

  // Dish antenna on the pile and the colony domes on the horizon.
  const dishMast = new Mesh(new CylinderGeometry(0.25, 0.35, 8, 8), paint(STYLE.steelDark, 0.5));
  dishMast.position.set(16, 12, -48);
  scenery.add(dishMast);
  const dish = new Mesh(new SphereGeometry(3.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3), paint(STYLE.stationWhite, 0.5));
  dish.position.set(16, 16.5, -48);
  dish.rotation.set(-1.0, 0.4, 0);
  scenery.add(dish);
  for (const entry of layout.colonies) {
    const colony = createColonyDome(entry.radius);
    colony.position.set(entry.position.x, entry.position.y, entry.position.z);
    scenery.add(colony);
  }
  const tower = new Mesh(new CylinderGeometry(1.2, 1.6, 18, 10), new MeshBasicMaterial({ color: '#f1ddd0' }));
  tower.position.set(92, 9, -126);
  scenery.add(tower);

  scene.add(mergeStatic(scenery));
  return sun;
}
