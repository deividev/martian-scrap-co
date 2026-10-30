import { Group, type PerspectiveCamera } from 'three';
import { createCutterToolModel, createMagnetToolModel } from '../models/styledModels';

export type ToolMode = 'magnet' | 'cutter' | 'hands';

/**
 * First-person tool view (visual §3, §6): the held tool sits in the lower right of the view, sways gently
 * while walking, recoils briefly on use and shakes while the cutter is working.
 */
export class FirstPersonTool {
  readonly #holder = new Group();
  readonly #magnet = createMagnetToolModel();
  readonly #cutter = createCutterToolModel();
  #phase = 0;
  #kick = 0;

  constructor(camera: PerspectiveCamera) {
    this.#holder.add(this.#magnet, this.#cutter);
    this.#holder.position.set(0.34, -0.33, -0.72);
    this.#holder.scale.setScalar(0.55);
    this.#magnet.rotation.set(0.1, 0.35, 0);
    this.#cutter.rotation.set(0.05, 0.15, 0);
    this.#cutter.visible = false;
    for (const mesh of [this.#magnet, this.#cutter]) {
      mesh.traverse((child) => {
        child.renderOrder = 10;
        child.castShadow = false;
      });
    }
    camera.add(this.#holder);
  }

  setMode(mode: ToolMode): void {
    this.#magnet.visible = mode === 'magnet';
    this.#cutter.visible = mode === 'cutter';
  }

  use(): void {
    this.#kick = 1;
  }

  update(dt: number, moving: boolean, working = false): void {
    this.#phase += dt * (moving ? 9 : 2);
    const amplitude = moving ? 0.012 : 0.004;
    this.#kick = Math.max(0, this.#kick - dt * 6);
    const shake = working ? (Math.random() - 0.5) * 0.012 : 0;
    this.#holder.position.set(
      0.34 + Math.cos(this.#phase * 0.5) * amplitude + shake,
      -0.33 + Math.sin(this.#phase) * amplitude + shake,
      -0.72 + this.#kick * 0.05,
    );
  }
}
