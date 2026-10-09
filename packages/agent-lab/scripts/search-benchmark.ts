/**
 * Search benchmark + comparative harness (W13, organization-lab §2): measures
 * the search → simulate → evaluate loop on the committed scenarios.
 *
 *  - `--profile` reproduces the W13 baseline profile of the rule engine
 *    (candidates/sec, simulation wall time per candidate, evaluation time,
 *    peak RSS via /proc VmHWM, top-10 fitness distribution).
 *  - default mode runs every method at an EQUAL evaluation budget
 *    (`--budget`, default 24 candidate evaluations): fitness-driven methods
 *    consume it internally; rule (surrogate-only by design) gets the same
 *    opportunity on the harness side by fully evaluating its top-E ranked
 *    candidates. Reports the top-ranked candidate fitness per method plus
 *    wall time — honest numbers from actual runs, no cherry-picking.
 *
 * Run: node --import tsx scripts/search-benchmark.ts [--methods rule,beam,...]
 *       [--budget 24] [--top 10] [--profile]
 */
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { runOrganizationSearch } from "../src/domain/search/method-registry.js";
import { runSimulation } from "../src/domain/simulation/engine.js";
import { evaluateRun } from "../src/domain/evaluation.js";
import {
  documentaryCinematicScenario,
  forcedFailureScenario,
} from "../src/domain/scenarios/index.js";

const args = new Set(process.argv.slice(2));
const valueOf = (flag: string, fallback: string): string => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
};
const methods = valueOf("--methods", "rule,beam,evolutionary,bandit").split(",");
const budget = Number(valueOf("--budget", "24"));
const top = Number(valueOf("--top", "10"));
const beamWidth = Number(valueOf("--beam-width", "4"));
const scenarios = [documentaryCinematicScenario, forcedFailureScenario];

function peakRssMb(): number {
  try {
    const status = readFileSync("/proc/self/status", "utf8");
    const hwm = /VmHWM:\s+(\d+) kB/.exec(status);
    return hwm ? Number(hwm[1]) / 1024 : NaN;
  } catch {
    return NaN;
  }
}

