/**
 * Success-criteria evaluation over a simulated run (organization-lab §3).
 * Extracted verbatim from the engine (W6) to keep engine.ts within the
 * architecture line budget — pure, deterministic, same outputs.
 */
import type { SimulationRunRecord } from "../../contract.js";
import type { ScenarioDescriptor } from "./scenario-types.js";

export function evaluateCriteria(
  scenario: ScenarioDescriptor,
  record: Omit<SimulationRunRecord, "replayHash" | "criteriaResults">,
  caughtDefects: ReadonlySet<string>,
  invokedCapabilities: ReadonlySet<string>,
): SimulationRunRecord["criteriaResults"] {
  return scenario.successCriteria.map((criterion) => {
    let met = false;
    if (criterion.id === "goal-class-served") {
      met = record.finished && record.gapSignals.length === 0 && record.artifacts.length > 0;
    } else if (criterion.id === "no-capability-gaps") {
      met = record.gapSignals.length === 0;
    } else if (criterion.id === "all-defects-caught") {
      met = scenario.defects.every((defect) => caughtDefects.has(defect.description));
    } else if (criterion.id === "budget-adhered") {
      met = record.telemetry.totalSpendUsd <= scenario.budgetEnvelopeUsd;
    } else if (criterion.id === "reviews-completed") {
      met = record.events.some((event) => event.type === "review-verdict");
    } else if (criterion.id === "required-capabilities-invoked") {
      met = (scenario.requiredCapabilities ?? []).every((capabilityId) =>
        invokedCapabilities.has(capabilityId),
      );
    }
    return { id: criterion.id, description: criterion.description, met };
  });
}
