import { z } from 'zod';
import type { AssemblySnapshot } from '../../domain/assembly';
import { isContentId, isEntityId, isTransactionId, type ContentId, type EntityId } from '../../domain/ids';
import type { Quat, Vec3 } from '../physics/physicsPort';
import type { ScrapClusterSpec, ScrapFieldSnapshot, ScrapPiece } from '../scrap/scrapField';

/**
 * Durable state of the test yard campaign (MSC-036, architecture §7): outcomes, not physics. The yard layout is
 * regenerated from code and the committed mountain bake with the same ids, so a save records only what changed:
 * consumed and moved pieces, pieces created at runtime, machines, economy and campaign flags. Velocities, claims,
 * a part held in hand and cut progress are not durable; a compaction in progress resumes as unpressed bin pieces.
 */
export interface YardSave {
  /** Fingerprint of the generated layout; a save made against another layout is refused, never misapplied. */
  readonly layout: {
    readonly startSequence: number;
    readonly mountainPieces: number;
    readonly smallPieces: number;
  };
  readonly nextEntitySequence: number;
  /** Next transaction numbers, so new ids never collide with ones recorded in the save. */
  readonly transactions: { readonly sale: number; readonly buy: number; readonly cut: number };
  readonly credits: number;
  readonly upgrades: { readonly collectorTier: number; readonly cutterTier: number };
  readonly campaign: { readonly stationMarkerRevealed: boolean };
  readonly container: readonly ItemRecord[];
  /** Bin pieces, including a compactor load that was not pressed yet. */
  readonly bins: readonly ItemRecord[];
  /** A finished bale still inside the compactor (its exit was occupied). */
  readonly compactorBale: BaleRecord | null;
  readonly bales: readonly BaleRecord[];
  /** Every medium prop that still exists, with its pose; an authored prop not listed here was consumed. */
  readonly props: readonly { readonly id: EntityId; readonly pose: Pose }[];
  readonly cart: { readonly pose: Pose; readonly loads: readonly EntityId[] };
  readonly mountain: { readonly released: readonly EntityId[]; readonly removed: readonly EntityId[] };
  readonly scrap: ScrapDelta;
  readonly rover: { readonly snapshot: AssemblySnapshot; readonly cutAnchors: readonly string[] };
}

export interface ItemRecord {
  readonly id: EntityId;
  readonly materialId: ContentId;
  readonly massKg: number;
}

export interface BaleRecord {
  readonly id: EntityId;
  readonly materialId: ContentId;
  readonly pieceIds: readonly EntityId[];
  readonly massKg: number;
}

/** Position and rotation, rounded: [x, y, z, qx, qy, qz, qw]. */
export type Pose = readonly [number, number, number, number, number, number, number];

export interface RuntimeCluster {
  readonly id: string;
  readonly decorativeInstances: number;
  readonly pieces: readonly {
    readonly id: EntityId;
    readonly materialId: ContentId;
    readonly halfExtents: Vec3;
    readonly massKg: number;
    readonly pose: Pose;
    readonly removed: boolean;
  }[];
}

export interface ScrapDelta {
  /** Authored pieces that were collected, sold or consumed. */
  readonly removed: readonly EntityId[];
  /** Authored pieces resting away from their authored pose. */
  readonly moved: readonly { readonly id: EntityId; readonly pose: Pose }[];
  /** Clusters created while playing (broken or cut parts), stored whole. */
  readonly clusters: readonly RuntimeCluster[];
}

const round = (value: number, digits: number): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

export function poseOf(position: Vec3, rotation: Quat): Pose {
  return [
    round(position.x, 3),
    round(position.y, 3),
    round(position.z, 3),
    round(rotation.x, 5),
    round(rotation.y, 5),
    round(rotation.z, 5),
    round(rotation.w, 5),
  ];
}

export function poseParts(pose: Pose): { position: Vec3; rotation: Quat } {
  const [x, y, z, qx, qy, qz, qw] = pose;
  const length = Math.hypot(qx, qy, qz, qw) || 1;
  return { position: { x, y, z }, rotation: { x: qx / length, y: qy / length, z: qz / length, w: qw / length } };
}

const IDENTITY: Quat = { x: 0, y: 0, z: 0, w: 1 };

/**
 * Settling jitter is not a durable outcome: hundreds of mountain pieces shift by millimeters when they wake near the
 * player, so only a move of 2 cm or a turn of about 5° is recorded.
 */
