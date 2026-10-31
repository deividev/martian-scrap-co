import {
  BoxGeometry,
  Euler,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  Scene,
  TextureLoader,
  TorusGeometry,
  WebGLRenderer,
  type Object3D,
} from 'three';
import hazardUrl from '../assets/textures/hazard-stripes.png';
import { createRobotModel } from '../models/generated/createRobotModel';
import {
  createBaleModel,
  createCartModel,
  createCompactorModel,
  createIntakeHopperModel,
  createOutputPadModel,
  createSaleTerminalModel,
  createGratePlateModel,
  createSortingBayModel,
} from '../models/machineModels';
import { SCRAP_COLORS, STYLE, createRoverFragmentModel, paint } from '../models/styledModels';
import { FIRST_PASS_CONTENT } from '../content/firstPass';
import { parseContentPack } from '../content/schema';
import { PortableContainer } from '../domain/container';
import { BaseIntake } from '../domain/intake';
import { COMPACTOR_TUNING, Compactor, type Bale } from '../domain/compactor';
import { SaleTerminal, SharedCredits } from '../domain/economy';
import { AssemblyState } from '../domain/assembly';
import { EntityIdAllocator, contentId, transactionId, type ContentId, type EntityId } from '../domain/ids';
import { ToolLoadout } from '../domain/toolLoadout';
import type { I18n, StringKey } from '../i18n/i18n';
import { mergeFrames, type InputDevice } from '../input/actions';
import { GamepadSource } from '../input/gamepadSource';
import { DEFAULT_INPUT_SETTINGS } from '../input/inputSettings';
import { KeyboardMouseSource } from '../input/keyboardMouseSource';
import { MagneticCollector, type TargetFeedback } from '../simulation/collection/magneticCollector';
import { TARGETING, pickTarget, type TargetCandidate, type TargetPick } from '../simulation/collection/targeting';
import { AssemblyBody } from '../simulation/handling/assemblyBody';
import { Breakables, cutYields } from '../simulation/handling/breakables';
import { CART_TUNING, Cart, type LoadResult } from '../simulation/handling/cart';
import { CUTTER_SPEED_TIERS, CUTTER_TIMING, CutProgress, partCutSeconds } from '../simulation/handling/cutterTool';
import { ClaimRegistry } from '../simulation/handling/claims';
import { GripController, type PlaceResult } from '../simulation/handling/gripController';
import { MediumPropSet } from '../simulation/handling/mediumProps';
import { PHYSICS_CONVENTIONS } from '../simulation/physics/conventions';
import { runPhysicsProbe } from '../simulation/physics/probe';
import { createRapierWorld } from '../simulation/physics/rapierWorld';
import { PlayerController } from '../simulation/player/playerController';
import { ScrapField } from '../simulation/scrap/scrapField';
import { addBackdropColliders, createBackdropLayout } from '../simulation/yard/backdrop';
import { ScrapMountain, createScrapMountainLayout, type MountainPieceSpec } from '../simulation/yard/scrapMountain';
import {
  TEST_YARD_BLOCKS,
  TEST_YARD_RECOVERY_ZONES,
  TEST_YARD_ROVER,
  TEST_YARD_ROVER_LAYOUT,
  TEST_YARD_SPAWN,
  TEST_YARD_INTAKE,
  TEST_YARD_COMPACTOR,
  TEST_YARD_SALE_TERMINAL,
  TEST_YARD_SORTING_BAY,
  BALE_HALF_EXTENTS,
  createTestYardBreakables,
  createTestYardProps,
  createTestYardScrap,
  yardBodySpec,
} from '../simulation/yard/testYard';
import { createMarsEnvironment } from './environment';
import { MountainView } from './mountainView';
import { mergeStatic, mergeStaticGroup } from '../models/mergeStatic';
import { FirstPersonTool } from './firstPersonTool';
import { GameHud, type HudMaterialChip } from './hud';
import { PropView } from './propView';
import { ScrapPileView } from './scrapPileView';

export interface TestYardHud {
  readonly hint: HTMLElement | null;
  readonly i18n: I18n;
  readonly feedback: HTMLElement | null;
  /** Root element the gameplay HUD panels are built into. */
  readonly container: HTMLElement | null;
  readonly tip: HTMLElement | null;
}

const HINT_KEYS: Record<InputDevice, StringKey> = {
  'keyboard-mouse': 'hint.keyboard',
  gamepad: 'hint.gamepad',
  none: 'hint.none',
};

/** Something the equipped cutter can work on while use is held. */
interface CutTarget {
  readonly key: string;
  readonly prompt: string;
  readonly name: string;
  readonly seconds: number;
  readonly run: () => void;
}

const COLLECTOR = contentId('magnetic-collector');
const CUTTER = contentId('cutter');

interface Notice {
  readonly key: StringKey;
  readonly params?: Readonly<Record<string, string | number>>;
}

/** Visual color per test-yard block (style pass): Mars ground, painted ramps/steps, dark walls. */
function blockColor(name: string): string {
  if (name.startsWith('ground')) return STYLE.marsGround;
  if (name === 'ramp-50') return STYLE.steelDark;
  if (name.startsWith('ramp')) return STYLE.paintYellow;
  if (name.startsWith('step')) return STYLE.steel;
  return STYLE.steelDark;
}

