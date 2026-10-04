/** Committed scenario fixtures (organization-lab §3) — git-tracked, seeded, hermetic. */
import type { ScenarioDescriptor } from "../simulation/scenario-types.js";
import { documentaryCinematicScenario } from "./documentary-cinematic.js";
import { forcedFailureScenario } from "./forced-failure.js";

export const SCENARIOS: readonly ScenarioDescriptor[] = [
  documentaryCinematicScenario,
  forcedFailureScenario,
];

export function findScenario(id: string): ScenarioDescriptor | undefined {
  return SCENARIOS.find((scenario) => scenario.id === id);
}

export { documentaryCinematicScenario, forcedFailureScenario };
