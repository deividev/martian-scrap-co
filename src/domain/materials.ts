import type { ContentId } from './ids';
import type { Credits, Kilograms } from './units';

/** How an object is moved, matching the three handling scales (PRD-005). */
export type HandlingScale = 'small' | 'medium' | 'large';

/** Authored material family (provisional first-pass set, MSC-002). */
export interface MaterialDefinition {
  readonly id: ContentId;
  readonly displayName: string;
  /** Short non-color cue shown with the icon (PRD-006 accessibility). */
  readonly symbol: string;
  readonly fictional: boolean;
  /** Tool families able to collect small pieces of this material. */
  readonly collectableBy: readonly ContentId[];
  /** Placeholder sale value per compacted unit until the economy is tuned (MSC-058). */
  readonly saleValuePerUnit: Credits;
  readonly massPerUnit: Kilograms;
}

/** Authored tool family with its handling reach. */
export interface ToolDefinition {
  readonly id: ContentId;
  readonly displayName: string;
  readonly handles: readonly HandlingScale[];
  /** Part of the free baseline that can never be lost or sold (PRD-011). */
  readonly freeBaseline: boolean;
}

export type CompatibilityResult =
  | { readonly compatible: true }
  | { readonly compatible: false; readonly reason: 'material-not-collectable-by-tool' | 'scale-not-handled' };

/**
 * Whether a tool can take a piece. Incompatible pieces stay in the world with an intelligible
 * reason; nothing is destroyed (PRD-005 feel contract).
 */
export function checkCompatibility(
  tool: ToolDefinition,
  material: MaterialDefinition,
  scale: HandlingScale,
): CompatibilityResult {
  if (!tool.handles.includes(scale)) return { compatible: false, reason: 'scale-not-handled' };
  if (scale === 'small' && !material.collectableBy.includes(tool.id)) {
    return { compatible: false, reason: 'material-not-collectable-by-tool' };
  }
  return { compatible: true };
}
