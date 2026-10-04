/**
 * Certification bar (organization-lab §4, work order B7): a candidate org may
 * be marked `certified` for a goal class only with (a) replayed evaluation at
 * a pinned scenario set, (b) fitness ≥ threshold, (c) zero unresolved gap
 * reports. Evidence records are committed artifacts (repo-relative refs).
 */
import type { OrganizationGraph } from "../contract.js";
import type { CertificationBar, CertificationOutcome, CertificationScenarioResult } from "./lab-api.js";
import { DEFAULT_CERTIFICATION_BAR } from "./lab-api.js";
import { meanFitness } from "./evaluation.js";

export interface CertifyInput {
  /** Only the id is needed — evidence refs are derived from it. */
  readonly graph: Pick<OrganizationGraph, "id">;
  readonly scenarioResults: readonly CertificationScenarioResult[];
  readonly bar?: CertificationBar;
  /** Deterministic certification timestamp (committed evidence must be stable). */
  readonly certifiedAt: string;
}

export function certifyOrganization(input: CertifyInput): CertificationOutcome {
  const bar = input.bar ?? DEFAULT_CERTIFICATION_BAR;
  const issues: string[] = [];
  const fitness = meanFitness(input.scenarioResults.map((result) => result.metrics));
  if (input.scenarioResults.length === 0) {
    issues.push("certification requires at least one scenario result (pinned scenario set)");
  }
  if (fitness < bar.minFitness) {
    issues.push(`aggregate fitness ${fitness} below bar ${bar.minFitness}`);
  }
  if (bar.requireAllCriteriaMet) {
    for (const result of input.scenarioResults) {
      const { criteriaMet, criteriaTotal } = result.metrics;
      if (criteriaTotal === 0 || criteriaMet < criteriaTotal) {
        issues.push(`scenario ${result.scenarioId}: ${criteriaMet}/${criteriaTotal} success criteria met`);
      }
    }
  }
  const unresolvedGaps = input.scenarioResults.reduce((sum, result) => sum + result.metrics.unresolvedGaps, 0);
  if (unresolvedGaps > bar.maxUnresolvedGaps) {
    issues.push(`${unresolvedGaps} unresolved gap report(s) across the scenario set (bar: ${bar.maxUnresolvedGaps})`);
  }
  return {
    certified: issues.length === 0,
    fitness,
    issues,
    evidence: {
      scenarioSetRef: bar.scenarioSetRef,
      replayRef: `packages/agent-lab/src/domain/evaluations/eval.${input.graph.id}.json`,
      certifiedAt: input.certifiedAt,
      gapReportsResolved: unresolvedGaps === 0,
    },
  };
}

/** Attach certification to an organization graph (evaluation block, schema-valid). */
export function withCertification(
  graph: OrganizationGraph,
  outcome: CertificationOutcome,
  weights: Record<string, number>,
): OrganizationGraph {
  return {
    ...graph,
    evaluation: {
      certified: outcome.certified,
      fitness: outcome.fitness,
      weights,
      metrics: {},
      ...(outcome.certified ? { certificationEvidence: { ...outcome.evidence } } : {}),
    },
  };
}
