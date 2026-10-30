import { z } from 'zod';
import { contentId, isContentId, type ContentId } from '../domain/ids';
import type { MaterialDefinition, ToolDefinition } from '../domain/materials';
import { credits, isInRange, kilograms } from '../domain/units';

export const CONTENT_SCHEMA_VERSION = 1;

const contentIdSchema = z.string().refine(isContentId, 'must be a lowercase kebab-case content id');
const displayNameSchema = z.string().trim().min(1).max(48);
const handlingScaleSchema = z.enum(['small', 'medium', 'large']);

const materialSchema = z.strictObject({
  id: contentIdSchema,
  displayName: displayNameSchema,
  symbol: z.string().trim().min(1).max(4),
  fictional: z.boolean(),
  collectableBy: z.array(contentIdSchema).min(1).max(8),
  saleValuePerUnit: z.number().refine((value) => isInRange('credits', value), 'must be whole credits in range'),
  massPerUnit: z.number().refine((value) => isInRange('kilograms', value) && value > 0, 'must be a positive mass'),
});

const toolSchema = z.strictObject({
  id: contentIdSchema,
  displayName: displayNameSchema,
  handles: z.array(handlingScaleSchema).min(1).max(3),
  freeBaseline: z.boolean(),
  /** Collector upgrade tiers: materials each tier unlocks, cumulatively (tier 0 is the base tool). */
  upgradeTiers: z.array(z.array(contentIdSchema).min(1).max(8)).min(1).max(8).optional(),
});

export const contentPackSchema = z.strictObject({
  schemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
  materials: z.array(materialSchema).min(1).max(32),
  tools: z.array(toolSchema).min(1).max(32),
});

export type RawContentPack = z.input<typeof contentPackSchema>;

export interface ContentPack {
  readonly schemaVersion: typeof CONTENT_SCHEMA_VERSION;
  readonly materials: ReadonlyMap<ContentId, MaterialDefinition>;
  readonly tools: ReadonlyMap<ContentId, ToolDefinition>;
}

export type ContentResult =
  { readonly ok: true; readonly pack: ContentPack } | { readonly ok: false; readonly errors: readonly string[] };

function duplicates(ids: readonly string[]): string[] {
  return ids.filter((id, index) => ids.indexOf(id) !== index);
}

/** Validates shape, ranges and cross-references; unknown fields and unknown ids are rejected. */
export function parseContentPack(input: unknown): ContentResult {
  const parsed = contentPackSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) };
  }
  const { materials, tools } = parsed.data;
  const errors: string[] = [];

  for (const id of duplicates(materials.map((material) => material.id))) errors.push(`duplicate material id: ${id}`);
  for (const id of duplicates(tools.map((tool) => tool.id))) errors.push(`duplicate tool id: ${id}`);

  const toolById = new Map(tools.map((tool) => [tool.id, tool]));
  for (const material of materials) {
    for (const toolId of material.collectableBy) {
      const tool = toolById.get(toolId);
      if (!tool) errors.push(`material ${material.id}: unknown tool ${toolId}`);
      else if (!tool.handles.includes('small'))
        errors.push(`material ${material.id}: tool ${toolId} cannot collect small pieces`);
    }
    // PRD-011: every material stays reachable without buying anything.
    if (!material.collectableBy.some((toolId) => toolById.get(toolId)?.freeBaseline)) {
      errors.push(`material ${material.id}: no free-baseline tool can collect it`);
    }
  }
  const materialById = new Map(materials.map((material) => [material.id, material]));
  for (const tool of tools) {
    const tiered = (tool.upgradeTiers ?? []).flat();
    for (const id of duplicates(tiered)) errors.push(`tool ${tool.id}: material ${id} appears in two tiers`);
    for (const id of tiered) {
      if (!materialById.has(id)) errors.push(`tool ${tool.id}: unknown tier material ${id}`);
    }
    // The base tier is what the free tool already collects; upgrades add to it.
    for (const id of tool.upgradeTiers?.[0] ?? []) {
      if (materialById.get(id)?.collectableBy.includes(tool.id) === false) {
        errors.push(`tool ${tool.id}: base tier material ${id} does not list the tool`);
      }
    }
  }
  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    pack: {
      schemaVersion: CONTENT_SCHEMA_VERSION,
      materials: new Map(
        materials.map((material) => [
          contentId(material.id),
          {
            id: contentId(material.id),
            displayName: material.displayName,
            symbol: material.symbol,
            fictional: material.fictional,
            collectableBy: material.collectableBy.map(contentId),
            saleValuePerUnit: credits(material.saleValuePerUnit),
            massPerUnit: kilograms(material.massPerUnit),
          },
        ]),
      ),
      tools: new Map(
        tools.map((tool) => [
          contentId(tool.id),
          {
            id: contentId(tool.id),
            displayName: tool.displayName,
            handles: tool.handles,
            freeBaseline: tool.freeBaseline,
            ...(tool.upgradeTiers ? { upgradeTiers: tool.upgradeTiers.map((tier) => tier.map(contentId)) } : {}),
          },
        ]),
      ),
    },
  };
}
