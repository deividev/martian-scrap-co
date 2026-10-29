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
import { FIRST_PASS_CONTENT } from '../content/firstPass';
import { parseContentPack } from '../content/schema';
import { PortableContainer } from '../domain/container';
import { EntityIdAllocator } from '../domain/ids';
import { mergeFrames, type InputDevice } from '../input/actions';
import { GamepadSource } from '../input/gamepadSource';
import { DEFAULT_INPUT_SETTINGS } from '../input/inputSettings';
import { KeyboardMouseSource } from '../input/keyboardMouseSource';
import { MagneticCollector, type TargetFeedback } from '../simulation/collection/magneticCollector';
import { pickTarget, type TargetPick } from '../simulation/collection/targeting';
import { ClaimRegistry } from '../simulation/handling/claims';
import { GripController, type PlaceResult } from '../simulation/handling/gripController';
import { MediumPropSet } from '../simulation/handling/mediumProps';
import { PHYSICS_CONVENTIONS } from '../simulation/physics/conventions';
import type { PhysicsBodyHandle } from '../simulation/physics/physicsPort';
import { runPhysicsProbe } from '../simulation/physics/probe';
import { createRapierWorld } from '../simulation/physics/rapierWorld';
import { PlayerController } from '../simulation/player/playerController';
import { ScrapField } from '../simulation/scrap/scrapField';
import {
  TEST_YARD_BLOCKS,
  TEST_YARD_RECOVERY_ZONES,
  TEST_YARD_SPAWN,
  createTestYardProps,
  createTestYardScrap,
  yardBodySpec,
} from '../simulation/yard/testYard';
import { createRobotProxy } from './robotProxy';
import { MATERIAL_COLORS, ScrapPileView } from './scrapPileView';

export interface TestYardHud {
  readonly hint: HTMLElement | null;
  readonly feedback: HTMLElement | null;
  readonly container: HTMLElement | null;
}

const PROMPTS: Record<InputDevice, string> = {
  'keyboard-mouse': 'WASD move · Mouse look · E / click collect or grab · Q/R rotate · Space jump · Esc release mouse',
  gamepad: 'Left stick move · Right stick look · X collect or grab · LB/RB rotate · A jump · Menu pause',
  none: 'Click to play · WASD or left stick to move',
};

/**
 * First-person movement test yard (MSC-013): ramps, steps, a corner and a recovery pit, plus a few
 * physics crates and a robot proxy for scale. Debug data is exposed on the canvas dataset.
 */