function samePose(a: Vec3, qa: Quat, b: Vec3, qb: Quat): boolean {
  const near = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 0.02;
  const dot = Math.abs(qa.x * qb.x + qa.y * qb.y + qa.z * qb.z + qa.w * qb.w);
  return near && dot > 0.999;
}

/** What changed in the scrap field compared with its authored clusters. */
export function scrapDelta(authored: readonly ScrapClusterSpec[], snapshot: ScrapFieldSnapshot): ScrapDelta {
  const authoredPieces = new Map<EntityId, { position: Vec3; rotation: Quat }>();
  const authoredClusters = new Set<string>();
  for (const cluster of authored) {
    authoredClusters.add(cluster.id);
    for (const piece of cluster.pieces) {
      authoredPieces.set(piece.id, { position: piece.position, rotation: piece.rotation ?? IDENTITY });
    }
  }
  const removed: EntityId[] = [];
  const moved: { id: EntityId; pose: Pose }[] = [];
  const clusters: RuntimeCluster[] = [];
  for (const cluster of snapshot.clusters) {
    if (!authoredClusters.has(cluster.id)) {
      clusters.push({
        id: cluster.id,
        decorativeInstances: cluster.decorativeInstances,
        pieces: cluster.pieces.map((piece) => ({
          id: piece.id,
          materialId: piece.materialId,
          halfExtents: piece.halfExtents,
          massKg: piece.massKg,
          pose: poseOf(piece.position, piece.rotation),
          removed: piece.state === 'removed',
        })),
      });
      continue;
    }
    for (const piece of cluster.pieces) {
      const origin = authoredPieces.get(piece.id);
      if (piece.state === 'removed') removed.push(piece.id);
      else if (origin && !samePose(piece.position, piece.rotation, origin.position, origin.rotation)) {
        moved.push({ id: piece.id, pose: poseOf(piece.position, piece.rotation) });
      }
    }
  }
  return { removed, moved, clusters };
}

/** Authored clusters with a saved delta applied, as a snapshot the scrap field is built from. */
export function applyScrapDelta(
  authored: readonly ScrapClusterSpec[],
  delta: ScrapDelta,
): ScrapFieldSnapshot['clusters'] {
  const removed = new Set(delta.removed);
  const moved = new Map(delta.moved.map((entry) => [entry.id, poseParts(entry.pose)]));
  const known = new Set(authored.flatMap((cluster) => cluster.pieces.map((piece) => piece.id)));
  for (const id of [...removed, ...moved.keys()]) {
    if (!known.has(id)) throw new Error(`Save refers to unknown scrap piece ${id}`);
  }
  const restored = authored.map((cluster) => {
    const pieces: ScrapPiece[] = cluster.pieces.map((piece) => {
      const pose = moved.get(piece.id);
      return {
        ...piece,
        ...(pose ? { position: pose.position, rotation: pose.rotation } : { rotation: piece.rotation ?? IDENTITY }),
        state: removed.has(piece.id) ? ('removed' as const) : ('dormant' as const),
      };
    });
    const cleared = pieces.length > 0 && pieces.every((piece) => piece.state === 'removed');
    return {
      id: cluster.id,
      decorativeInstances: cleared ? 0 : cluster.decorativeInstances,
      ...(cluster.solid ? { solid: true } : {}),
      pieces,
    };
  });
  const runtime = delta.clusters.map((cluster) => ({
    id: cluster.id,
    decorativeInstances: cluster.decorativeInstances,
    pieces: cluster.pieces.map((piece): ScrapPiece => {
      const { position, rotation } = poseParts(piece.pose);
      return {
        id: piece.id,
        materialId: piece.materialId,
        halfExtents: piece.halfExtents,
        massKg: piece.massKg,
        position,
        rotation,
        state: piece.removed ? 'removed' : 'dormant',
      };
    }),
  }));
  return [...restored, ...runtime];
}