function mean(xs: readonly number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

if (args.has("--profile")) {
  console.log(`=== W13 search profile (rule engine) — equal to the pre-change baseline harness ===`);
  for (const scenario of scenarios) {
    const request = {
      goal: scenario.goal,
      goalClass: scenario.goalClass,
      catalogs: { models: scenario.modelCatalog, capabilities: scenario.capabilityCatalog },
      policy: "cheapest-reliable" as const,
      budgetEnvelopeUsd: scenario.budgetEnvelopeUsd,
    };
    const samples: number[] = [];
    let result = runOrganizationSearch(request);
    for (let i = 0; i < 20; i += 1) {
      const t0 = performance.now();
      result = runOrganizationSearch(request);
      samples.push(performance.now() - t0);
    }
    samples.sort((a, b) => a - b);
    const medianMs = samples[Math.floor(samples.length / 2)] as number;
    const simMs: number[] = [];
    const evalMs: number[] = [];
    const fitnesses: number[] = [];
    for (const candidate of result.candidates.slice(0, top)) {
      const t0 = performance.now();
      const run = runSimulation(scenario, candidate.graph);
      simMs.push(performance.now() - t0);
      const t1 = performance.now();
      fitnesses.push(evaluateRun(run, scenario).fitness);
      evalMs.push(performance.now() - t1);
    }
    console.log(`\n--- scenario ${scenario.id} (${scenario.goalClass}) ---`);
    console.log(`candidates generated: ${result.candidates.length}`);
    console.log(
      `search wall (median of 20): ${medianMs.toFixed(3)} ms -> ${((result.candidates.length / (medianMs / 1000))).toFixed(1)} candidates/sec`,
    );
    console.log(
      `simulation wall per candidate: mean ${mean(simMs).toFixed(3)} ms (min ${(Math.min(...simMs)).toFixed(3)}, max ${(Math.max(...simMs)).toFixed(3)}) over top-${top}`,
    );
    console.log(
      `evaluation time per candidate: mean ${mean(evalMs).toFixed(4)} ms (min ${(Math.min(...evalMs)).toFixed(4)}, max ${(Math.max(...evalMs)).toFixed(4)})`,
    );
    console.log(`peak RSS (VmHWM): ${peakRssMb().toFixed(1)} MB`);
    console.log(`top-${top} ranked candidates (preScore order) fitness:`);
    result.candidates.slice(0, top).forEach((candidate, i) => {
      console.log(`  #${i + 1} ${candidate.graph.id} preScore=${candidate.preScore.toFixed(4)} fitness=${fitnesses[i]?.toFixed(4)}`);
    });
  }
  process.exit(0);
}

console.log(`=== W13 comparative: all methods at equal evaluation budget E=${budget} per scenario ===`);
for (const scenario of scenarios) {
  console.log(`\n--- scenario ${scenario.id} (${scenario.goalClass}) ---`);
  for (const method of methods) {
    const request = {
      goal: scenario.goal,
      goalClass: scenario.goalClass,
      catalogs: { models: scenario.modelCatalog, capabilities: scenario.capabilityCatalog },
      policy: "cheapest-reliable" as const,
      budgetEnvelopeUsd: scenario.budgetEnvelopeUsd,
      scenarios: [scenario],
      method,
      seed: `w13-comparative`,
      options:
        method === "rule"
          ? undefined
          : method === "beam"
            ? { evaluationBudget: budget, beamWidth }
            : { evaluationBudget: budget },
    };
    const searchStart = performance.now();
    const outcome = runOrganizationSearch(request);
    const searchWall = performance.now() - searchStart;

    // Equal-opportunity evaluation: rule consumed 0 internal evaluations, so
    // the harness fully evaluates its top-E candidates; every method's
    // top-ranked candidate is measured the same way.
    const rankOne = outcome.candidates[0];
    let rankOneFitness: number | undefined;
    const evalStart = performance.now();
    if (rankOne !== undefined) {
      rankOneFitness = evaluateRun(runSimulation(scenario, rankOne.graph), scenario).fitness;
    }
    let ruleBestOfBudget: number | undefined;
    if (method === "rule") {
      const fitnesses = outcome.candidates
        .slice(0, budget)
        .map((candidate) => evaluateRun(runSimulation(scenario, candidate.graph), scenario).fitness);
      ruleBestOfBudget = fitnesses.length > 0 ? Math.max(...fitnesses) : undefined;
    }
    const evalWall = performance.now() - evalStart;
    const internalBest = outcome.telemetry.bestEvaluatedFitness;
    const bestWithinBudget =
      method === "rule"
        ? ruleBestOfBudget
        : Math.max(...[internalBest, rankOneFitness].filter((x): x is number => x !== undefined));
    console.log(
      `${method}: emitted=${outcome.candidates.length} internalEvals=${outcome.telemetry.evaluationsRun} top=${rankOne?.graph.id} preScore=${rankOne?.preScore.toFixed(4)} rank1Fitness=${rankOneFitness?.toFixed(4)} bestWithinBudget=${bestWithinBudget?.toFixed(4)} searchWall=${outcome.telemetry.wallTimeMs.toFixed(0)}ms(${searchWall.toFixed(0)}ms measured) evalWall=${evalWall.toFixed(0)}ms detail=${JSON.stringify(outcome.telemetry.detail)}`,
    );
    if (rankOne !== undefined) {
      console.log(
      `  top-ranked dimensionChoices: ${JSON.stringify(rankOne.dimensionChoices)} evaluatedFitness=${rankOne.evaluatedFitness?.toFixed(4)}`,
      );
    }
  }
}
console.log(`\nfinal peak RSS (VmHWM): ${peakRssMb().toFixed(1)} MB`);
