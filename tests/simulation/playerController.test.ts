import { afterEach, describe, expect, it } from 'vitest';
import { EMPTY_FRAME, type ActionFrame } from '../../src/input/actions';
import { GamepadSource, type GamepadLike } from '../../src/input/gamepadSource';
import { DEFAULT_INPUT_SETTINGS } from '../../src/input/inputSettings';
import { KeyboardMouseSource } from '../../src/input/keyboardMouseSource';
import { PHYSICS_CONVENTIONS } from '../../src/simulation/physics/conventions';
import type { PhysicsWorldPort, Vec3 } from '../../src/simulation/physics/physicsPort';
import { createRapierWorld } from '../../src/simulation/physics/rapierWorld';
import { PLAYER_TUNING, PlayerController } from '../../src/simulation/player/playerController';
import { TEST_YARD_BLOCKS, TEST_YARD_RECOVERY_ZONES, yardBodySpec } from '../../src/simulation/yard/testYard';

const DT = PHYSICS_CONVENTIONS.fixedStepSeconds;
const worlds: PhysicsWorldPort[] = [];
afterEach(() => {
  for (const world of worlds.splice(0)) world.dispose();
});

async function yard(spawn: Vec3): Promise<{ world: PhysicsWorldPort; player: PlayerController }> {
  const world = await createRapierWorld();
  worlds.push(world);
  for (const block of TEST_YARD_BLOCKS) world.addBox(yardBodySpec(block));
  const player = new PlayerController(world, spawn, PHYSICS_CONVENTIONS.marsGravity, TEST_YARD_RECOVERY_ZONES);
  // Settle onto the ground.
  for (let i = 0; i < 60; i += 1) {
    player.fixedUpdate({ x: 0, y: 0 }, DT);
    world.step();
  }
  return { world, player };
}

/** Walks for `seconds` and returns the highest capsule center reached. */
function walk(world: PhysicsWorldPort, player: PlayerController, frame: ActionFrame, seconds: number): number {
  player.applyLook(frame);
  let peak = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    player.fixedUpdate(frame.move, DT);
    world.step();
    peak = Math.max(peak, player.view().position.y);
  }
  return peak;
}

const forward: ActionFrame = { ...EMPTY_FRAME, move: { x: 0, y: 1 }, device: 'keyboard-mouse' };
const standingHeight = PLAYER_TUNING.halfHeight + PLAYER_TUNING.radius;

