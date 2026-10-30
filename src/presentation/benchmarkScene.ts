import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Fog,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { FIRST_PASS_CONTENT } from '../content/firstPass';
import { parseContentPack } from '../content/schema';
import { PortableContainer } from '../domain/container';
import { transactionId, type EntityId } from '../domain/ids';
import { DENSE_YARD_PRESETS, buildDenseYard, type DenseYardParams } from '../simulation/benchmark/denseYardFixture';
import { MagneticCollector } from '../simulation/collection/magneticCollector';
import { PHYSICS_CONVENTIONS } from '../simulation/physics/conventions';
import { createRapierWorld } from '../simulation/physics/rapierWorld';
import { summarize, type Distribution } from './metrics';
import { PropView } from './propView';
import { MATERIAL_COLORS } from './scrapPileView';

export interface BenchmarkReport {
  readonly buildHash: string;
  readonly preset: string;
  readonly params: DenseYardParams;
  readonly environment: Record<string, string | number>;
  readonly measuredSeconds: number;
  readonly frameMs: Distribution;
  readonly simulationMsPerFrame: Distribution;
  readonly awakeBodies: Distribution;
  readonly drawCalls: Distribution;
  readonly triangles: Distribution;
  readonly counts: Record<string, number>;
  readonly interactions: Record<string, number>;
  readonly lateJoinSnapshot: { readonly bytes: number; readonly serializeMs: number };
  readonly memory: Record<string, number>;
}

const MATERIAL_IDS = Object.keys(MATERIAL_COLORS);

function gpuName(renderer: WebGLRenderer): string {
  const gl = renderer.getContext();
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  return info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'unavailable';
}

/**
 * Representative dense-yard benchmark (MSC-019). Measures frame time, simulation time, awake bodies,
 * draw calls and memory while four scripted collectors and four carts work and an assembly is cut.
 * It records numbers only: no screenshots, video or audio, and no safe-count conclusions.
 */
