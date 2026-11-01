import type { ContentPack } from '../../content/schema';
import type { ContainerItem } from '../../domain/container';
import { contentId, type ContentId, type EntityId } from '../../domain/ids';
import type { MaterialDefinition, ToolDefinition } from '../../domain/materials';
import { MaterialSelector } from '../../domain/materialSelector';
import type { CharacterHandle, PhysicsBodyHandle, PhysicsWorldPort, Vec3 } from '../physics/physicsPort';
import type { ScrapField } from '../scrap/scrapField';
import { TARGETING, type AimRay, type TargetPick } from './targeting';

export type TargetFeedback =
  | { readonly state: 'none' }
  | { readonly state: 'compatible'; readonly id: EntityId; readonly material: MaterialDefinition }
  | {
      /** The collector will not take it right now; the piece stays where it is. */
      readonly state: 'incompatible';
      readonly id: EntityId;
      readonly material: MaterialDefinition;
      readonly reason: IncompatibleReason;
      /** Tools that can collect it, for the player-facing hint (localized by the UI). */
      readonly collectableBy: readonly ContentId[];
    }
  | {
      /** Compatible, but intake is refused because the container is full. */
      readonly state: 'blocked';
      readonly id: EntityId;
      readonly material: MaterialDefinition;
      readonly reason: 'container-full';
    };

/**
 * Why the collector refuses a piece: the material never goes through it, a higher upgrade tier unlocks it,
 * it is not the selected material, or the piece is not small.
 */
export type IncompatibleReason = 'not-collectable' | 'needs-upgrade' | 'not-selected' | 'too-big';

/** Where collected pieces go. Capture removes a piece from the world only if the sink accepts it. */
export interface CollectionSink {
  canAccept(id: EntityId): boolean;
  /** Called exactly once per captured piece, in the same step it leaves the world. */
  accept(item: ContainerItem): void;
  /** Free capacity, so suction never pulls more than fits. */
  remaining?(): number;
  /** Whether the sink holds nothing; the material selection is locked otherwise. */
  isEmpty?(): boolean;
}

export type PullOutcome =
  | { readonly kind: 'none' }
  | { readonly kind: 'collected'; readonly id: EntityId }
  | { readonly kind: 'dropped'; readonly id: EntityId; readonly reason: 'out-of-range' | 'sink-full' | 'gone' };

/** Vacuum suction: wider than the single-target aim cone (first-pass values, MSC-020 feel review). */
export const VACUUM_TUNING = Object.freeze({
  reachMeters: 4,
  coneDegrees: 22,
  maxConcurrent: 8,
});

export const COLLECTOR_TUNING = Object.freeze({
  pullSpeed: 6,
  /** Ownership transfers once the piece is this close to the collector. */
  captureDistance: 0.7,
  /** A pull is dropped (piece left intact) if the piece ends up farther than this. */
  dropDistance: TARGETING.reachMeters + 1,
});

/**
 * Collector (MSC-014, owner decision 2026-10-30). It takes only the selected material among those its
 * upgrade tier unlocks; everything else is left untouched with a reason. A piece is collected exactly
 * once, when it reaches the collector, never at button press.
 */
export class MagneticCollector {
  readonly #pack: ContentPack;
  readonly #field: ScrapField;
  readonly #physics: PhysicsWorldPort;
  readonly #tool: ToolDefinition;
  readonly #sink: CollectionSink;
  readonly #pulling = new Set<EntityId>();
  readonly selector: MaterialSelector;

  constructor(
    pack: ContentPack,
    field: ScrapField,
    physics: PhysicsWorldPort,
    sink: CollectionSink,
    toolId = 'magnetic-collector',
  ) {
    const tool = pack.tools.get(contentId(toolId));
    if (!tool) throw new RangeError(`Unknown tool ${toolId}`);
    this.#pack = pack;
    this.#field = field;
    this.#physics = physics;
    this.#tool = tool;
    this.#sink = sink;
    const baseline = [...pack.materials.values()]
      .filter((material) => material.collectableBy.includes(tool.id))
      .map((material) => material.id);
    this.selector = new MaterialSelector(
      tool.upgradeTiers ?? [baseline],
      () => this.#pulling.size > 0 || sink.isEmpty?.() === false,
    );
  }

