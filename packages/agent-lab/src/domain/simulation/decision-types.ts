/**
 * Human-in-the-loop decision plane (spec/human-escalation-contract.md §3,
 * work/worker-6-escalation-loop.md): pure domain types for the collaboration
 * loop. At every approval edge the engine constructs a DecisionBundle (plan
 * delta + cost impact + available alternatives), pauses, and resolves a
 * HumanDecision through a DecisionPort. Humans may redirect — policy patch,
 * model swap (validated against the body's model requirement class, P2),
 * input supply — and every decision lands as a structured
 * HumanDecisionRecord on the run record (the decision trail).
 *
 * Determinism law (work order W6 §2): the decision bundles and the decision
 * trail are run-record EXTENSIONS keyed by approval-event seq; they are never
 * part of the replayHash input. The hashed core of SimulationRunRecord is
 * untouched (see SimulationRunRecordWithDecisions).
 */
import type {
  CognitiveModelBinding,
  DecisionTrailEntryView,
  DecisionTrailView,
  SimulationRunRecord,
  TaskPlan,
} from "../../contract.js";

/** Payloads a human may attach to a redirect decision (§3 "humans may redirect"). */
export type RedirectPayload =
  /**
   * Routing-policy change. Keys are "*" (every capability-invocation node in
   * the organization) or a single capability-invocation node id; values are
   * routing policy names ("premium-first" | "cheapest-reliable" |
   * "quality-first"). Invalid targets/values are recorded with reasons.
   */
  | { readonly policyPatch: Readonly<Record<string, string>> }
  /**
   * Rebind every node inhabited by a body to another model. The candidate is
   * resolved by model id in the scenario's frozen model catalog and validated
   * against the body's model requirement class (P2) — invalid swaps are
   * recorded with reasons, never applied.
   */
  | { readonly modelSwap: { readonly bodyId: string; readonly modelId: string } }
  /** Supply a missing input artifact to the run. */
  | { readonly inputSupply: { readonly artifactRef: string } };

/** The decision a human returns from an approval gate. */
export type HumanDecision =
  | { readonly kind: "approve" }
  | { readonly kind: "reject"; readonly reason?: string }
  | { readonly kind: "redirect"; readonly redirect: RedirectPayload };

/**
 * Port: the engine pauses at approval edges and resolves the human decision
 * through this interface (no IO in domain — adapters live in the app layer).
 */
export interface DecisionPort {
  resolveDecision(bundle: DecisionBundle): HumanDecision;
}

/** One alternative offered in a decision bundle (routing path or model swap). */
export type BundleAlternative =
  | {
      readonly id: string;
      readonly kind: "routing";
      readonly path: string;
      readonly tradeoffs: string;
    }
  | {
      readonly id: string;
      readonly kind: "model-swap";
      readonly bodyId: string;
      readonly current: CognitiveModelBinding;
      readonly candidate: CognitiveModelBinding;
      readonly tradeoffs: string;
    };

/** The decision bundle presented at an approval gate (P4: status, evidence, alternatives). */
export interface DecisionBundle {
  readonly gate: {
    readonly id: string;
    readonly stageId: string;
    readonly approver: { readonly nodeId: string; readonly role: string };
  };
  /** TaskPlan delta at the decision point: completed-with-evidence, next, blocked. */
  readonly planDelta: Pick<TaskPlan, "completed" | "next" | "blocked">;
  readonly costImpact: {
    readonly spendUsd: number;
    readonly envelopeUsd: number;
    readonly projectedRemainingUsd: number;
  };
  readonly alternatives: readonly BundleAlternative[];
}

/** Before/after diff of one node's routing policy (applied policyPatch evidence). */
export interface PolicyDiffEntry {
  readonly nodeId: string;
  readonly before: string;
  readonly after: string;
}

/** Before/after diff of one node's cognitive-model binding (applied modelSwap evidence). */
export interface ModelBindingDiff {
  readonly nodeId: string;
  readonly bodyId: string;
  readonly before: CognitiveModelBinding;
  readonly after: CognitiveModelBinding;
}

/** An applied (or rejected) redirect with the before/after evidence §3 demands. */
export interface AppliedRedirect {
  readonly payload: RedirectPayload;
  readonly applied: boolean;
  readonly policyDiff: readonly PolicyDiffEntry[];
  readonly modelBindingDiff: readonly ModelBindingDiff[];
  readonly suppliedInputs: readonly string[];
  readonly rejectedBecause: readonly string[];
}

/**
 * Structured decision-trail record: who (node id + role), when (clockMs +
 * event seq), what (decision + payload), from which alternatives (bundle
 * alternative ids). Keyed by the seq of the approval-recorded event.
 */