export async function runBenchmarkScene(
  canvas: HTMLCanvasElement,
  presetName: string,
  measureSeconds: number,
): Promise<BenchmarkReport> {
  const params = DENSE_YARD_PRESETS[presetName as keyof typeof DENSE_YARD_PRESETS];
  if (!params) throw new Error(`Unknown benchmark preset ${presetName}`);
  const content = parseContentPack(FIRST_PASS_CONTENT);
  if (!content.ok) throw new Error('Invalid content');

  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(1);
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  const scene = new Scene();
  scene.background = new Color('#e8a27c');
  scene.fog = new Fog('#e8a27c', 40, 120);
  scene.add(new AmbientLight('#ffffff', 0.65));
  const sun = new DirectionalLight('#fff1dc', 1.6);
  sun.position.set(10, 20, 6);
  scene.add(sun);
  const camera = new PerspectiveCamera(70, canvas.clientWidth / Math.max(canvas.clientHeight, 1), 0.1, 300);

  const world = await createRapierWorld();
  const yard = buildDenseYard(world, params);

  const ground = new Mesh(new BoxGeometry(120, 1, 120), new MeshStandardMaterial({ color: '#b5502f' }));
  ground.position.y = -0.5;
  scene.add(ground);
  const stationMaterial = new MeshStandardMaterial({ color: '#2f3a4f' });
  for (const block of yard.stationBlocks) {
    const mesh = new Mesh(
      new BoxGeometry(block.halfExtents.x * 2, block.halfExtents.y * 2, block.halfExtents.z * 2),
      stationMaterial,
    );
    mesh.position.set(block.position.x, block.position.y, block.position.z);
    scene.add(mesh);
  }

  // Decorative mound: one InstancedMesh per material, never simulated.
  const unitBox = new BoxGeometry(1, 1, 1);
  const matrix = new Matrix4();
  const quaternion = new Quaternion();
  const up = new Vector3(0, 1, 0);
  for (const materialId of MATERIAL_IDS) {
    const instances = yard.decorative.filter((instance) => instance.materialId === materialId);
    if (instances.length === 0) continue;
    const mesh = new InstancedMesh(
      unitBox,
      new MeshStandardMaterial({ color: MATERIAL_COLORS[materialId] ?? '#ff00ff' }),
      instances.length,
    );
    instances.forEach((instance, index) => {
      quaternion.setFromAxisAngle(up, instance.yaw);
      matrix.compose(
        new Vector3(instance.position.x, instance.position.y, instance.position.z),
        quaternion,
        new Vector3(instance.scale.x, instance.scale.y, instance.scale.z),
      );
      mesh.setMatrixAt(index, matrix);
    });
    scene.add(mesh);
  }

  // Active scrap: instanced per material, matrices refreshed every frame from physics.
  const activeCapacity = params.activeClusters * params.piecesPerCluster;
  const activeMeshes = new Map(
    MATERIAL_IDS.map((materialId) => {
      const mesh = new InstancedMesh(
        unitBox,
        new MeshStandardMaterial({ color: MATERIAL_COLORS[materialId] ?? '#ff00ff' }),
        activeCapacity,
      );
      scene.add(mesh);
      return [materialId, mesh] as const;
    }),
  );
  const helper = new Object3D();
  const syncActive = (): void => {
    const counts = new Map<string, number>();
    for (const target of yard.scrap.activeTargets()) {
      const piece = yard.scrap.piece(target.id);
      const mesh = piece ? activeMeshes.get(piece.materialId) : undefined;
      if (!piece || !mesh) continue;
      const index = counts.get(piece.materialId) ?? 0;
      const r = world.bodyRotation(target.body);
      helper.position.set(target.position.x, target.position.y, target.position.z);
      helper.quaternion.set(r.x, r.y, r.z, r.w);
      helper.scale.set(piece.halfExtents.x * 2, piece.halfExtents.y * 2, piece.halfExtents.z * 2);
      helper.updateMatrix();
      mesh.setMatrixAt(index, helper.matrix);
      counts.set(piece.materialId, index + 1);
    }
    for (const [materialId, mesh] of activeMeshes) {
      mesh.count = counts.get(materialId) ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
    }
  };

  const propView = new PropView(scene, yard.props, world);
  const cartMaterial = new MeshStandardMaterial({ color: '#f08a3c' });
  const cartMeshes = yard.carts.map(() => {
    const mesh = new Mesh(new BoxGeometry(1.2, 0.5, 0.9), cartMaterial);
    scene.add(mesh);
    return mesh;
  });

  // Scripted actors: four collectors orbit active clusters; four carts circle the yard.
  const collectors = [0, 1, 2, 3].map((index) => {
    const container = new PortableContainer(1000);
    return {
      clusterIndex: index % Math.max(1, yard.activeClusterIds.length),
      container,
      collector: new MagneticCollector(content.pack, yard.scrap, world, {
        canAccept: (id) => container.canAccept(id),
        accept: (item) => void container.add(item),
      }),
    };
  });
  yard.carts.forEach((cart, index) => cart.startPush(`bench-${index}`));
  let cutCounter = 0;

  const step = PHYSICS_CONVENTIONS.fixedStepSeconds;
  const frameSamples: number[] = [];
  const simSamples: number[] = [];
  const awakeSamples: number[] = [];
  const drawSamples: number[] = [];
  const triangleSamples: number[] = [];
  const memoryInfo = (): number =>
    (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0;
  const heapStart = memoryInfo();
  let elapsed = 0;
  let accumulator = 0;
  let previous = performance.now();
  const warmupSeconds = 2;
  let cartDistance = 0;
  const lastCartPositions = yard.carts.map((cart) => world.bodyPosition(cart.body));

  const actorStep = (time: number): void => {
    collectors.forEach((entry, index) => {
      const angle = time * 0.3 + (index * Math.PI) / 2;
      const clusterAngle = (entry.clusterIndex / (params.activeClusters + params.dormantClusters)) * Math.PI * 2;
      const radius = 6 + (entry.clusterIndex % 3) * 3;
      const origin = {
        x: Math.cos(clusterAngle) * radius + Math.cos(angle) * 1.8,
        y: 1.3,
        z: Math.sin(clusterAngle) * radius + Math.sin(angle) * 1.8,
      };
      if (entry.collector.pulling.length === 0) {
        let best: { id: EntityId; distance: number } | null = null;
        for (const target of yard.scrap.activeTargets()) {
          if (yard.scrap.piece(target.id)?.materialId !== 'ferrous') continue;
          const distance = Math.hypot(
            target.position.x - origin.x,
            target.position.y - origin.y,
            target.position.z - origin.z,
          );
          if (distance < 3.5 && (!best || distance < best.distance)) best = { id: target.id, distance };
        }
        const candidate = best ? yard.scrap.activeTargets().find((target) => target.id === best.id) : undefined;
        if (candidate && best) {
          entry.collector.tryStartPull(entry.collector.evaluate({ candidate, distance: best.distance, angle: 0 }));
        }
      }
      entry.collector.fixedUpdate(origin);
    });
    yard.carts.forEach((cart, index) => {
      const angle = time * 0.25 + (index * Math.PI) / 2;
      const yaw = -angle;
      cart.fixedUpdate(step, {
        holder: `bench-${index}`,
        eye: { x: Math.cos(angle) * 12, y: 1.4, z: Math.sin(angle) * 12 },
        yaw,
      });
    });
  };

  return new Promise((resolve) => {
    renderer.setAnimationLoop((now) => {
      const dt = Math.min((now - previous) / 1000, 0.1);
      previous = now;
      elapsed += dt;
      const simStart = performance.now();
      accumulator = Math.min(accumulator + dt, step * 5);
      while (accumulator >= step) {
        actorStep(elapsed);
        world.step();
        accumulator -= step;
      }
      if (Math.floor(elapsed / 2) > cutCounter && yard.rover.state.availableJoints().length > 0) {
        cutCounter += 1;
        const joint = yard.rover.state.availableJoints()[0];
        if (joint) yard.rover.cut(joint, transactionId(`txn-bench${cutCounter.toString(36)}`));
      }
      const simMs = performance.now() - simStart;

      syncActive();
      propView.sync();
      yard.carts.forEach((cart, index) => {
        const p = world.bodyPosition(cart.body);
        const r = world.bodyRotation(cart.body);
        cartMeshes[index]?.position.set(p.x, p.y, p.z);
        cartMeshes[index]?.quaternion.set(r.x, r.y, r.z, r.w);
        const last = lastCartPositions[index];
        if (last) cartDistance += Math.hypot(p.x - last.x, p.z - last.z);
        lastCartPositions[index] = p;
      });
      // Smooth slow orbit (capture-guide camera guidance): no jumps or shake.
      const orbit = elapsed * 0.08;
      camera.position.set(Math.cos(orbit) * 24, 10, Math.sin(orbit) * 24);
      camera.lookAt(0, 1, 0);
      renderer.render(scene, camera);

      if (elapsed > warmupSeconds) {
        frameSamples.push(dt * 1000);
        simSamples.push(simMs);
        awakeSamples.push(world.awakeBodyCount());
        drawSamples.push(renderer.info.render.calls);
        triangleSamples.push(renderer.info.render.triangles);
      }
      if (elapsed < warmupSeconds + measureSeconds) return;

      renderer.setAnimationLoop(null);
      const snapshotStart = performance.now();
      const snapshotJson = JSON.stringify({ scrap: yard.scrap.snapshot(), rover: yard.rover.state.snapshot() });
      const serializeMs = performance.now() - snapshotStart;
      const scrapMetrics = yard.scrap.metrics();
      resolve({
        buildHash: __BUILD_HASH__,
        preset: presetName,
        params,
        environment: {
          userAgent: navigator.userAgent,
          gpu: gpuName(renderer),
          hardwareConcurrency: navigator.hardwareConcurrency,
          devicePixelRatio: window.devicePixelRatio,
          canvas: `${canvas.width}x${canvas.height}`,
          physics: world.engine,
        },
        measuredSeconds: Math.round((elapsed - warmupSeconds) * 100) / 100,
        frameMs: summarize(frameSamples),
        simulationMsPerFrame: summarize(simSamples),
        awakeBodies: summarize(awakeSamples),
        drawCalls: summarize(drawSamples),
        triangles: summarize(triangleSamples),
        counts: {
          visualInstances: yard.decorative.length,
          activePieces: scrapMetrics.active,
          dormantPieces: scrapMetrics.dormant,
          removedPieces: scrapMetrics.removed,
          mediumProps: yard.props.all().length,
          physicsBodies: world.bodyCount(),
        },
        interactions: {
          collected: collectors.reduce((total, entry) => total + entry.container.count, 0),
          cuts: cutCounter,
          cartMeters: Math.round(cartDistance),
        },
        lateJoinSnapshot: { bytes: snapshotJson.length, serializeMs: Math.round(serializeMs * 100) / 100 },
        memory: {
          jsHeapStartMb: Math.round(heapStart / 1048576),
          jsHeapEndMb: Math.round(memoryInfo() / 1048576),
          geometries: renderer.info.memory.geometries,
          textures: renderer.info.memory.textures,
        },
      });
    });
  });
}
