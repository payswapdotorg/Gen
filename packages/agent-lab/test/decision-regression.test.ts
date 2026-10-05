/**
 * Determinism regression lock (work order W6 §2, task A2): pins the CURRENT
 * event stream, replayHash, telemetry, task plans, gap signals, artifacts and
 * criteria results of the committed scenarios — documentary-cinematic A (T2,
 * committed certified graph) and forced-failure B (T4: pipeline-best dodger
 * cand-04 whose replayHash is committed in the evaluation record, plus the
 * attempting candidate cand-16 whose run the committed gap report cites).
 *
 * These fingerprints were captured at the base SHA BEFORE the W6 escalation
 * work landed; they must pass before AND after (the scripted-approval path is
 * byte-stable by contract — the hashed core never gains fields).
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { SimulationRunRecord } from "../src/contract.js";
import { replayHash, runSimulation } from "../src/index.js";
import {
  certifiedT2Graph,
  attemptingT4Graph,
  dodgerT4Graph,
} from "./helpers/graphs.js";
import { documentaryCinematicScenario, forcedFailureScenario } from "../src/domain/scenarios/index.js";

interface Pinned {
  readonly label: string;
  readonly replayHash: string;
  readonly eventsHash: string;
  readonly telemetryHash: string;
  readonly taskPlansHash: string;
  readonly gapSignalsHash: string;
  readonly artifactsHash: string;
  readonly criteriaHash: string;
  readonly virtualClockMs: number;
  readonly runId: string;
  readonly finished: boolean;
  readonly failureReason: string | undefined;
  readonly eventTypes: readonly string[];
  readonly totalSpendUsd: number;
  readonly approvalCount: number;
  readonly criteriaMet: number;
  readonly criteriaTotal: number;
  readonly runFinishedDetail: string;
}

/** BEFORE fingerprints (captured at base SHA 80fe45c via replayHash of each component). */
const PINNED: readonly Pinned[] = [
  {
    label: "A documentary-cinematic @ org.documentary-cinematic-remaster-cand-04",
    replayHash: "3474f812",
    eventsHash: "77988780",
    telemetryHash: "f73a9398",
    taskPlansHash: "5d7a15b3",
    gapSignalsHash: "741638a5",
    artifactsHash: "f1fce683",
    criteriaHash: "c9cfdc66",
    virtualClockMs: 155000,
    runId: "run-documentary-cinematic-b5b6cd",
    finished: true,
    failureReason: undefined,
    eventTypes: [
      "stage-started", "node-acted", "approval-recorded", "stage-completed", "plan-updated",
      "stage-started", "node-acted", "capability-invoked", "artifact-produced", "capability-invoked", "artifact-produced", "stage-completed", "plan-updated",
      "stage-started", "node-acted", "capability-invoked", "artifact-produced", "capability-invoked", "artifact-produced", "capability-invoked", "artifact-produced", "node-acted", "capability-invoked", "artifact-produced", "capability-invoked", "artifact-produced", "stage-completed", "plan-updated",
      "stage-started", "node-acted", "review-verdict", "review-verdict", "review-verdict", "review-verdict", "review-verdict", "review-verdict", "review-verdict", "stage-completed", "plan-updated",
      "stage-started", "capability-invoked", "artifact-produced", "stage-completed", "plan-updated",
      "run-finished",
    ],
    totalSpendUsd: 5.88,
    approvalCount: 1,
    criteriaMet: 6,
    criteriaTotal: 6,
    runFinishedDetail:
      "Run run-documentary-cinematic-b5b6cd finished: 8 artifacts, 0 gap signal(s), $5.88 spend.",
  },
  {
    label: "B forced-failure @ org.character-replacement-edit-cand-04 (committed record)",
    replayHash: "1c96af5b",
    eventsHash: "20723775",
    telemetryHash: "f8212d89",
    taskPlansHash: "822ef93e",
    gapSignalsHash: "741638a5",
    artifactsHash: "2d13ea06",
    criteriaHash: "e6bbc262",
    virtualClockMs: 48000,
    runId: "run-forced-failure-9d0daa",
    finished: true,
    failureReason: undefined,
    eventTypes: [
      "stage-started", "node-acted", "approval-recorded", "stage-completed", "plan-updated",
      "stage-started", "node-acted", "capability-invoked", "artifact-produced", "stage-completed", "plan-updated",
      "stage-started", "node-acted", "review-verdict", "stage-completed", "plan-updated",
      "stage-started", "capability-invoked", "artifact-produced", "stage-completed", "plan-updated",
      "run-finished",
    ],
    totalSpendUsd: 2.8,
    approvalCount: 1,
    criteriaMet: 4,
    criteriaTotal: 5,
    runFinishedDetail:
      "Run run-forced-failure-9d0daa finished: 2 artifacts, 0 gap signal(s), $2.80 spend.",
  },
  {
    label: "B forced-failure @ org.character-replacement-edit-cand-16 (attempting, gap-report run)",
    replayHash: "9c993457",
    eventsHash: "ddd19b54",
    telemetryHash: "b268f04b",
    taskPlansHash: "376e067b",
    gapSignalsHash: "10b74d0d",
    artifactsHash: "20d6fc75",
    criteriaHash: "f048966b",
    virtualClockMs: 180000,
    runId: "run-forced-failure-ef3335",
    finished: true,
    failureReason: undefined,
    eventTypes: [
      "stage-started", "node-acted", "approval-recorded", "stage-completed", "plan-updated",
      "stage-started", "node-acted", "capability-invoked", "artifact-produced", "capability-invoked", "artifact-produced", "capability-invoked", "gap-signaled", "capability-invoked", "artifact-produced", "stage-completed", "plan-updated",
      "stage-started", "node-acted", "node-acted", "capability-invoked", "artifact-produced", "capability-invoked", "artifact-produced", "review-verdict", "review-verdict", "review-verdict", "review-verdict", "review-verdict", "review-verdict", "review-verdict", "review-verdict", "stage-completed", "plan-updated",
      "stage-started", "capability-invoked", "artifact-produced", "stage-completed", "plan-updated",
      "run-finished",
    ],
    totalSpendUsd: 6.9,
    approvalCount: 1,
    criteriaMet: 3,
    criteriaTotal: 5,
    runFinishedDetail:
      "Run run-forced-failure-ef3335 finished: 6 artifacts, 1 gap signal(s), $6.90 spend.",
  },
];