export interface HumanDecisionRecord {
  readonly gate: string;
  readonly who: { readonly nodeId: string; readonly role: string };
  readonly when: { readonly clockMs: number; readonly eventSeq: number };
  readonly decision: HumanDecision;
  readonly fromAlternatives: readonly string[];
  readonly redirect?: AppliedRedirect;
}

/** A bundle presented at a gate, keyed by the approval-recorded event seq. */
export interface DecisionBundleRecord {
  readonly eventSeq: number;
  readonly bundle: DecisionBundle;
}

/**
 * Run record plus the decision-plane extensions. The extensions ride ALONGSIDE
 * the hashed core (added after replayHash is computed) — a record with and a
 * record without them share the same replayHash when the event stream,
 * telemetry, plans, gaps, artifacts and criteria are identical.
 */
export interface SimulationRunRecordWithDecisions extends SimulationRunRecord {
  readonly decisionBundles: readonly DecisionBundleRecord[];
  readonly decisionTrail: readonly HumanDecisionRecord[];
}

/** Any run record that may carry the (optional) decision-trail extension. */
export type RunRecordWithOptionalTrail = SimulationRunRecord & {
  readonly decisionTrail?: readonly HumanDecisionRecord[];
};

/** Input for the pure trail-record builder (engine calls it at each approval edge). */
export interface DecisionRecordInput {
  readonly gate: string;
  readonly nodeId: string;
  readonly role: string;
  readonly eventSeq: number;
  readonly clockMs: number;
  readonly decision: HumanDecision;
  readonly bundle: DecisionBundle;
  readonly appliedRedirect?: AppliedRedirect;
}

/** Build one trail record from the gate context (pure). */
export function buildDecisionRecord(input: DecisionRecordInput): HumanDecisionRecord {
  return {
    gate: input.gate,
    who: { nodeId: input.nodeId, role: input.role },
    when: { clockMs: input.clockMs, eventSeq: input.eventSeq },
    decision: input.decision,
    fromAlternatives: input.bundle.alternatives.map((alternative) => alternative.id),
    ...(input.appliedRedirect === undefined ? {} : { redirect: input.appliedRedirect }),
  };
}

function describeDecision(record: HumanDecisionRecord): string {
  const decision = record.decision;
  if (decision.kind === "approve") return "approved";
  if (decision.kind === "reject") {
    return decision.reason === undefined ? "rejected" : `rejected — ${decision.reason}`;
  }
  const redirect = decision.redirect;
  if ("policyPatch" in redirect) {
    const keys = Object.keys(redirect.policyPatch);
    return `redirect — routing policy patch (${keys.length === 0 ? "no targets" : keys.join(", ")})`;
  }
  if ("modelSwap" in redirect) {
    return `redirect — model swap ${redirect.modelSwap.bodyId} → ${redirect.modelSwap.modelId}`;
  }
  return `redirect — input supplied ${redirect.inputSupply.artifactRef}`;
}

function notesOf(record: HumanDecisionRecord): string[] {
  const redirect = record.redirect;
  if (redirect === undefined) return [];
  const notes: string[] = [];
  for (const diff of redirect.policyDiff) {
    notes.push(`policy ${diff.nodeId}: "${diff.before}" → "${diff.after}"`);
  }
  for (const diff of redirect.modelBindingDiff) {
    notes.push(
      `model ${diff.nodeId} (${diff.bodyId}): ${diff.before.providerId}/${diff.before.modelId} → ${diff.after.providerId}/${diff.after.modelId}`,
    );
  }
  for (const ref of redirect.suppliedInputs) {
    notes.push(`input supplied: ${ref}`);
  }
  for (const reason of redirect.rejectedBecause) {
    notes.push(`rejected: ${reason}`);
  }
  return notes;
}

/**
 * Pure decision-trail view for workspace consumption (P4 tie-in, work order
 * task E8). Accepts any run record — plain records (no extension) yield an
 * empty entry list.
 */
export function decisionTrailOf(run: RunRecordWithOptionalTrail): DecisionTrailView {
  const trail = run.decisionTrail ?? [];
  const entries: DecisionTrailEntryView[] = trail.map((record) => ({
    eventSeq: record.when.eventSeq,
    gate: record.gate,
    actor: `${record.who.nodeId} (human ${record.who.role})`,
    atMs: record.when.clockMs,
    decision: record.decision.kind,
    summary: describeDecision(record),
    alternatives: [...record.fromAlternatives],
    applied: record.redirect === undefined ? true : record.redirect.applied,
    notes: notesOf(record),
  }));
  return { runId: run.runId, scenarioId: run.scenarioId, entries };
}