const entityIdSchema = z.string().refine(isEntityId, 'entity id');
const contentIdSchema = z.string().refine(isContentId, 'content id');
const count = z.number().int().min(0);
const finite = z.number().finite();
const positiveMass = z.number().finite().positive();
const poseSchema = z.tuple([finite, finite, finite, finite, finite, finite, finite]);
const vecSchema = z.strictObject({ x: finite, y: finite, z: finite });
const itemSchema = z.strictObject({ id: entityIdSchema, materialId: contentIdSchema, massKg: positiveMass });
const baleSchema = z.strictObject({
  id: entityIdSchema,
  materialId: contentIdSchema,
  pieceIds: z.array(entityIdSchema).min(1),
  massKg: z.number().finite().min(0),
});
const chunkSchema = z.strictObject({ entityId: entityIdSchema, fragments: z.array(z.string()).min(1) });
const cutResultSchema = z.union([
  z.strictObject({
    ok: z.literal(true),
    jointId: z.string(),
    created: z.array(chunkSchema),
    retired: z.array(entityIdSchema),
  }),
  z.strictObject({ ok: z.literal(false), reason: z.enum(['unknown-joint', 'already-cut', 'blocked']) }),
]);

const yardSaveSchema = z.strictObject({
  layout: z.strictObject({ startSequence: count, mountainPieces: count, smallPieces: count }),
  nextEntitySequence: z.number().int().min(1),
  transactions: z.strictObject({ sale: count, buy: count, cut: count }),
  credits: count,
  upgrades: z.strictObject({ collectorTier: count, cutterTier: count }),
  campaign: z.strictObject({ stationMarkerRevealed: z.boolean() }),
  container: z.array(itemSchema),
  bins: z.array(itemSchema),
  compactorBale: baleSchema.nullable(),
  bales: z.array(baleSchema),
  props: z.array(z.strictObject({ id: entityIdSchema, pose: poseSchema })),
  cart: z.strictObject({ pose: poseSchema, loads: z.array(entityIdSchema) }),
  mountain: z.strictObject({ released: z.array(entityIdSchema), removed: z.array(entityIdSchema) }),
  scrap: z.strictObject({
    removed: z.array(entityIdSchema),
    moved: z.array(z.strictObject({ id: entityIdSchema, pose: poseSchema })),
    clusters: z.array(
      z.strictObject({
        id: z.string().min(1).max(64),
        decorativeInstances: count,
        pieces: z.array(
          z.strictObject({
            id: entityIdSchema,
            materialId: contentIdSchema,
            halfExtents: vecSchema,
            massKg: positiveMass,
            pose: poseSchema,
            removed: z.boolean(),
          }),
        ),
      }),
    ),
  }),
  rover: z.strictObject({
    snapshot: z.strictObject({
      assemblyId: z.string(),
      cutJoints: z.array(z.string()),
      chunks: z.array(chunkSchema),
      retiredEntities: z.array(entityIdSchema),
      results: z.array(z.tuple([z.string().refine(isTransactionId, 'transaction id'), cutResultSchema])),
    }),
    cutAnchors: z.array(z.string()),
  }),
});

/**
 * Validates a payload and its identities: every piece held in the container, the bins or a bale exists exactly
 * once and is no longer loose in the field, so loading can never duplicate a piece or resurrect a sold one.
 */
export function parseYardSave(payload: unknown): { ok: true; save: YardSave } | { ok: false; error: string } {
  const parsed = yardSaveSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid save' };
  const save = parsed.data as YardSave;
  const consumed = new Set<EntityId>(save.scrap.removed);
  for (const cluster of save.scrap.clusters) {
    for (const piece of cluster.pieces) if (piece.removed) consumed.add(piece.id);
  }
  const held = [
    ...save.container.map((item) => item.id),
    ...save.bins.map((item) => item.id),
    ...[...save.bales, ...(save.compactorBale ? [save.compactorBale] : [])].flatMap((bale) => bale.pieceIds),
  ];
  const seen = new Set<EntityId>();
  for (const id of held) {
    if (seen.has(id)) return { ok: false, error: `piece ${id} is held twice` };
    if (!consumed.has(id)) return { ok: false, error: `piece ${id} is held but still loose in the field` };
    seen.add(id);
  }
  const bales = [...save.bales, ...(save.compactorBale ? [save.compactorBale] : [])].map((bale) => bale.id);
  if (new Set(bales).size !== bales.length) return { ok: false, error: 'duplicate bale' };
  const props = save.props.map((prop) => prop.id);
  if (new Set(props).size !== props.length) return { ok: false, error: 'duplicate prop' };
  if (save.bales.some((bale) => !props.includes(bale.id))) return { ok: false, error: 'bale without a body' };
  return { ok: true, save };
}
