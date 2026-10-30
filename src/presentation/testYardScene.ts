import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Euler,
  Fog,
  Group,
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
import { AssemblyState } from '../domain/assembly';
import { EntityIdAllocator, transactionId } from '../domain/ids';
import type { I18n, StringKey } from '../i18n/i18n';
import { mergeFrames, type InputDevice } from '../input/actions';
import { GamepadSource } from '../input/gamepadSource';
import { DEFAULT_INPUT_SETTINGS } from '../input/inputSettings';
import { KeyboardMouseSource } from '../input/keyboardMouseSource';
import { MagneticCollector, type TargetFeedback } from '../simulation/collection/magneticCollector';
import { pickTarget, type TargetPick } from '../simulation/collection/targeting';
import { AssemblyBody } from '../simulation/handling/assemblyBody';
import { CART_TUNING, Cart, type LoadResult } from '../simulation/handling/cart';
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
  TEST_YARD_ROVER,
  TEST_YARD_ROVER_LAYOUT,
  TEST_YARD_SPAWN,
  createTestYardProps,
  createTestYardScrap,
  yardBodySpec,
} from '../simulation/yard/testYard';
import { createRobotProxy } from './robotProxy';
import { PropView } from './propView';
import { MATERIAL_COLORS, ScrapPileView } from './scrapPileView';

export interface TestYardHud {
  readonly hint: HTMLElement | null;
  readonly i18n: I18n;
  readonly feedback: HTMLElement | null;
  readonly container: HTMLElement | null;
}

const HINT_KEYS: Record<InputDevice, StringKey> = {
  'keyboard-mouse': 'hint.keyboard',
  gamepad: 'hint.gamepad',
  none: 'hint.none',
};

interface Notice {
  readonly key: StringKey;
  readonly params?: Readonly<Record<string, string | number>>;
}

/**
 * First-person movement test yard (MSC-013): ramps, steps, a corner and a recovery pit, plus a few
 * physics crates and a robot proxy for scale. Debug data is exposed on the canvas dataset.
 */
