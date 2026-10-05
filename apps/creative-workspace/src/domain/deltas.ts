/**
 * Alternative-path delta derivation (pure, domain): turns committed provider
 * measurements — @gen/agent-lab frozen model catalog entries or
 * @gen/media-providers evaluation rows — into the cost/latency/quality deltas
 * the workspace shows BEFORE switching a routing path (spec/task-plan.md §3).
 *
 * Units are presented verbatim with their provenance; when the two paths price
 * in different units (e.g. per-second-of-output vs compute-minutes) the delta
 * says so instead of inventing a conversion.
 */
import type { AlternativeDelta } from "../contract.js";
import type { ProviderMeasurementRow } from "./records.js";

function rowLabel(row: ProviderMeasurementRow): string {
  return row.modelId !== undefined ? `${row.providerId}/${row.modelId}` : row.providerId;
}

function costText(row: ProviderMeasurementRow): string {
  if (row.costEstimate === undefined) return "—";
  const unit = row.costUnit !== undefined ? ` ${row.costUnit}` : "";
  return `$${row.costEstimate.toFixed(2)}${unit}`;
}

function qualityText(row: ProviderMeasurementRow): string {
  if (row.normalizedQuality !== undefined) return `${row.normalizedQuality.toFixed(1)}/100`;
  return row.qualityClass ?? "—";
}

function reliabilityText(row: ProviderMeasurementRow): string {
  return row.reliability !== undefined ? row.reliability.toFixed(2) : "—";
}

function sameUnits(a: ProviderMeasurementRow, b: ProviderMeasurementRow): boolean {
  return a.costUnit === b.costUnit;
}

/**
 * Deltas of `candidate` vs `current` (both from the same committed source).
 * Presenting the active path's own baseline (current === candidate shape)
 * produces "current path" rows instead of fake zeros.
 */
export function deltasBetween(
  current: ProviderMeasurementRow,
  candidate: ProviderMeasurementRow,
  source: string,
): readonly AlternativeDelta[] {
  const samePath = rowLabel(current) === rowLabel(candidate);
  const costDelta = samePath
    ? "current path baseline"
    : sameUnits(current, candidate) && current.costEstimate !== undefined && candidate.costEstimate !== undefined
      ? `${candidate.costEstimate >= current.costEstimate ? "+" : "−"}$${Math.abs(candidate.costEstimate - current.costEstimate).toFixed(2)} per decision (${(candidate.costEstimate / current.costEstimate).toFixed(1)}x)`
      : "different pricing units — see record";
  const qualityDelta = samePath
    ? "current path baseline"
    : current.normalizedQuality !== undefined && candidate.normalizedQuality !== undefined
      ? `${candidate.normalizedQuality >= current.normalizedQuality ? "+" : "−"}${Math.abs(candidate.normalizedQuality - current.normalizedQuality).toFixed(1)} normalized quality`
      : `${candidate.qualityClass ?? "?"} vs ${current.qualityClass ?? "?"} class`;
  const latencyDelta = samePath
    ? "current path baseline"
    : candidate.latencyClass === current.latencyClass
      ? `same class (${current.latencyClass ?? "—"})`
      : `${candidate.latencyClass ?? "—"} vs ${current.latencyClass ?? "—"}`;
  const reliabilityDelta = samePath
    ? "current path baseline"
    : current.reliability !== undefined && candidate.reliability !== undefined
      ? `${candidate.reliability >= current.reliability ? "+" : "−"}${Math.abs(candidate.reliability - current.reliability).toFixed(2)}`
      : "not measured on both paths";
  return [
    {
      dimension: "cost",
      current: costText(current),
      candidate: costText(candidate),
      delta: costDelta,
      source,
    },
    {
      dimension: "quality",
      current: qualityText(current),
      candidate: qualityText(candidate),
      delta: qualityDelta,
      source,
    },
    {
      dimension: "latency",
      current: current.latencyClass ?? "—",
      candidate: candidate.latencyClass ?? "—",
      delta: latencyDelta,
      source,
    },
    {
      dimension: "reliability",
      current: reliabilityText(current),
      candidate: reliabilityText(candidate),
      delta: reliabilityDelta,
      source,
    },
  ];
}

/** Baseline rows for the active path (current selection, measured values). */
export function currentPathDeltas(
  row: ProviderMeasurementRow,
  source: string,
): readonly AlternativeDelta[] {
  return deltasBetween(row, row, source);
}
