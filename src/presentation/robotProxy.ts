import { BoxGeometry, CapsuleGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry } from 'three';
import { PLAYER_TUNING } from '../simulation/player/playerController';

/**
 * Simple rounded robot stand-in matching the player capsule (MSC-013). Used for scale reference
 * now and for remote crew members later; final art comes from the MSC-043 pilot.
 */
export function createRobotProxy(bodyColor: string): Group {
  const robot = new Group();
  const shell = new MeshStandardMaterial({ color: bodyColor, roughness: 0.55 });
  const trim = new MeshStandardMaterial({ color: '#2f3a4f', roughness: 0.7 });
  const visor = new MeshStandardMaterial({ color: '#7fe3d4', emissive: '#1e6f66', roughness: 0.2 });

  const body = new Mesh(new CapsuleGeometry(PLAYER_TUNING.radius, PLAYER_TUNING.halfHeight * 2, 6, 16), shell);
  robot.add(body);

  const head = new Mesh(new SphereGeometry(0.24, 20, 14), shell);
  head.position.y = PLAYER_TUNING.halfHeight + PLAYER_TUNING.radius + 0.12;
  robot.add(head);

  const face = new Mesh(new BoxGeometry(0.3, 0.1, 0.08), visor);
  face.position.set(0, head.position.y + 0.02, -0.21);
  robot.add(face);

  const belt = new Mesh(new CapsuleGeometry(PLAYER_TUNING.radius + 0.01, 0.05, 4, 16), trim);
  belt.position.y = -0.05;
  robot.add(belt);

  return robot;
}