const APPROVAL_DETAIL = 'Human n1 (human operator) gate "Final delivery approval gate.": approve.';
const NODE_ACTED_DETAILS: Readonly<Record<string, readonly string[]>> = {
  "run-documentary-cinematic-b5b6cd": [
    "n2 (body.director) acted (model zai/glm-5.3).",
    "n3 (body.video-editor) acted (model open-models/wan-vace-14b).",
    "n4 (body.color-specialist) acted (model open-models/vace-frame-edit).",
    "n5 (body.audio-specialist) acted (model zai/glm-5.3-voice).",
    "n6 (body.critic) acted (model zai/glm-5.3-voice).",
  ],
  "run-forced-failure-ef3335": [
    "n2 (body.director) acted (model zai/glm-5.3).",
    "n3 (body.video-editor) acted (model open-models/wan-vace-14b).",
    "n5 (body.critic) acted (model zai/glm-5.3-voice).",
    "n4 (body.video-continuity-supervisor) acted (model open-models/wan-vace-14b).",
  ],
  "run-forced-failure-9d0daa": [
    "n2 (body.director) acted (model zai/glm-5.3).",
    "n3 (body.video-editor) acted (model open-models/wan-vace-14b).",
    "n4 (body.critic) acted (model zai/glm-5.3-voice).",
  ],
};

async function pinnedRuns(): Promise<readonly { pinned: Pinned; run: SimulationRunRecord }[]> {
  return [
    { pinned: PINNED[0] as Pinned, run: runSimulation(documentaryCinematicScenario, await certifiedT2Graph()) },
    { pinned: PINNED[1] as Pinned, run: runSimulation(forcedFailureScenario, dodgerT4Graph()) },
    { pinned: PINNED[2] as Pinned, run: runSimulation(forcedFailureScenario, attemptingT4Graph()) },
  ];
}

