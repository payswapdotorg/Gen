/**
 * Pure comparison-harness scoring (work order D.10): reduce a scenario run
 * against one mapping into a normalized EvaluationRow
 * (qualityDimensions × cost × latency × reliability). No IO here.
 */
import type { EvaluationRow, RecordedFixture } from "../contract.js";
import type { ConformanceScenario } from "@gen/media-capabilities";

const CARDINALITY_MIN: Readonly<Record<string, number>> = {
  one: 1,
  "zero-or-one": 0,
  "one-or-more": 1,
  "zero-or-more": 0,
};

export interface ScenarioRunOutcome {
  readonly artifactRefs: readonly { ref: string; mediaType: string }[];
}

function schemaInvariantHolds(scenario: ConformanceScenario, outcome: ScenarioRunOutcome): boolean {
  const expected = scenario.expectedOutputInvariants.schema;
  const count = outcome.artifactRefs.filter((artifact) => artifact.mediaType === expected.mediaType).length;
  const minimum = CARDINALITY_MIN[expected.cardinality] ?? 1;
  if (count < minimum) return false;
  if (expected.cardinality === "one" && count !== 1) return false;
  return true;
}

/** Score one mapping's run of one scenario into a comparison row. */
export function scoreMapping(
  scenario: ConformanceScenario,
  fixture: RecordedFixture,
  outcome: ScenarioRunOutcome,
  mapping: { providerId: string; modelId?: string; executionAdapter: string },
): EvaluationRow {
  const thresholds = scenario.expectedOutputInvariants.qualityThresholds;
  const perDimension: Record<string, "pass" | "fail"> = {};
  const qualityScores: Record<string, number> = {};
  let sum = 0;
  let counted = 0;
  for (const [dimension, threshold] of Object.entries(thresholds)) {
    const score = fixture.observed.qualityScores[dimension];
    if (score === undefined) {
      perDimension[dimension] = "fail";
      continue;
    }
    qualityScores[dimension] = score;
    perDimension[dimension] = score >= threshold ? "pass" : "fail";
    sum += score;
    counted += 1;
  }
  const normalizedQuality = counted === 0 ? 0 : Number((sum / counted).toFixed(1));
  const thresholdsPass = Object.values(perDimension).every((value) => value === "pass");

  return {
    providerId: mapping.providerId,
    modelId: mapping.modelId,
    executionAdapter: mapping.executionAdapter,
    qualityScores,
    normalizedQuality,
    cost: fixture.observed.cost,
    latency: { class: fixture.observed.latencyClass },
    reliability: fixture.observed.reliability,
    invariants: {
      schema: schemaInvariantHolds(scenario, outcome) ? "pass" : "fail",
      qualityThresholds: thresholdsPass ? "pass" : "fail",
      perDimension,
    },
    provenance: fixture.provenance,
  };
}