export async function createTestYardScene(canvas: HTMLCanvasElement, hud: TestYardHud): Promise<() => void> {
  const { hint, feedback: feedbackLabel, i18n } = hud;
  const nameOf = (keys: readonly string[] | undefined, fallback: string): string =>
    keys && keys.length > 0 ? keys.map((key) => i18n.tKey(key, fallback)).join(' + ') : fallback;
  const materialName = (id: string, fallback: string): string => i18n.tKey(`material.${id}`, fallback);
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
  const claims = new ClaimRegistry();
  const grip = new GripController(world, props, claims, 'player-0');
  const cart = new Cart(world, props, claims, allocator.allocate(), { x: 2, y: 0.4, z: 5 });
  const cartGroup = new Group();
  const cartBed = new Mesh(
    new BoxGeometry(CART_TUNING.halfExtents.x * 2, CART_TUNING.halfExtents.y * 2, CART_TUNING.halfExtents.z * 2),
    new MeshStandardMaterial({ color: '#f08a3c', roughness: 0.6 }),
  );
  const cartHandle = new Mesh(
    new BoxGeometry(0.08, 0.5, CART_TUNING.halfExtents.z * 1.6),
    new MeshStandardMaterial({ color: '#2f3a4f' }),
  );
  cartHandle.position.set(0, 0.3, CART_TUNING.halfExtents.z + 0.05);
  cartHandle.rotation.y = Math.PI / 2;
  cartGroup.add(cartBed, cartHandle);
  scene.add(cartGroup);
  const LOAD_NOTICES: Record<Exclude<LoadResult, { ok: true }>['reason'], Notice | null> = {
    full: { key: 'cart.full', params: { max: CART_TUNING.maxLoadCount } },
    'too-heavy': { key: 'cart.tooHeavy' },
    'already-loaded': null,
    claimed: { key: 'cart.claimed' },
    unknown: null,
  };
  const propView = new PropView(scene, props, world);
  const rover = new AssemblyBody(
    world,
    props,
    new AssemblyState(TEST_YARD_ROVER, () => allocator.allocate()),
    TEST_YARD_ROVER_LAYOUT,
  );
  const fragmentMeshes = new Map(
    rover.state.anchoredFragments().map((fragmentId) => {
      const placement = TEST_YARD_ROVER_LAYOUT.fragments[fragmentId];
      const material = TEST_YARD_ROVER.fragments.find((fragment) => fragment.id === fragmentId)?.materialId ?? '';
      const h = placement?.halfExtents ?? { x: 0.1, y: 0.1, z: 0.1 };
      const mesh = new Mesh(
        new BoxGeometry(h.x * 2, h.y * 2, h.z * 2),
        new MeshStandardMaterial({ color: MATERIAL_COLORS[material] ?? '#ff00ff', roughness: 0.55 }),
      );
      if (placement) mesh.position.set(placement.position.x, placement.position.y, placement.position.z);
      scene.add(mesh);
      return [fragmentId, mesh] as const;
    }),
  );
  const jointMarkerMaterial = new MeshStandardMaterial({ color: '#f08a3c', emissive: '#7a3410' });
  const jointMarkers = new Map(
    TEST_YARD_ROVER.joints.map((joint) => {
      const marker = new Mesh(new BoxGeometry(0.09, 0.09, 0.09), jointMarkerMaterial);
      const position = TEST_YARD_ROVER_LAYOUT.joints[joint.id];
      if (position) marker.position.set(position.x, position.y, position.z);
      scene.add(marker);
      return [joint.id, marker] as const;
    }),
  );
  let cutCounter = 0;
  const jointLabel = (id: string): string => i18n.tKey(`joint.${id}`, id);
  const PLACE_NOTICES: Record<Exclude<PlaceResult, { ok: true }>['reason'], Notice | null> = {
    'not-holding': null,
    blocked: { key: 'place.blocked' },
    'overlaps-player': { key: 'place.overlapsPlayer' },
  };
  let notice: Notice | null = null;
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
    if (frame.device !== 'none') device = frame.device;
    if (hint) hint.textContent = i18n.t(HINT_KEYS[device]);
    if (frame.pause && isLocked()) document.exitPointerLock();
    player.applyLook(frame);

    const aimView = player.view();
    const aim = { origin: aimView.eye, direction: forwardOf(aimView.yaw, aimView.pitch) };
    let prompt = '';
    if (frame.rotate !== 0) grip.rotate(frame.rotate);
    const pushing = cart.pusher() === 'player-0';
    if (pushing) {
      feedback = { state: 'none' };
      prompt = i18n.t('cart.pushing', { loads: cart.loads.length, max: CART_TUNING.maxLoadCount });
      if (frame.interact) cart.stopPush('player-0');
      if (frame.secondary) cart.unloadAll();
    } else if (grip.held !== null) {
      feedback = { state: 'none' };
      const heldId = grip.held;
      const heldProp = props.get(heldId);
      const overBed = heldProp ? cart.isOverBed(world.bodyPosition(heldProp.body)) : false;
      const heldName = nameOf(heldProp?.nameKeys, heldProp?.displayName ?? '');
      prompt = i18n.t(overBed ? 'grip.holdingOverCart' : 'grip.holding', { name: heldName });
      if (frame.interact && overBed) {
        grip.forceRelease();
        const loaded = cart.load(heldId);
        if (!loaded.ok && LOAD_NOTICES[loaded.reason]) {
          notice = LOAD_NOTICES[loaded.reason];
          noticeUntil = now + 1500;
        }
      } else if (frame.interact) {
        const placed = grip.tryPlace(aimView.position);
        if (!placed.ok) {
          notice = PLACE_NOTICES[placed.reason];
          noticeUntil = now + 1500;
        }
      }
    } else if (rover.pickJoint(aim, player.characterHandle)) {
      feedback = { state: 'none' };
      const joint = rover.pickJoint(aim, player.characterHandle);
      if (joint?.available) {
        prompt = i18n.t('cut.ready', { joint: jointLabel(joint.jointId) });
        if (frame.interact) {
          cutCounter += 1;
          rover.cut(joint.jointId, transactionId(`txn-cut${cutCounter.toString(36)}`));
        }
      } else if (joint) {
        const blockers = TEST_YARD_ROVER.joints
          .find((candidate) => candidate.id === joint.jointId)
          ?.requires?.filter((id) => !rover.state.isCut(id))
          .map(jointLabel);
        prompt = i18n.t('cut.blocked', { joints: blockers?.join(i18n.t('list.and')) ?? '' });
      }
    } else {
      const loose = props.targets().filter((target) => !cart.loads.includes(target.id));
      const propPick = pickTarget(aim, loose, world, player.characterHandle);
      const scrapPick = pickTarget(aim, scrap.activeTargets(), world, player.characterHandle);
      const cartPick = pickTarget(
        aim,
        [{ id: cart.id, body: cart.body, position: world.bodyPosition(cart.body) }],
        world,
        player.characterHandle,
      );
      const best = closer(cartPick, closer(propPick, scrapPick));
      if (best && best === cartPick) {
        feedback = { state: 'none' };
        prompt = i18n.t('cart.idle', { loads: cart.loads.length, max: CART_TUNING.maxLoadCount });
        if (frame.interact) cart.startPush('player-0');
        if (frame.secondary) cart.unloadAll();
      } else if (best && best === propPick) {
        feedback = { state: 'none' };
        const target = props.get(best.candidate.id);
        prompt = i18n.t('grip.grab', { name: nameOf(target?.nameKeys, target?.displayName ?? '') });
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
      cart.fixedUpdate(step, { holder: 'player-0', eye, yaw: player.view().yaw });
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
    const cartPosition = world.bodyPosition(cart.body);
    const cartRotation = world.bodyRotation(cart.body);
    cartGroup.position.set(cartPosition.x, cartPosition.y, cartPosition.z);
    cartGroup.quaternion.set(cartRotation.x, cartRotation.y, cartRotation.z, cartRotation.w);
    propView.sync();
    const anchored = new Set(rover.state.anchoredFragments());
    for (const [fragmentId, mesh] of fragmentMeshes) mesh.visible = anchored.has(fragmentId);
    for (const [jointId, marker] of jointMarkers) marker.visible = rover.jointPosition(jointId) !== null;
    scrapView.sync();
    scrapView.highlight(feedback);
    if (feedbackLabel) {
      let scrapText = '';
      if (feedback.state !== 'none') {
        const symbol = feedback.material.symbol;
        const material = materialName(feedback.material.id, feedback.material.displayName);
        if (feedback.state === 'compatible') scrapText = i18n.t('collect.ready', { symbol, material });
        else if (feedback.state === 'blocked') scrapText = i18n.t('collect.containerFull', { symbol });
        else if (feedback.reason === 'too-big') scrapText = i18n.t('collect.tooBig', { symbol });
        else {
          const tools = feedback.collectableBy.map((id) => i18n.tKey(`tool.${id}`, id)).join(', ');
          scrapText = i18n.t('collect.notMagnetic', { symbol, material, tools });
        }
      }
      const showingNotice = notice !== null && now < noticeUntil;
      feedbackLabel.textContent = showingNotice && notice ? i18n.t(notice.key, notice.params) : prompt || scrapText;
      feedbackLabel.dataset['state'] = showingNotice ? 'blocked' : prompt ? 'compatible' : feedback.state;
    }
    canvas.dataset['collected'] = String(container.count);
    canvas.dataset['held'] = grip.held ?? '';
    canvas.dataset['rover'] = JSON.stringify({
      cut: TEST_YARD_ROVER.joints.filter((j) => rover.state.isCut(j.id)).map((j) => j.id),
      chunks: rover.state.chunks().length,
    });
    canvas.dataset['cart'] = JSON.stringify({ loads: cart.loads.length, pushing, recoveries: cart.recoveries });
    if (hud.container) {
      const status = i18n.t('container.status', { count: container.count, capacity: container.capacity });
      hud.container.textContent = container.isFull ? `${status} · ${i18n.t('container.full')}` : status;
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

  return () => {
    renderer.setAnimationLoop(null);
    detachKeyboard();
    canvas.removeEventListener('click', lockPointer);
    window.removeEventListener('resize', resize);
    world.dispose();
    renderer.dispose();
  };
}
