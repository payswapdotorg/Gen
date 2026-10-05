/**
 * Shared graph fixtures for the decision-plane tests (W6): the committed
 * certified T2 graph + the T4 search candidates (dodger = pipeline best,
 * attempting = standard tool profile whose run the committed gap report cites).
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { OrganizationGraph } from "../../src/contract.js";
import { searchOrganizations } from "../../src/domain/search.js";
import {
  documentaryCinematicScenario,
  forcedFailureScenario,
} from "../../src/domain/scenarios/index.js";
import { readOrganizationGraphFile } from "../../src/adapters/fs-evaluation-store.js";

const domainRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "domain");

/** The committed certified T2 organization (documentary-cinematic, cand-04). */
export async function certifiedT2Graph(): Promise<OrganizationGraph> {
  return readOrganizationGraphFile(
    join(domainRoot, "organizations", "org.documentary-cinematic-remaster-cand-04.json"),
  );
}

/** The T4 candidate that ATTEMPTS the required capability (standard tools, cand-16). */
export function attemptingT4Graph(): OrganizationGraph {
  const result = searchOrganizations({
    goal: forcedFailureScenario.goal,
    goalClass: forcedFailureScenario.goalClass,
    catalogs: {
      models: forcedFailureScenario.modelCatalog,
      capabilities: forcedFailureScenario.capabilityCatalog,
    },
    policy: "cheapest-reliable",
    budgetEnvelopeUsd: forcedFailureScenario.budgetEnvelopeUsd,
  });
  const attempting = result.candidates.find(
    (candidate) => candidate.dimensionChoices.toolAllocation === "standard",
  );
  if (!attempting) throw new Error("T4 search produced no attempting candidate");
  return attempting.graph;
}

/** The T4 pipeline-best candidate (minimal profile — dodges the capability, cand-04). */
export function dodgerT4Graph(): OrganizationGraph {
  const result = searchOrganizations({
    goal: forcedFailureScenario.goal,
    goalClass: forcedFailureScenario.goalClass,
    catalogs: {
      models: forcedFailureScenario.modelCatalog,
      capabilities: forcedFailureScenario.capabilityCatalog,
    },
    policy: "cheapest-reliable",
    budgetEnvelopeUsd: forcedFailureScenario.budgetEnvelopeUsd,
  });
  const dodger = result.candidates.find(
    (candidate) => candidate.graph.id === "org.character-replacement-edit-cand-04",
  );
  if (!dodger) throw new Error("T4 search produced no dodger candidate cand-04");
  return dodger.graph;
}

/** The best T2 search graph (same recipe as simulation.test.ts). */
export function bestT2Graph(): OrganizationGraph {
  const result = searchOrganizations({
    goal: documentaryCinematicScenario.goal,
    goalClass: documentaryCinematicScenario.goalClass,
    catalogs: {
      models: documentaryCinematicScenario.modelCatalog,
      capabilities: documentaryCinematicScenario.capabilityCatalog,
    },
    policy: "cheapest-reliable",
    budgetEnvelopeUsd: documentaryCinematicScenario.budgetEnvelopeUsd,
  });
  const best = result.candidates[0];
  if (!best) throw new Error("T2 search must produce candidates");
  return best.graph;
}