  get pulling(): readonly EntityId[] {
    return [...this.#pulling];
  }

  evaluate(pick: TargetPick | null): TargetFeedback {
    if (!pick) return { state: 'none' };
    const piece = this.#field.piece(pick.candidate.id);
    const material = piece ? this.#pack.materials.get(piece.materialId) : undefined;
    // Dormant pieces of the mountain are valid targets too; they wake when the pull starts.
    if (!piece || piece.state === 'removed' || !material) return { state: 'none' };
    const reason = this.#refusal(material);
    if (reason === null) {
      return this.#sink.canAccept(piece.id)
        ? { state: 'compatible', id: piece.id, material }
        : { state: 'blocked', id: piece.id, material, reason: 'container-full' };
    }
    return { state: 'incompatible', id: piece.id, material, reason, collectableBy: material.collectableBy };
  }

  /** Starts pulling a compatible target. Returns false (and changes nothing) otherwise. */
  tryStartPull(feedback: TargetFeedback): boolean {
    if (feedback.state !== 'compatible' || this.#pulling.has(feedback.id) || this.#freeSlots() <= 0) return false;
    this.#field.disturb(feedback.id);
    this.#pulling.add(feedback.id);
    return true;
  }

  /**
   * Vacuum suction (owner feedback 2026-10-30): while the use action is held, every compatible piece in a
   * wide cone with line of sight is pulled at once, up to the concurrent limit and the container's free
   * space. Returns how many pieces started being pulled this call.
   */
  suck(aim: AimRay, self?: CharacterHandle): number {
    const cosLimit = Math.cos((VACUUM_TUNING.coneDegrees * Math.PI) / 180);
    const candidates: { id: EntityId; body: PhysicsBodyHandle; angle: number }[] = [];
    for (const target of this.#field.targetsNear(aim.origin, VACUUM_TUNING.reachMeters)) {
      if (this.#pulling.has(target.id)) continue;
      const piece = this.#field.piece(target.id);
      const material = piece ? this.#pack.materials.get(piece.materialId) : undefined;
      if (!material || this.#refusal(material) !== null) continue;
      const d = {
        x: target.position.x - aim.origin.x,
        y: target.position.y - aim.origin.y,
        z: target.position.z - aim.origin.z,
      };
      const distance = Math.hypot(d.x, d.y, d.z);
      if (distance === 0 || distance > VACUUM_TUNING.reachMeters) continue;
      const cos = (d.x * aim.direction.x + d.y * aim.direction.y + d.z * aim.direction.z) / distance;
      if (cos < cosLimit) continue;
      candidates.push({ id: target.id, body: target.body, angle: Math.acos(Math.min(1, cos)) });
    }
    candidates.sort((a, b) => a.angle - b.angle);
    let added = 0;
    for (const candidate of candidates) {
      if (this.#freeSlots() <= 0) break;
      // An earlier pull may have woken this piece (it rested on the pulled one): use its live body then.
      if (this.#field.piece(candidate.id)?.state === 'removed') continue;
      const body = this.#field.bodyOf(candidate.id) ?? candidate.body;
      const position = this.#physics.bodyPosition(body);
      const d = { x: position.x - aim.origin.x, y: position.y - aim.origin.y, z: position.z - aim.origin.z };
      const hit = this.#physics.castRay(aim.origin, d, Math.hypot(d.x, d.y, d.z) + 0.5, self);
      if (hit?.body !== body) continue;
      this.#field.disturb(candidate.id);
      this.#pulling.add(candidate.id);
      added += 1;
    }
    return added;
  }

  /** Stops all suction; pulled pieces simply fall where they are. */
  cancelPull(): void {
    this.#pulling.clear();
  }

  /** Moves every pulled piece toward the collector; each transfers ownership atomically on arrival. */
  fixedUpdate(collector: Vec3): PullOutcome[] {
    const outcomes: PullOutcome[] = [];
    for (const id of [...this.#pulling]) {
      const outcome = this.#step(id, collector);
      if (outcome.kind !== 'none') {
        this.#pulling.delete(id);
        outcomes.push(outcome);
      }
    }
    return outcomes;
  }

  #refusal(material: MaterialDefinition): IncompatibleReason | null {
    if (!this.#tool.handles.includes('small')) return 'too-big';
    const tier = this.selector.tierOf(material.id);
    if (tier === undefined) return 'not-collectable';
    if (tier > this.selector.tier) return 'needs-upgrade';
    return this.selector.accepts(material.id) ? null : 'not-selected';
  }

  #freeSlots(): number {
    const space = this.#sink.remaining ? this.#sink.remaining() - this.#pulling.size : Number.POSITIVE_INFINITY;
    return Math.min(VACUUM_TUNING.maxConcurrent - this.#pulling.size, space);
  }

  #step(id: EntityId, collector: Vec3): PullOutcome {
    const piece = this.#field.piece(id);
    const body = this.#field.bodyOf(id);
    if (piece?.state !== 'active' || body === undefined) return { kind: 'dropped', id, reason: 'gone' };
    const position = this.#physics.bodyPosition(body);
    const delta = { x: collector.x - position.x, y: collector.y - position.y, z: collector.z - position.z };
    const distance = Math.hypot(delta.x, delta.y, delta.z);
    if (distance > COLLECTOR_TUNING.dropDistance) return { kind: 'dropped', id, reason: 'out-of-range' };
    if (distance <= COLLECTOR_TUNING.captureDistance) {
      // Full at arrival: the piece stays in the world (never deleted), it just stops being pulled.
      if (!this.#sink.canAccept(id)) return { kind: 'dropped', id, reason: 'sink-full' };
      if (!this.#field.removePiece(id)) return { kind: 'dropped', id, reason: 'gone' };
      this.#sink.accept({ id, materialId: piece.materialId, massKg: piece.massKg });
      return { kind: 'collected', id };
    }
    const speed = COLLECTOR_TUNING.pullSpeed / distance;
    this.#physics.setLinearVelocity(body, { x: delta.x * speed, y: delta.y * speed, z: delta.z * speed });
    return { kind: 'none' };
  }
}