test("regression lock: committed scenario replays keep their pinned replayHash", async () => {
  for (const { pinned, run } of await pinnedRuns()) {
    assert.equal(run.replayHash, pinned.replayHash, `${pinned.label}: replayHash`);
  }
});

test("regression lock: event streams are byte-stable (hash + types + details)", async () => {
  for (const { pinned, run } of await pinnedRuns()) {
    assert.equal(replayHash(run.events), pinned.eventsHash, `${pinned.label}: events hash`);
    assert.deepEqual(
      run.events.map((event) => event.type),
      [...pinned.eventTypes],
      `${pinned.label}: event type sequence`,
    );
    assert.deepEqual(
      run.events.map((event) => event.seq),
      run.events.map((_, index) => index + 1),
      `${pinned.label}: seq numbering`,
    );
    const acted = run.events.filter((event) => event.type === "node-acted").map((event) => event.detail);
    assert.deepEqual(acted, NODE_ACTED_DETAILS[pinned.runId], `${pinned.label}: node-acted details`);
    const finished = run.events.at(-1);
    assert.ok(finished && finished.type === "run-finished");
    assert.equal(finished.detail, pinned.runFinishedDetail, `${pinned.label}: run-finished detail`);
  }
});

test("regression lock: scripted approval events stay exactly as today", async () => {
  for (const { run } of await pinnedRuns()) {
    const approvals = run.events.filter((event) => event.type === "approval-recorded");
    assert.equal(approvals.length, 1);
    const [event] = approvals;
    if (!event) throw new Error("unreachable");
    assert.equal(event.seq, 3);
    assert.equal(event.atMs, 2000);
    assert.equal(event.node, "n1");
    assert.equal(event.detail, APPROVAL_DETAIL);
  }
});

test("regression lock: telemetry, plans, gaps, artifacts, criteria are byte-stable", async () => {
  for (const { pinned, run } of await pinnedRuns()) {
    assert.equal(replayHash(run.telemetry), pinned.telemetryHash, `${pinned.label}: telemetry hash`);
    assert.equal(replayHash(run.taskPlans), pinned.taskPlansHash, `${pinned.label}: taskPlans hash`);
    assert.equal(replayHash(run.gapSignals), pinned.gapSignalsHash, `${pinned.label}: gapSignals hash`);
    assert.equal(replayHash(run.artifacts), pinned.artifactsHash, `${pinned.label}: artifacts hash`);
    assert.equal(replayHash(run.criteriaResults), pinned.criteriaHash, `${pinned.label}: criteria hash`);
    assert.equal(run.virtualClockMs, pinned.virtualClockMs, `${pinned.label}: virtual clock`);
    assert.equal(run.runId, pinned.runId, `${pinned.label}: runId`);
    assert.equal(run.finished, pinned.finished, `${pinned.label}: finished`);
    assert.equal(run.failureReason, pinned.failureReason, `${pinned.label}: failureReason`);
    assert.equal(run.telemetry.totalSpendUsd, pinned.totalSpendUsd, `${pinned.label}: total spend`);
    assert.equal(run.telemetry.approvalCount, pinned.approvalCount, `${pinned.label}: approval count`);
    assert.equal(
      run.criteriaResults.filter((criterion) => criterion.met).length,
      pinned.criteriaMet,
      `${pinned.label}: criteria met`,
    );
    assert.equal(run.criteriaResults.length, pinned.criteriaTotal, `${pinned.label}: criteria total`);
  }
});

test("regression lock: two replays are deep-equal (no hidden nondeterminism)", async () => {
  const graph = await certifiedT2Graph();
  const first = runSimulation(documentaryCinematicScenario, graph);
  const second = runSimulation(documentaryCinematicScenario, graph);
  assert.deepEqual(first, second);
});