/**
 * First-person test yard: ramps, steps, a corner and a recovery pit, a scrap pile, medium props, a cart and a
 * cuttable rover, dressed in the approved stylized Mars look with crew robots. Debug data is exposed on the
 * canvas dataset.
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
  const backdrop = createBackdropLayout();
  createMarsEnvironment(scene, renderer, backdrop);

  const camera = new PerspectiveCamera(70, 1, 0.05, 600);
  camera.rotation.order = 'YXZ';
  scene.add(camera);
  const tool = new FirstPersonTool(camera);

  const probeWorld = await createRapierWorld();
  canvas.dataset['physicsProbe'] = JSON.stringify(runPhysicsProbe(probeWorld));
  probeWorld.dispose();

  const world = await createRapierWorld();
  addBackdropColliders(world, backdrop);
  for (const block of TEST_YARD_BLOCKS) {
    world.addBox(yardBodySpec(block));
    const { x, y, z } = block.halfExtents;
    const mesh = new Mesh(new BoxGeometry(x * 2, y * 2, z * 2), paint(blockColor(block.name), 0.85));
    mesh.receiveShadow = true;
    mesh.castShadow = !block.name.startsWith('ground');
    mesh.position.set(block.position.x, block.position.y, block.position.z);
    if (block.rotation) mesh.quaternion.set(block.rotation.x, block.rotation.y, block.rotation.z, block.rotation.w);
    scene.add(mesh);
  }

  // Hazard-stripe work zone at the base; the bundled texture also proves packaged asset loading (MSC-007).
  const hazardMaterial = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 });
  new TextureLoader().load(hazardUrl, (texture) => {
    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.repeat.set(10, 1);
    hazardMaterial.map = texture;
    hazardMaterial.needsUpdate = true;
    canvas.dataset['assetsLoaded'] = 'true';
  });
  for (const [x, z, length, rotated] of [
    [0, 8.2, 10, false],
    [-5, 4, 8, true],
    [5, 4, 8, true],
  ] as const) {
    const strip = new Mesh(new PlaneGeometry(length, 0.35), hazardMaterial);
    strip.rotation.set(-Math.PI / 2, 0, rotated ? Math.PI / 2 : 0);
    strip.position.set(x, 0.01, z);
    strip.receiveShadow = true;
    scene.add(strip);
  }

  // Crew robots (same body, color variants; color is not a class) idling around the yard.
  const crew = (
    [
      ['teal', -3.5, 1.5, 0.6, 'happy'],
      ['yellow', 6.5, 4.5, -2.4, 'surprised'],
      ['purple', -8.5, 6.5, 1.2, 'focused'],
    ] as const
  ).map(([color, x, z, yaw, expression], index) => {
    const robot = createRobotModel(color);
    robot.position.set(x, 0, z);
    robot.rotation.y = yaw;
    robot.userData.sculptRuntime.setExpression(expression);
    world.addBox({ kind: 'fixed', position: { x, y: 0.8, z }, halfExtents: { x: 0.45, y: 0.8, z: 0.35 } });
    robot.traverse((child) => {
      child.castShadow = true;
    });
    // Only the pivots the idle loop animates stay separate; the rest of the body is batched.
    const { pivots: rig } = robot.userData.sculptRuntime;
    const pivots = new Set<Object3D>([rig.hips, rig.head, rig.shoulderL]);
    scene.add(mergeStatic(robot, (object) => pivots.has(object)));
    return { robot, phase: index * 1.7 };
  });

  const player = new PlayerController(
    world,
    TEST_YARD_SPAWN,
    PHYSICS_CONVENTIONS.marsGravity,
    TEST_YARD_RECOVERY_ZONES,
  );
  const allocator = new EntityIdAllocator();
  // Owner follow-up R4: the giant mountain is real pieces (large, medium and small) with real colliders, settled
  // offline with the game's physics (it includes the starter spill at its foot).
  const mountainLayout = createScrapMountainLayout(allocator);
  /** Small mountain pieces hold colliders within this radius of the player, meters (dense mountain, sim budget). */
  const MOUNTAIN_SOLIDS = { radius: 10, hysteresis: 4, perFrame: 120 } as const;
  const scrap = new ScrapField(world, [createTestYardScrap(allocator), ...mountainLayout.smallClusters]);
  scrap.streamSolids([TEST_YARD_SPAWN], MOUNTAIN_SOLIDS.radius, MOUNTAIN_SOLIDS.hysteresis);
  const mountain = new ScrapMountain(world, mountainLayout.pieces);
  const mountainView = new MountainView(
    scene,
    mountain,
    scrap,
    mountainLayout.smallClusters.flatMap((cluster) => cluster.pieces.map((piece) => piece.id)),
  );
  scrap.activateCluster('test-yard-pile');
  const scrapView = new ScrapPileView(scene, scrap, world);
  const container = new PortableContainer();
  const collector = new MagneticCollector(content.pack, scrap, world, {
    remaining: () => container.capacity - container.count,
    isEmpty: () => container.count === 0,
    canAccept: (id) => container.canAccept(id),
    accept: (item) => void container.add(item),
  });
  let feedback: TargetFeedback = { state: 'none' };
  const loadout = new ToolLoadout(
    [COLLECTOR, CUTTER],
    [...content.pack.tools.values()].filter((entry) => entry.freeBaseline).map((entry) => entry.id),
  );
  // Test-yard stand-in: the cutter is granted up front until the shared-credit store sells it.
  loadout.grant(CUTTER);
  let cutterTier = 0;
  const cutting = new CutProgress();
  const toolName = (id: string): string => i18n.tKey(`tool.${id}`, id);
  const gameHud = hud.container ? new GameHud(hud.container) : null;
  const collectorTiers = content.pack.tools.get(COLLECTOR)?.upgradeTiers ?? [];
  const materialChip = (id: string): HudMaterialChip => {
    const material = content.pack.materials.get(id as ContentId);
    const tier = collector.selector.tierOf(id as ContentId) ?? 0;
    return {
      id,
      symbol: material?.symbol ?? '?',
      name: materialName(id, material?.displayName ?? id),
      color: SCRAP_COLORS[id] ?? '#ffffff',
      level: tier + 1,
      unlocked: tier <= collector.selector.tier,
    };
  };

  const props = new MediumPropSet(world, createTestYardProps(allocator));
  const claims = new ClaimRegistry();
  const grip = new GripController(world, props, claims, 'player-0');
  const breakables = new Breakables(
    props,
    scrap,
    world,
    claims,
    () => allocator.allocate(),
    createTestYardBreakables(allocator),
  );
  // Every material has its own bin; ceramic never arrives by container but would be routed the same way.
  const intake = new BaseIntake();
  // Static base models are batched into a few meshes (draw-call budget).
  const baseStatics: Object3D[] = [];
  const hopper = createIntakeHopperModel();
  hopper.position.set(TEST_YARD_INTAKE.position.x, 0, TEST_YARD_INTAKE.position.z);
  hopper.rotation.y = Math.PI;
  // Sorting bay next to the hopper: one bay per material, its pile follows the bin count (MSC-031 visuals).
  const bayMaterials = [...content.pack.materials.keys()];
  const sortingBay = createSortingBayModel(bayMaterials);
  sortingBay.position.set(TEST_YARD_SORTING_BAY.position.x, 0, TEST_YARD_SORTING_BAY.position.z);
  sortingBay.rotation.y = Math.PI;
  baseStatics.push(sortingBay);
  // Grated work floor with yellow edges in front of the base line (concept sorting bay floor).
  for (let x = -6.2; x <= 9.4; x += 1.4) {
    if (Math.abs(x - TEST_YARD_COMPACTOR.pad.x) < 1.3) continue;
    const plate = createGratePlateModel(1.36, 1.2);
    plate.position.set(x, 0, 7.85);
    baseStatics.push(plate);
  }
  world.addBox({
    kind: 'fixed',
    position: { ...TEST_YARD_SORTING_BAY.position, y: TEST_YARD_SORTING_BAY.halfExtents.y },
    halfExtents: TEST_YARD_SORTING_BAY.halfExtents,
  });
  baseStatics.push(hopper);
  world.addBox({
    kind: 'fixed',
    position: { x: TEST_YARD_INTAKE.position.x, y: TEST_YARD_INTAKE.halfExtents.y, z: TEST_YARD_INTAKE.position.z },
    halfExtents: TEST_YARD_INTAKE.halfExtents,
  });
  // MSC-032: the compactor presses full bins into one-material bales on its output pad.
  const bales = new Map<EntityId, Bale>();
  const compactor = new Compactor(intake, [...content.pack.materials.keys()], () => allocator.allocate());
  const compactorModel = createCompactorModel();
  compactorModel.position.set(TEST_YARD_COMPACTOR.position.x, 0, TEST_YARD_COMPACTOR.position.z);
  compactorModel.rotation.y = Math.PI;
  scene.add(mergeStatic(compactorModel, (object) => object.name === 'press-head' || object.name === 'status-lamp'));
  const padModel = createOutputPadModel();
  padModel.position.set(TEST_YARD_COMPACTOR.pad.x, 0, TEST_YARD_COMPACTOR.pad.z);
  baseStatics.push(padModel);
  const pressHead = compactorModel.getObjectByName('press-head');
  const statusLamp = compactorModel.getObjectByName('status-lamp') as Mesh | undefined;
  const lampMaterial = statusLamp ? (statusLamp.material as MeshStandardMaterial).clone() : null;
  if (statusLamp && lampMaterial) statusLamp.material = lampMaterial;
  world.addBox({
    kind: 'fixed',
    position: {
      x: TEST_YARD_COMPACTOR.position.x,
      y: TEST_YARD_COMPACTOR.halfExtents.y,
      z: TEST_YARD_COMPACTOR.position.z,
    },
    halfExtents: TEST_YARD_COMPACTOR.halfExtents,
  });
  const padClear = (): boolean =>
    !props.all().some((prop) => {
      const p = world.bodyPosition(prop.body);
      return (
        Math.hypot(p.x - TEST_YARD_COMPACTOR.pad.x, p.z - TEST_YARD_COMPACTOR.pad.z) < TEST_YARD_COMPACTOR.padRadius &&
        p.y < 1.5
      );
    });
  // MSC-033: the sale machine turns a bale into shared credits almost at once (host-owned ledger).
  const sharedCredits = new SharedCredits();
  const saleTerminal = new SaleTerminal(
    sharedCredits,
    (material) => content.pack.materials.get(material)?.saleValuePerUnit,
  );
  const terminalModel = createSaleTerminalModel();
  terminalModel.position.set(TEST_YARD_SALE_TERMINAL.position.x, 0, TEST_YARD_SALE_TERMINAL.position.z);
  terminalModel.rotation.y = Math.PI;
  baseStatics.push(terminalModel);
  scene.add(mergeStaticGroup(baseStatics));
  world.addBox({
    kind: 'fixed',
    position: {
      x: TEST_YARD_SALE_TERMINAL.position.x,
      y: TEST_YARD_SALE_TERMINAL.halfExtents.y,
      z: TEST_YARD_SALE_TERMINAL.position.z,
    },
    halfExtents: TEST_YARD_SALE_TERMINAL.halfExtents,
  });
  let saleCounter = 0;
  let lastGain: { credits: number; until: number } | null = null;
  let wasSucking = false;
  let lastActivation = 0;
  let lastTouch = 0;
  /** Mountain wake tuning (owner check 2026-10-30; placeholders within the MSC-019 budgets). */
  const MOUNTAIN_WAKE = { settleDistance: 7, activeBudget: 260, touchReach: 0.65 } as const;
  const cart = new Cart(world, props, claims, allocator.allocate(), { x: 2, y: 0.4, z: 5 });
  const cartGroup = createCartModel(CART_TUNING.halfExtents);
  scene.add(mergeStatic(cartGroup));
  const LOAD_NOTICES: Record<Exclude<LoadResult, { ok: true }>['reason'], Notice | null> = {
    full: { key: 'cart.full', params: { max: CART_TUNING.maxLoadCount } },
    'too-heavy': { key: 'cart.tooHeavy' },
    'already-loaded': null,
    claimed: { key: 'cart.claimed' },
    unknown: null,
  };
  const propView = new PropView(scene, props, world, (prop) =>
    bales.has(prop.id) ? mergeStatic(createBaleModel(prop.materialId, prop.halfExtents)) : null,
  );
  const rover = new AssemblyBody(
    world,
    props,
    new AssemblyState(TEST_YARD_ROVER, () => allocator.allocate()),
    TEST_YARD_ROVER_LAYOUT,
  );
  const fragmentMeshes = new Map(
    rover.state.anchoredFragments().map((fragmentId) => {
      const placement = TEST_YARD_ROVER_LAYOUT.fragments[fragmentId];
      const model = createRoverFragmentModel(fragmentId, placement?.halfExtents ?? { x: 0.1, y: 0.1, z: 0.1 });
      if (placement) model.position.set(placement.position.x, placement.position.y, placement.position.z);
      scene.add(mergeStatic(model));
      return [fragmentId, model] as const;
    }),
  );
  // Joints read as glowing orange rings that face the player and pulse gently (cut discoverability).
  const jointMaterial = new MeshStandardMaterial({ color: '#ff8a2a', emissive: '#ff6a00', emissiveIntensity: 0.9 });
  const jointMarkers = new Map(
    TEST_YARD_ROVER.joints.map((joint) => {
      const marker = new Mesh(new TorusGeometry(0.1, 0.028, 6, 18), jointMaterial);
      const position = TEST_YARD_ROVER_LAYOUT.joints[joint.id];
      if (position) marker.position.set(position.x, position.y, position.z);
      scene.add(marker);
      return [joint.id, marker] as const;
    }),
  );
  let cutCounter = 0;
  const cutAnchors = new Set<string>();
  const fragmentParts = (ids: readonly string[]) =>
    TEST_YARD_ROVER.fragments.filter((fragment) => ids.includes(fragment.id));
  const selectedName = (): string => {
    const id = collector.selector.selected;
    const material = content.pack.materials.get(id);
    return `${material?.symbol ?? '?'} ${materialName(id, material?.displayName ?? id)}`;
  };
  const jointLabel = (id: string): string => i18n.tKey(`joint.${id}`, id);
  const mountainName = (piece: MountainPieceSpec): string =>
    i18n.t(piece.size === 'large' ? 'mountain.large' : 'mountain.medium', {
      material: materialName(piece.materialId, piece.materialId),
    });
  /** Metals are cut, everything else is broken open (same rule as the yard junk). */
  const METALS = new Set(['ferrous', 'aluminum', 'copper']);
  const releasedParts = new Map<EntityId, MountainPieceSpec>();
  /** A medium part that left the pile becomes an ordinary breakable prop (and falls if it was on top). */
  const partToProp = (piece: MountainPieceSpec) => {
    releasedParts.set(piece.id, piece);
    scrap.wakeAbove(piece);
    const prop = props.add(
      {
        id: piece.id,
        materialId: piece.materialId,
        displayName: 'Mountain part',
        position: piece.position,
        halfExtents: piece.halfExtents,
        massKg: piece.massKg,
      },
      piece.rotation,
    );
    breakables.registerExisting(piece.id, cutYields([piece]), METALS.has(piece.materialId) ? 'cut' : 'break');
    return prop;
  };
  /** Takes an exposed medium part out of the pile; parts resting on it are freed to fall. */
  const releaseToProp = (id: EntityId) => {
    const left = mountain.release(id);
    if (!left) return null;
    for (const freed of left.freed) partToProp(freed);
    return partToProp(left.piece);
  };
  const propLabel = (id: EntityId): string => {
    const part = releasedParts.get(id);
    if (part) return mountainName(part);
    const bale = bales.get(id);
    if (bale) {
      return i18n.t('bale.name', {
        material: materialName(bale.materialId, bale.materialId),
        count: bale.pieceIds.length,
      });
    }
    const prop = props.get(id);
    return nameOf(prop?.nameKeys, prop?.displayName ?? '');
  };
  const nearTerminal = (view: { position: { x: number; z: number }; yaw: number }): boolean => {
    const dx = TEST_YARD_SALE_TERMINAL.position.x - view.position.x;
    const dz = TEST_YARD_SALE_TERMINAL.position.z - view.position.z;
    if (Math.hypot(dx, dz) > TEST_YARD_SALE_TERMINAL.reach) return false;
    // Roughly facing the machine (within 50°).
    const facing = -Math.sin(view.yaw) * dx + -Math.cos(view.yaw) * dz;
    return facing / Math.max(Math.hypot(dx, dz), 0.001) > Math.cos((50 * Math.PI) / 180);
  };
  const jobText = (): string => {
    const heldBale = grip.held !== null && bales.has(grip.held);
    if (heldBale) return i18n.t('job.sellBale');
    if (bales.size > 0) return i18n.t('job.takeBale');
    if (compactor.state.kind !== 'idle') return i18n.t('job.pressing');
    if (container.count > 0) return i18n.t('job.unload');
    const fullest = intake.batches().sort((a, b) => b.count - a.count)[0];
    if (fullest) {
      return i18n.t('job.fillBin', {
        missing: Math.max(1, COMPACTOR_TUNING.balePieces - fullest.count),
        material: materialName(fullest.materialId, fullest.materialId),
      });
    }
    return i18n.t('job.vacuum', { material: selectedName() });
  };
  const symbolOf = (id: ContentId): string => content.pack.materials.get(id)?.symbol ?? '?';
  const compactorLine = (): { label: string; progress: number | null } => {
    const state = compactor.state;
    switch (state.kind) {
      case 'idle':
        return { label: i18n.t('compactor.idle', { size: COMPACTOR_TUNING.balePieces }), progress: null };
      case 'loading':
        return { label: i18n.t('compactor.loading', { symbol: symbolOf(state.materialId) }), progress: state.progress };
      case 'processing':
        return {
          label: i18n.t('compactor.processing', { symbol: symbolOf(state.materialId) }),
          progress: state.progress,
        };
      case 'blocked':
        return { label: i18n.t('compactor.blocked'), progress: 1 };
    }
  };
  const batchList = (batches: readonly { materialId: ContentId; count: number }[]): string =>
    batches.map((batch) => `${batch.count} ${content.pack.materials.get(batch.materialId)?.symbol ?? '?'}`).join(' · ');
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

  const simSamples: number[] = [];
  /** CPU milliseconds per frame section and the frame interval, last 600 frames (spike hunting). */
  const FRAME_SECTIONS = ['interval', 'logic', 'sim', 'views', 'render', 'cpu'] as const;
  const frameSamples = new Map<(typeof FRAME_SECTIONS)[number], number[]>(FRAME_SECTIONS.map((s) => [s, []]));
  const sampleFrame = (section: (typeof FRAME_SECTIONS)[number], ms: number): void => {
    const samples = frameSamples.get(section);
    if (!samples) return;
    samples.push(ms);
    if (samples.length > 600) samples.shift();
  };
  let lastPerf = 0;
  /** Frames rendered since the last perf sample (FPS readout). */
  let perfFrames = 0;
  let device: InputDevice = 'none';
  let accumulator = 0;
  let previous = performance.now();
  const step = PHYSICS_CONVENTIONS.fixedStepSeconds;
  const euler = new Euler(0, 0, 0, 'YXZ');

  renderer.setAnimationLoop((now) => {
    const frameStart = performance.now();
    sampleFrame('interval', now - previous);
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
    let highlightedProp: EntityId | null = null;
    let secondaryUsed = false;
    let cutTarget: CutTarget | null = null;
    if (frame.rotate !== 0) grip.rotate(frame.rotate);
    if (frame.toolSlot !== null || frame.cycleTool) {
      const slotTool = frame.toolSlot === null ? undefined : loadout.slots[frame.toolSlot];
      const equipped = frame.toolSlot === null ? { ok: true as const } : loadout.equipSlot(frame.toolSlot);
      if (frame.toolSlot === null) loadout.cycle();
      notice =
        equipped.ok || slotTool === undefined
          ? { key: 'tool.equipped', params: { tool: toolName(loadout.equipped) } }
          : { key: 'tool.notOwned', params: { tool: toolName(slotTool) } };
      noticeUntil = now + 1500;
    }
    const cutterInHand = loadout.equipped === CUTTER;
    // The wheel switches the collector material only while the collector is in hand.
    if (frame.cycleMaterial !== 0 && loadout.equipped === COLLECTOR) {
      if (collector.selector.available().length === 1) notice = { key: 'selector.onlyOne' };
      else {
        const selected = collector.selector.cycle(frame.cycleMaterial);
        notice = selected.ok
          ? { key: 'selector.selected', params: { material: selectedName() } }
          : { key: 'selector.locked' };
      }
      noticeUntil = now + 2000;
    }
    if (frame.upgrade && cutterInHand) {
      const top = cutterTier >= CUTTER_SPEED_TIERS.length - 1;
      if (!top) cutterTier += 1;
      notice = top
        ? { key: 'cutter.maxTier' }
        : { key: 'cutter.upgraded', params: { tier: cutterTier + 1, speed: CUTTER_SPEED_TIERS[cutterTier] ?? 1 } };
      noticeUntil = now + 3000;
    } else if (frame.upgrade) {
      const unlocked = collector.selector.upgrade();
      notice =
        unlocked.length === 0
          ? { key: 'selector.maxTier' }
          : {
              key: 'selector.upgraded',
              params: {
                tier: collector.selector.tier + 1,
                list: unlocked
                  .map((id) => materialName(id, content.pack.materials.get(id)?.displayName ?? id))
                  .join(i18n.t('list.and')),
              },
            };
      noticeUntil = now + 3000;
    }
    const pushing = cart.pusher() === 'player-0';
    if (pushing) {
      feedback = { state: 'none' };
      prompt = i18n.t('cart.pushing', { loads: cart.loads.length, max: CART_TUNING.maxLoadCount });
      if (frame.interact) cart.stopPush('player-0');
      if (frame.secondary) {
        cart.unloadAll();
        secondaryUsed = true;
      }
    } else if (grip.held !== null) {
      feedback = { state: 'none' };
      const heldId = grip.held;
      const heldProp = props.get(heldId);
      const overBed = heldProp ? cart.isOverBed(world.bodyPosition(heldProp.body)) : false;
      const heldName = propLabel(heldId);
      prompt = i18n.t(overBed ? 'grip.holdingOverCart' : 'grip.holding', { name: heldName });
      const heldBale = bales.get(heldId);
      const saleQuote = heldBale && nearTerminal(aimView) ? saleTerminal.quote(heldBale) : null;
      if (heldBale && saleQuote) {
        prompt = i18n.t('sale.preview', { bale: heldName, credits: saleQuote.credits });
      }
      if (frame.interact && heldBale && saleQuote) {
        saleCounter += 1;
        const sale = saleTerminal.sell(heldBale, transactionId(`txn-sale${saleCounter.toString(36)}`), () => {
          if (grip.held !== heldId || !props.get(heldId)) return false;
          grip.forceRelease();
          props.remove(heldId);
          bales.delete(heldId);
          return true;
        });
        if (sale.ok) {
          tool.use();
          lastGain = { credits: sale.quote.credits, until: now + 2500 };
          notice = { key: 'sale.done', params: { bale: heldName, credits: sale.quote.credits } };
        } else {
          notice = { key: 'sale.failed' };
        }
        noticeUntil = now + 2500;
      } else if (frame.interact && overBed) {
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
        const jointId = joint.jointId;
        const name = jointLabel(jointId);
        cutTarget = {
          key: `joint:${jointId}`,
          prompt: i18n.t('cut.ready', { joint: name }),
          name,
          seconds: CUTTER_TIMING.jointSeconds,
          run: () => {
            cutCounter += 1;
            const cut = rover.cut(jointId, transactionId(`txn-cut${cutCounter.toString(36)}`));
            if (!cut.ok) return;
            for (const retired of cut.retired) breakables.forget(retired);
            for (const created of cut.created) {
              if (props.get(created.entityId) && !breakables.isBreakable(created.entityId)) {
                breakables.registerExisting(created.entityId, cutYields(fragmentParts(created.fragments)));
              }
            }
          },
        };
      } else if (joint) {
        const blockers = TEST_YARD_ROVER.joints
          .find((candidate) => candidate.id === joint.jointId)
          ?.requires?.filter((id) => !rover.state.isCut(id))
          .map(jointLabel);
        prompt = i18n.t('cut.blocked', { joints: blockers?.join(i18n.t('list.and')) ?? '' });
      }
    } else if (rover.aimsAtIsolatedAnchor(aim, player.characterHandle)) {
      // The bare frame is a large part: the magnet ignores it until it is cut into small pieces.
      feedback = { state: 'none' };
      const anchor = rover.isolatedAnchor();
      if (anchor) {
        const name = i18n.tKey(TEST_YARD_ROVER_LAYOUT.fragmentNameKeys?.[anchor.fragmentId] ?? '', anchor.fragmentId);
        const massKg = fragmentParts([anchor.fragmentId]).reduce((sum, part) => sum + part.massKg, 0);
        cutTarget = {
          key: `anchor:${anchor.fragmentId}`,
          prompt: i18n.t('cut.intoPieces', { name }),
          name,
          seconds: partCutSeconds(massKg),
          run: () => {
            const removed = rover.removeIsolatedAnchor();
            if (!removed) return;
            cutAnchors.add(removed.fragmentId);
            breakables.shatter(
              removed.position,
              cutYields(fragmentParts([removed.fragmentId])),
              `cut-${removed.fragmentId}`,
            );
          },
        };
      }
    } else {
      const loose = props.targets().filter((target) => !cart.loads.includes(target.id));
      // What the crosshair touches wins; the aim cone only helps when it touches nothing interactable (the
      // mountain is full of pieces, so a near piece must never steal the aim from the part in front of you).
      const aimHit = world.castRay(aim.origin, aim.direction, TARGETING.reachMeters, player.characterHandle);
      const direct = (candidates: readonly TargetCandidate[]): TargetPick | null => {
        const candidate = aimHit && candidates.find((target) => target.body === aimHit.body);
        return candidate && aimHit ? { candidate, distance: aimHit.distance, angle: 0 } : null;
      };
      const propPick = direct(loose) ?? pickTarget(aim, loose, world, player.characterHandle);
      const scrapTargets = scrap.targetsNear(aim.origin, TARGETING.reachMeters);
      const scrapPick = direct(scrapTargets) ?? pickTarget(aim, scrapTargets, world, player.characterHandle);
      const cartPick = pickTarget(
        aim,
        [{ id: cart.id, body: cart.body, position: world.bodyPosition(cart.body) }],
        world,
        player.characterHandle,
      );
      const mountainTargets = mountain.targetsNear(aim.origin, 4);
      const mountainPick = direct(mountainTargets) ?? pickTarget(aim, mountainTargets, world, player.characterHandle);
      const best = closer(cartPick, closer(mountainPick, closer(propPick, scrapPick)));
      if (best && best === cartPick) {
        feedback = { state: 'none' };
        prompt = i18n.t('cart.idle', { loads: cart.loads.length, max: CART_TUNING.maxLoadCount });
        if (frame.interact) cart.startPush('player-0');
        if (frame.secondary) {
          cart.unloadAll();
          secondaryUsed = true;
        }
      } else if (best && best === mountainPick) {
        feedback = { state: 'none' };
        const partId = best.candidate.id;
        const piece = mountain.piece(partId);
        if (piece) {
          const name = mountainName(piece);
          const metal = METALS.has(piece.materialId);
          if (!mountain.exposed(partId)) {
            prompt = i18n.t('mountain.buried', { name });
          } else if (piece.size === 'large') {
            // Large parts are cut where they lie into small pieces of their material.
            cutTarget = {
              key: `mountain:${partId}`,
              prompt: i18n.t('cut.intoPieces', { name }),
              name,
              seconds: partCutSeconds(piece.massKg),
              run: () => {
                const left = mountain.remove(partId);
                if (!left) return;
                scrap.wakeAbove(left.piece);
                for (const freed of left.freed) partToProp(freed);
                breakables.shatter(left.piece.position, cutYields([left.piece]), `cut-${partId}`);
              },
            };
          } else if (cutterInHand) {
            cutTarget = {
              key: `mountain:${partId}`,
              prompt: i18n.t(metal ? 'cut.intoPieces' : 'cut.breakOpen', { name }),
              name,
              seconds: partCutSeconds(piece.massKg),
              run: () => {
                if (releaseToProp(partId)) breakables.break(partId);
              },
            };
          } else {
            prompt = i18n.t(metal ? 'grip.grabOrCut' : 'grip.grabOrBreak', { name });
            if (frame.interact) {
              const prop = releaseToProp(partId);
              if (prop) {
                grip.tryGrab(
                  {
                    candidate: { id: partId, body: prop.body, position: piece.position },
                    distance: best.distance,
                    angle: best.angle,
                  },
                  aimView.yaw,
                );
              }
            }
          }
        }
      } else if (best && best === propPick) {
        feedback = { state: 'none' };
        const target = props.get(best.candidate.id);
        const targetName = propLabel(best.candidate.id);
        const propId = best.candidate.id;
        const breakable = breakables.isBreakable(propId);
        const method = breakables.method(propId);
        highlightedProp = propId;
        if (breakable && cutterInHand) {
          // With the cutter in hand, holding use cuts or breaks the part; switch to the collector to grab it.
          cutTarget = {
            key: `prop:${propId}`,
            prompt: i18n.t(method === 'cut' ? 'cut.intoPieces' : 'cut.breakOpen', { name: targetName }),
            name: targetName,
            seconds: partCutSeconds(target?.massKg ?? 0),
            run: () => void breakables.break(propId),
          };
        } else {
          prompt = i18n.t(!breakable ? 'grip.grab' : method === 'cut' ? 'grip.grabOrCut' : 'grip.grabOrBreak', {
            name: targetName,
          });
          if (frame.interact) grip.tryGrab(best, aimView.yaw);
        }
      } else {
        feedback = collector.evaluate(scrapPick);
        if (cutterInHand && feedback.state !== 'none') {
          prompt = i18n.t('collect.needCollector', {
            symbol: feedback.material.symbol,
            material: materialName(feedback.material.id, feedback.material.displayName),
          });
          feedback = { state: 'none' };
        } else if (frame.interactHeld) tool.use();
      }
    }
    // The cutter works only while use is held on one target; releasing or looking away restarts the cut.
    const cutTick = cutting.update(
      cutTarget?.key ?? null,
      cutterInHand && frame.interactHeld,
      dt,
      cutTarget?.seconds ?? 0,
      CUTTER_SPEED_TIERS[cutterTier] ?? 1,
    );
    if (cutTarget && !cutterInHand) {
      prompt = i18n.t('cut.needCutter', { name: cutTarget.name });
    } else if (cutTarget) {
      prompt =
        cutTick.progress > 0 && !cutTick.done
          ? i18n.t('cut.progress', { name: cutTarget.name, percent: Math.floor(cutTick.progress * 100) })
          : cutTarget.prompt;
      if (cutTick.done) {
        cutTarget.run();
        tool.use();
      }
    }
    // Holding use vacuums whatever the aim prefers (a prop or the cart nearby), unless something is held.
    if (frame.interactHeld && !pushing && grip.held === null && !cutterInHand) {
      collector.suck(aim, player.characterHandle);
    }
    if (wasSucking && !frame.interactHeld) collector.cancelPull();
    wasSucking = frame.interactHeld;

    const nearIntake =
      Math.hypot(aimView.position.x - TEST_YARD_INTAKE.position.x, aimView.position.z - TEST_YARD_INTAKE.position.z) <
      TEST_YARD_INTAKE.reach;
    // MSC-031: one action unloads the whole batch; the intake classifies it and anything that does not fit stays.
    const unloadPlan = nearIntake && container.count > 0 ? intake.preview(container.items()) : null;
    if (frame.secondary && !secondaryUsed && grip.held === null) {
      if (unloadPlan && unloadPlan.acceptedIds.length > 0) {
        const result = intake.receive(container.take(unloadPlan.acceptedIds));
        const kept = container.count;
        notice =
          kept > 0
            ? { key: 'unload.partial', params: { count: result.accepted, kept } }
            : { key: 'unload.done', params: { count: result.accepted } };
      } else if (unloadPlan) {
        notice = { key: 'intake.binsFull' };
      } else {
        notice = { key: container.count === 0 ? 'unload.empty' : 'unload.needIntake' };
      }
      noticeUntil = now + 2500;
    }
    if (nearIntake && !prompt && feedback.state === 'none') {
      if (!unloadPlan) prompt = i18n.t('intake.prompt');
      else if (unloadPlan.acceptedIds.length === 0) prompt = i18n.t('intake.binsFull');
      else {
        const list = batchList(unloadPlan.accepted);
        const kept = unloadPlan.kept.reduce((sum, batch) => sum + batch.count, 0);
        prompt = kept > 0 ? i18n.t('intake.previewKept', { list, kept }) : i18n.t('intake.preview', { list });
      }
    }
    if (!prompt && grip.held === null && feedback.state === 'none' && nearTerminal(aimView)) {
      prompt = i18n.t('sale.needBale');
    }

    // Wake clusters near the player and let distant ones sleep (MSC-012 activation). The mountain is different:
    // its settled pieces stay fixed until disturbed (collector, player, lost support), so nothing moves on its own.
    if (now - lastActivation > 500) {
      lastActivation = now;
      for (const cluster of scrap.clusterCenters({ solid: false })) {
        if (cluster.remaining === 0) continue;
        const distance = Math.hypot(aimView.position.x - cluster.x, aimView.position.z - cluster.z);
        if (distance < 16) scrap.activateCluster(cluster.id);
        else if (distance > 22 && !collector.pulling.some((id) => scrap.piece(id) && scrap.bodyOf(id))) {
          scrap.deactivateCluster(cluster.id);
        }
      }
      // Disturbed mountain pieces that came to rest away from the player become fixed again where they lie.
      scrap.settleFar(aimView.position, MOUNTAIN_WAKE.settleDistance, new Set(collector.pulling));
      // Only the mountain around the player holds colliders (each costs simulation time even at rest).
      scrap.streamSolids([aimView.position], MOUNTAIN_SOLIDS.radius, MOUNTAIN_SOLIDS.hysteresis, 0);
    }
    // Queued colliders arrive a few per frame (a whole cluster at once is a frame-time spike).
    scrap.pumpSolids(MOUNTAIN_SOLIDS.perFrame);
    // Pieces the player walks into are pushed for real (while the active-piece budget allows).
    if (now - lastTouch > 100 && scrap.activeCount < MOUNTAIN_WAKE.activeBudget) {
      lastTouch = now;
      const { x, y, z } = aimView.position;
      const reach = MOUNTAIN_WAKE.touchReach;
      scrap.disturbWithin({
        min: { x: x - reach, y: y - 1.05, z: z - reach },
        max: { x: x + reach, y: y + 0.9, z: z + reach },
      });
    }

    // MSC-032: the compactor runs on its own; a finished bale waits inside while the pad is occupied.
    const ejected = compactor.update(dt, padClear());
    if (ejected) {
      bales.set(ejected.id, ejected);
      props.add({
        id: ejected.id,
        materialId: ejected.materialId,
        displayName: 'Bale',
        position: { x: TEST_YARD_COMPACTOR.pad.x, y: BALE_HALF_EXTENTS.y + 0.1, z: TEST_YARD_COMPACTOR.pad.z },
        halfExtents: BALE_HALF_EXTENTS,
        massKg: Math.max(ejected.massKg, 1),
      });
      notice = {
        key: 'compactor.baleReady',
        params: { material: materialName(ejected.materialId, ejected.materialId) },
      };
      noticeUntil = now + 3000;
    }
    const press = compactor.state;
    if (pressHead) {
      pressHead.position.y = press.kind === 'processing' ? 1.62 - Math.sin(press.progress * Math.PI) * 0.4 : 1.62;
    }
    for (const material of bayMaterials) {
      sortingBay.userData.bay.setFill(material, intake.binCount(material) / intake.binCapacity);
    }
    lampMaterial?.emissive.set(
      press.kind === 'idle' ? STYLE.heliofoil : press.kind === 'blocked' ? '#ff3b2f' : STYLE.paintOrange,
    );

    // Fixed-step simulation with bounded catch-up.
    accumulator = Math.min(accumulator + dt, step * 5);
    const simStart = performance.now();
    sampleFrame('logic', simStart - frameStart);
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
    const viewsStart = performance.now();
    simSamples.push(viewsStart - simStart);
    if (simSamples.length > 600) simSamples.shift();
    sampleFrame('sim', viewsStart - simStart);

    const view = player.view();
    camera.position.set(view.eye.x, view.eye.y, view.eye.z);
    euler.set(view.pitch, view.yaw, 0);
    camera.quaternion.setFromEuler(euler);
    // Crew idle: gentle bob and head tilt.
    for (const member of crew) {
      const runtime = member.robot.userData.sculptRuntime;
      const t = now / 1000 + member.phase;
      runtime.pivots.hips.position.y = 0.36 + Math.sin(t * 2) * 0.012;
      runtime.pivots.head.rotation.z = Math.sin(t * 0.9) * 0.08;
      runtime.pivots.shoulderL.rotation.x = Math.sin(t * 1.3) * 0.1;
    }
    for (const marker of jointMarkers.values()) {
      marker.lookAt(camera.position);
      marker.scale.setScalar(1 + Math.sin(now / 250) * 0.12);
    }
    const cartPosition = world.bodyPosition(cart.body);
    const cartRotation = world.bodyRotation(cart.body);
    cartGroup.position.set(cartPosition.x, cartPosition.y, cartPosition.z);
    cartGroup.quaternion.set(cartRotation.x, cartRotation.y, cartRotation.z, cartRotation.w);
    propView.sync();
    propView.highlight(highlightedProp);
    tool.setMode(grip.held !== null ? 'hands' : cutterInHand ? 'cutter' : 'magnet');
    tool.update(dt, frame.move.x !== 0 || frame.move.y !== 0, cutting.target !== null);
    if (hud.tip) {
      const near = (x: number, z: number, radius: number): boolean =>
        Math.hypot(view.position.x - x, view.position.z - z) < radius;
      const allCut = rover.state.availableJoints().length === 0;
      hud.tip.textContent =
        grip.held === null && container.count > 0 && near(TEST_YARD_INTAKE.position.x, TEST_YARD_INTAKE.position.z, 5)
          ? i18n.t('intake.prompt')
          : grip.held === null && near(-6, 4, 5) && (!allCut || rover.isolatedAnchor() !== null)
            ? i18n.t('tip.cut')
            : grip.held === null && near(0, 3, 4.5) && scrap.metrics().active > 0
              ? i18n.t('tip.collect')
              : near(2, 5, 3.5)
                ? i18n.t('tip.cart')
                : '';
    }
    const anchored = new Set(rover.state.anchoredFragments());
    for (const [fragmentId, model] of fragmentMeshes) {
      model.visible = anchored.has(fragmentId) && !cutAnchors.has(fragmentId);
    }
    for (const [jointId, marker] of jointMarkers) marker.visible = rover.jointPosition(jointId) !== null;
    scrapView.sync();
    scrapView.highlight(feedback);
    mountainView.sync(aimView.position);
    if (feedbackLabel) {
      let scrapText = '';
      if (feedback.state !== 'none') {
        const symbol = feedback.material.symbol;
        const material = materialName(feedback.material.id, feedback.material.displayName);
        if (feedback.state === 'compatible') scrapText = i18n.t('collect.ready', { symbol, material });
        else if (feedback.state === 'blocked') scrapText = i18n.t('collect.containerFull', { symbol });
        else if (feedback.reason === 'too-big') scrapText = i18n.t('collect.tooBig', { symbol });
        else if (feedback.reason === 'needs-upgrade') {
          const tier = (collector.selector.tierOf(feedback.material.id) ?? 0) + 1;
          scrapText = i18n.t('collect.needsUpgrade', { symbol, material, tier });
        } else if (feedback.reason === 'not-selected') {
          scrapText = i18n.t(collector.selector.locked ? 'collect.notSelectedLocked' : 'collect.notSelected', {
            symbol,
            material,
            selected: selectedName(),
          });
        } else {
          const tools = feedback.collectableBy.map((id) => i18n.tKey(`tool.${id}`, id)).join(', ');
          scrapText = i18n.t('collect.notCollectable', { symbol, material, tools });
        }
      }
      const showingNotice = notice !== null && now < noticeUntil;
      feedbackLabel.textContent = showingNotice && notice ? i18n.t(notice.key, notice.params) : prompt || scrapText;
      feedbackLabel.dataset['state'] = showingNotice ? 'blocked' : prompt ? 'compatible' : feedback.state;
    }
    canvas.dataset['collected'] = String(container.count);
    canvas.dataset['held'] = grip.held ?? '';
    canvas.dataset['intake'] = String(intake.count);
    canvas.dataset['credits'] = String(sharedCredits.balance);
    canvas.dataset['compactor'] = JSON.stringify({ state: compactor.state.kind, bales: [...bales.keys()] });
    canvas.dataset['bins'] = JSON.stringify(Object.fromEntries(intake.batches().map((b) => [b.materialId, b.count])));
    canvas.dataset['selector'] = JSON.stringify({
      tier: collector.selector.tier,
      selected: collector.selector.selected,
      locked: collector.selector.locked,
    });
    canvas.dataset['tools'] = JSON.stringify({
      equipped: loadout.equipped,
      cutterTier,
      cutting: cutting.target,
      progress: Number(cutTick.progress.toFixed(2)),
    });
    canvas.dataset['activePieces'] = String(scrap.metrics().active);
    canvas.dataset['rover'] = JSON.stringify({
      cut: TEST_YARD_ROVER.joints.filter((j) => rover.state.isCut(j.id)).map((j) => j.id),
      chunks: rover.state.chunks().length,
    });
    canvas.dataset['cart'] = JSON.stringify({ loads: cart.loads.length, pushing, recoveries: cart.recoveries });
    const nearBase =
      Math.hypot(view.position.x - TEST_YARD_INTAKE.position.x, view.position.z - TEST_YARD_INTAKE.position.z) < 9;
    if (gameHud) {
      const contents = container.batches()[0]?.materialId;
      gameHud.update({
        labels: {
          container: i18n.t('hud.container'),
          containerFull: i18n.t('hud.full'),
          crew: i18n.t('hud.crew'),
          filter: i18n.t('hud.filter'),
          lockedHint: i18n.t('hud.lockedHint'),
          wheelHint: i18n.t('hud.wheelHint'),
          level: i18n.t('hud.level'),
        },
        crew: { present: 1, max: 4 },
        credits: {
          label: i18n.t('hud.credits'),
          balance: sharedCredits.balance,
          gain: lastGain && now < lastGain.until ? lastGain.credits : null,
        },
        job: { label: i18n.t('hud.job'), text: jobText() },
        base: nearBase
          ? {
              title: i18n.t('hud.base'),
              capacity: intake.binCapacity,
              emptyText: i18n.t('intake.empty'),
              bins: intake.batches().map((batch) => {
                const chip = materialChip(batch.materialId);
                return { symbol: chip.symbol, name: chip.name, color: chip.color, count: batch.count };
              }),
              machines: [compactorLine()],
            }
          : null,
        container: {
          count: container.count,
          capacity: container.capacity,
          color: contents ? (SCRAP_COLORS[contents] ?? null) : null,
        },
        tools: [
          {
            key: '1',
            icon: 'magnet',
            label: toolName(COLLECTOR),
            level: collector.selector.tier + 1,
            equipped: !cutterInHand,
            owned: loadout.owns(COLLECTOR),
          },
          {
            key: '2',
            icon: 'cutter',
            label: toolName(CUTTER),
            level: cutterTier + 1,
            equipped: cutterInHand,
            owned: loadout.owns(CUTTER),
          },
        ],
        inHand: cutterInHand
          ? {
              kind: 'cutter',
              title: i18n.t('hud.cutterTitle', { tier: cutterTier + 1 }),
              detail: i18n.t('hud.cutterDetail', { speed: CUTTER_SPEED_TIERS[cutterTier] ?? 1 }),
            }
          : {
              kind: 'collector',
              title: i18n.t('hud.collectorTitle', { tier: collector.selector.tier + 1 }),
              selected: materialChip(collector.selector.selected),
              locked: collector.selector.locked,
              materials: collectorTiers.flat().map(materialChip),
            },
      });
      hud.container?.setAttribute(
        'data-summary',
        `${container.count}/${container.capacity} ${selectedName()}${collector.selector.locked ? ' locked' : ''}`,
      );
    }
    canvas.dataset['player'] = JSON.stringify({
      x: Number(view.position.x.toFixed(2)),
      y: Number(view.position.y.toFixed(2)),
      z: Number(view.position.z.toFixed(2)),
      eyeY: Number(view.eye.y.toFixed(2)),
      yaw: Number(view.yaw.toFixed(4)),
      pitch: Number(view.pitch.toFixed(4)),
      grounded: view.grounded,
      recoveries: view.recoveries,
      device,
    });
    canvas.dataset['awakeBodies'] = String(world.awakeBodyCount());
    const renderStart = performance.now();
    sampleFrame('views', renderStart - viewsStart);
    renderer.render(scene, camera);
    const frameEnd = performance.now();
    sampleFrame('render', frameEnd - renderStart);
    sampleFrame('cpu', frameEnd - frameStart);
    perfFrames += 1;
    if (now - lastPerf > 1000) {
      const fps = Number(((perfFrames * 1000) / (now - lastPerf)).toFixed(1));
      lastPerf = now;
      perfFrames = 0;
      const sorted = [...simSamples].sort((a, b) => a - b);
      const at = (q: number): number => Number((sorted[Math.floor((sorted.length - 1) * q)] ?? 0).toFixed(2));
      const frameMs: Record<string, { p50: number; p99: number; max: number }> = {};
      for (const [section, samples] of frameSamples) {
        const s = [...samples].sort((a, b) => a - b);
        const q = (p: number): number => Number((s[Math.floor((s.length - 1) * p)] ?? 0).toFixed(2));
        frameMs[section] = { p50: q(0.5), p99: q(0.99), max: q(1) };
      }
      canvas.dataset['frameMs'] = JSON.stringify(frameMs);
      canvas.dataset['perf'] = JSON.stringify({
        fps,
        simP50: at(0.5),
        simP95: at(0.95),
        simP99: at(0.99),
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        awake: world.awakeBodyCount(),
        activePieces: scrap.metrics().active,
        solidDormant: scrap.metrics().solidDormant,
        mountainParts: mountain.pieces().length,
      });
      // Debug aid for scripted checks: nearest exposed mountain parts around the player.
      const near = mountain
        .targetsNear(view.eye, 8)
        .map((candidate) => mountain.piece(candidate.id))
        .filter((piece): piece is MountainPieceSpec => piece !== undefined && mountain.exposed(piece.id));
      const nearest = (size: MountainPieceSpec['size']) =>
        near
          .filter((piece) => piece.size === size)
          .sort(
            (a, b) =>
              Math.hypot(a.position.x - view.eye.x, a.position.z - view.eye.z) -
              Math.hypot(b.position.x - view.eye.x, b.position.z - view.eye.z),
          )[0]?.position ?? null;
      if (!canvas.dataset['meshBreakdown']) {
        // Debug aid: visible draw items per top-level object, to keep the draw-call budget honest.
        const counts = new Map<string, number>();
        for (const top of scene.children) {
          let n = 0;
          top.traverseVisible((object) => {
            if ((object as Mesh).isMesh) n += 1;
          });
          const key = top.name || top.type;
          if (n > 0) counts.set(key, (counts.get(key) ?? 0) + n);
        }
        canvas.dataset['meshBreakdown'] = JSON.stringify(Object.fromEntries(counts));
      }
      const closestLarge = mountain
        .targetsNear(view.eye, 10)
        .map((candidate) => mountain.piece(candidate.id))
        .filter((piece): piece is MountainPieceSpec => piece?.size === 'large')
        .sort(
          (a, b) =>
            Math.hypot(a.position.x - view.eye.x, a.position.z - view.eye.z) -
            Math.hypot(b.position.x - view.eye.x, b.position.z - view.eye.z),
        )[0];
      canvas.dataset['mountainNear'] = JSON.stringify({
        large: nearest('large'),
        medium: nearest('medium'),
        closestLarge: closestLarge
          ? {
              position: closestLarge.position,
              blockers: mountain.blockers(closestLarge.id).map((id) => mountain.piece(id)?.position),
            }
          : null,
      });
    }
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