export async function createTestYardScene(canvas: HTMLCanvasElement, hud: TestYardHud): Promise<() => void> {
  const { hint, feedback: feedbackLabel } = hud;
  const content = parseContentPack(FIRST_PASS_CONTENT);
  if (!content.ok) throw new Error(`Invalid content: ${content.errors.join('; ')}`);
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
  proxy.position.set(-3.5, 0.8, 1.5);
  proxy.rotation.y = Math.PI / 5;
  scene.add(proxy);

  const player = new PlayerController(
    world,
    TEST_YARD_SPAWN,
    PHYSICS_CONVENTIONS.marsGravity,
    TEST_YARD_RECOVERY_ZONES,
  );
  const allocator = new EntityIdAllocator();
  const scrap = new ScrapField(world, [createTestYardScrap(allocator)]);
  scrap.activateCluster('test-yard-pile');
  const scrapView = new ScrapPileView(scene, scrap, world);
  const container = new PortableContainer();
  const collector = new MagneticCollector(content.pack, scrap, world, {
    canAccept: (id) => container.canAccept(id),
    accept: (item) => void container.add(item),
  });
  let feedback: TargetFeedback = { state: 'none' };

  const props = new MediumPropSet(world, createTestYardProps(allocator));
  const grip = new GripController(world, props, new ClaimRegistry(), 'player-0');
  const propMeshes = props.all().map((prop) => {
    const { x, y, z } = prop.halfExtents;
    const mesh = new Mesh(
      new BoxGeometry(x * 2, y * 2, z * 2),
      new MeshStandardMaterial({ color: MATERIAL_COLORS[prop.materialId] ?? '#ff00ff', roughness: 0.5 }),
    );
    scene.add(mesh);
    return { prop, mesh };
  });
  const PLACE_MESSAGES: Record<Exclude<PlaceResult, { ok: true }>['reason'], string> = {
    'not-holding': '',
    blocked: 'Cannot place here: something is in the way.',
    'overlaps-player': 'Cannot place here: too close to you.',
  };
  let notice = '';
  let noticeUntil = 0;
  const closer = (a: TargetPick | null, b: TargetPick | null): TargetPick | null =>
    !a ? b : !b ? a : a.angle <= b.angle ? a : b;
  const forwardOf = (yaw: number, pitch: number) => ({
    x: -Math.sin(yaw) * Math.cos(pitch),
    y: Math.sin(pitch),
    z: -Math.cos(yaw) * Math.cos(pitch),
  });

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

    const aimView = player.view();
    const aim = { origin: aimView.eye, direction: forwardOf(aimView.yaw, aimView.pitch) };
    let prompt = '';
    if (frame.rotate !== 0) grip.rotate(frame.rotate);
    if (grip.held !== null) {
      feedback = { state: 'none' };
      prompt = `Holding ${props.get(grip.held)?.displayName ?? 'object'} · place`;
      if (frame.interact) {
        const placed = grip.tryPlace(aimView.position);
        if (!placed.ok) {
          notice = PLACE_MESSAGES[placed.reason];
          noticeUntil = now + 1500;
        }
      }
    } else {
      const propPick = pickTarget(aim, props.targets(), world, player.characterHandle);
      const scrapPick = pickTarget(aim, scrap.activeTargets(), world, player.characterHandle);
      const best = closer(propPick, scrapPick);
      if (best && best === propPick) {
        feedback = { state: 'none' };
        prompt = `${props.get(best.candidate.id)?.displayName ?? 'Object'}: grab`;
        if (frame.interact) grip.tryGrab(best, aimView.yaw);
      } else {
        feedback = collector.evaluate(scrapPick);
        if (frame.interact) collector.tryStartPull(feedback);
      }
    }

    // Fixed-step simulation with bounded catch-up.
    accumulator = Math.min(accumulator + dt, step * 5);
    while (accumulator >= step) {
      player.fixedUpdate(frame.move, step);
      const eye = player.view().eye;
      collector.fixedUpdate({ x: eye.x, y: eye.y - 0.4, z: eye.z });
      grip.fixedUpdate(eye, player.view().yaw);
      world.step();
      props.recordSettled(grip.held === null ? undefined : new Set([grip.held]));
      props.recoverFallen();
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
    for (const { prop, mesh } of propMeshes) {
      const p = world.bodyPosition(prop.body);
      const r = world.bodyRotation(prop.body);
      mesh.position.set(p.x, p.y, p.z);
      mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
    scrapView.sync();
    scrapView.highlight(feedback);
    if (feedbackLabel) {
      const scrapText =
        feedback.state === 'compatible'
          ? `${feedback.material.symbol} ${feedback.material.displayName}: collect`
          : feedback.state === 'none'
            ? ''
            : `${feedback.material.symbol} ${feedback.reason}`;
      const showingNotice = now < noticeUntil;
      feedbackLabel.textContent = showingNotice ? notice : prompt || scrapText;
      feedbackLabel.dataset['state'] = showingNotice ? 'blocked' : prompt ? 'compatible' : feedback.state;
    }
    canvas.dataset['collected'] = String(container.count);
    canvas.dataset['held'] = grip.held ?? '';
    if (hud.container) {
      hud.container.textContent = `Container ${container.count}/${container.capacity}${container.isFull ? ' · FULL' : ''}`;
      hud.container.dataset['full'] = String(container.isFull);
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