describe('PlayerController on the test yard', () => {
  it('stands on flat ground', async () => {
    const { player } = await yard({ x: 0, y: 1.5, z: 6 });
    const view = player.view();
    expect(view.grounded).toBe(true);
    expect(view.position.y).toBeCloseTo(standingHeight, 1);
  });

  it.each([
    ['15°', -6, 15],
    ['30°', -2, 30],
  ])('climbs the walkable %s ramp', async (_label, x, degrees) => {
    const { world, player } = await yard({ x, y: 1.5, z: 1 });
    walk(world, player, forward, 2.2);
    const rise = player.view().position.y - standingHeight;
    // At least half of the horizontal distance covered should have turned into height.
    expect(rise).toBeGreaterThan(Math.tan((degrees * Math.PI) / 180) * 2);
  });

  it('cannot climb the 50° ramp', async () => {
    const { world, player } = await yard({ x: 2, y: 1.5, z: 1 });
    walk(world, player, forward, 3);
    expect(player.view().position.y).toBeLessThan(standingHeight + 0.6);
  });

  it('steps onto 20 cm but not 50 cm blocks', async () => {
    const low = await yard({ x: 6, y: 1.5, z: 0 });
    expect(walk(low.world, low.player, forward, 1.2)).toBeGreaterThan(standingHeight + 0.15);

    const high = await yard({ x: 9, y: 1.5, z: 0 });
    expect(walk(high.world, high.player, forward, 1.2)).toBeLessThan(standingHeight + 0.1);
    expect(high.player.view().position.z).toBeGreaterThan(-2 + PLAYER_TUNING.radius - 0.05);
  });

  it('stops in an inside corner without passing through either wall', async () => {
    const { world, player } = await yard({ x: -15, y: 1.5, z: 8 });
    // Yaw 3π/4 points forward toward -X and +Z, into the corner of the west and north walls.
    player.applyLook({ ...EMPTY_FRAME, look: { yaw: (3 * Math.PI) / 4, pitch: 0 } });
    walk(world, player, forward, 4);
    const { x, z } = player.view().position;
    expect(x).toBeGreaterThan(-18 + PLAYER_TUNING.radius - 0.05);
    expect(x).toBeLessThan(-17);
    expect(z).toBeLessThan(11.75 - PLAYER_TUNING.radius + 0.05);
    expect(z).toBeGreaterThan(10.5);
  });

  it('recovers to the last safe ground after falling into the pit', async () => {
    const { world, player } = await yard({ x: 8, y: 1.5, z: 3 });
    player.applyLook({ ...EMPTY_FRAME, look: { yaw: Math.PI, pitch: 0 } }); // face +Z toward the pit
    walk(world, player, forward, 1.5);
    walk(world, player, EMPTY_FRAME, 4);
    const view = player.view();
    expect(view.recoveries).toBeGreaterThanOrEqual(1);
    expect(view.position.y).toBeGreaterThan(-1);
  });

  it('clamps camera pitch and ignores non-finite look input', async () => {
    const { player } = await yard({ x: 0, y: 1.5, z: 6 });
    player.applyLook({ ...EMPTY_FRAME, look: { yaw: 0, pitch: 10 } });
    expect(player.view().pitch).toBeCloseTo(PLAYER_TUNING.pitchLimitRadians);
    player.applyLook({ ...EMPTY_FRAME, look: { yaw: Number.NaN, pitch: Number.POSITIVE_INFINITY } });
    expect(Number.isFinite(player.view().yaw)).toBe(true);
    expect(player.view().pitch).toBeCloseTo(PLAYER_TUNING.pitchLimitRadians);
  });

  it('jumps a calm height under Mars gravity', async () => {
    const { world, player } = await yard({ x: 0, y: 1.5, z: 6 });
    player.applyLook({ ...EMPTY_FRAME, jump: true });
    let peak = 0;
    for (let i = 0; i < 120; i += 1) {
      player.fixedUpdate({ x: 0, y: 0 }, DT);
      world.step();
      peak = Math.max(peak, player.view().position.y - standingHeight);
    }
    expect(peak).toBeGreaterThan(0.7);
    expect(peak).toBeLessThan(1.1);
    expect(player.view().grounded).toBe(true);
  });
});

describe('shared actions across devices', () => {
  it('keyboard W and a full forward stick produce the same movement', async () => {
    const keyboard = new KeyboardMouseSource(DEFAULT_INPUT_SETTINGS);
    keyboard.handleKeyDown('KeyW');
    const keyboardFrame = keyboard.poll();

    const pad: GamepadLike = {
      connected: true,
      mapping: 'standard',
      axes: [0, -1, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false })),
    };
    const gamepadFrame = new GamepadSource(DEFAULT_INPUT_SETTINGS, () => [pad]).poll(DT);

    expect(keyboardFrame.move).toEqual({ x: 0, y: 1 });
    expect(gamepadFrame.move.x).toBeCloseTo(0);
    expect(gamepadFrame.move.y).toBeCloseTo(1);

    const a = await yard({ x: 0, y: 1.5, z: 6 });
    walk(a.world, a.player, keyboardFrame, 1);
    const b = await yard({ x: 0, y: 1.5, z: 6 });
    walk(b.world, b.player, gamepadFrame, 1);
    expect(b.player.view().position.z).toBeCloseTo(a.player.view().position.z, 2);
    expect(a.player.view().position.z).toBeLessThan(6 - 3);
  });
});
