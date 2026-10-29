/** Percentile summary of a set of samples (milliseconds unless stated otherwise). */
export interface Distribution {
  readonly samples: number;
  readonly mean: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly max: number;
}

export function summarize(values: readonly number[]): Distribution {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return { samples: 0, mean: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  const sorted = [...finite].sort((a, b) => a - b);
  const at = (q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  const round = (value: number): number => Math.round(value * 100) / 100;
  return {
    samples: sorted.length,
    mean: round(sorted.reduce((total, value) => total + value, 0) / sorted.length),
    p50: round(at(0.5)),
    p95: round(at(0.95)),
    p99: round(at(0.99)),
    max: round(sorted[sorted.length - 1] ?? 0),
  };
}
