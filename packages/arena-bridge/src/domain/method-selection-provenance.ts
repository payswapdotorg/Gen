/**
 * Method-selection provenance (W14 — the provenance ladder's top rung): maps
 * a committed selection-ledger record from the lab onto the Arena plane as a
 * proposal-style record citing its evidence chain
 * (ledger record → telemetry → certified evaluation), with a
 * draft → certified → published lifecycle consistent with the existing
 * state-machine.ts (guarded legality, exactly-one-step chain transitions,
 * terminal published state, pure functions over records — no IO, no clocks;
 * timestamps are caller-supplied so committed evidence stays deterministic).
 *
 * arena-bridge does not import @gen/agent-lab (architecture policy): the
 * ledger entry arrives by file-based handoff and is structurally bound by
 * domain/schema/method-selection-provenance.ts. The mapping REFUSES evidence
 * that disagrees with the entry — the chain must audit clean, never
 * rubber-stamp.
 */
import type {
  MethodSelectionEvidenceChain,
  MethodSelectionLedgerEntry,
  MethodSelectionLedgerEntryInput,
  MethodSelectionProvenanceRecord,
  MethodSelectionProvenanceState,
  ProvenanceTelemetry,
} from "./schema/method-selection-provenance.js";
import { MethodSelectionLedgerEntrySchema } from "./schema/method-selection-provenance.js";

/** The lifecycle chain, in order (mirrors state-machine.ts's ARENA_CHAIN). */
export const PROVENANCE_CHAIN: readonly MethodSelectionProvenanceState[] = [
  "draft",
  "certified",
  "published",
];

export const PROVENANCE_TERMINAL_STATES: readonly MethodSelectionProvenanceState[] = ["published"];

export function isProvenanceTerminal(state: MethodSelectionProvenanceState): boolean {
  return PROVENANCE_TERMINAL_STATES.includes(state);
}

/** Guarded legality: chain transitions advance exactly one step; terminal states never move. */
export function canTransitionProvenance(
  from: MethodSelectionProvenanceState,
  to: MethodSelectionProvenanceState,
): boolean {
  if (from === to) return false;
  if (isProvenanceTerminal(from)) return false;
  const index = PROVENANCE_CHAIN.indexOf(from);
  const target = PROVENANCE_CHAIN.indexOf(to);
  if (index === -1 || target === -1) return false;
  return target === index + 1;
}

/** The learned policy's method name (self-delegation would recurse). */
const LEARNED_METHOD = "learned";

/**
 * FNV-1a 32-bit (mirrors @gen/agent-lab's domain/simulation/rng.ts — the
 * file-based-handoff convention; the digest in a provenanceId equals the
 * digest segment of the cited ledger record's committed file name).
 */
function fnv1a32(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Mirrors the lab's selectionRecordKey (goalClass|method|seed|budget). */
function ledgerEntryKey(entry: MethodSelectionLedgerEntry): string {
  return [
    entry.goalClass,
    entry.method,
    entry.seed,
    entry.evaluationBudget === undefined ? "unbounded" : String(entry.evaluationBudget),
  ].join("|");
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "x";
}

/** Deterministic provenance id: msp.<goalClass>.<method>.<digest8>. */
export function provenanceIdOf(entry: MethodSelectionLedgerEntry): string {
  return `msp.${slug(entry.goalClass)}.${slug(entry.method)}.${fnv1a32(ledgerEntryKey(entry))}`;
}

/** The mapping input: the ledger entry + its evidence chain (+ prose). */
export interface MethodSelectionProvenanceMappingInput {
  readonly entry: MethodSelectionLedgerEntryInput;
  readonly evidence: MethodSelectionEvidenceChain;
  readonly notes?: string;
}

export type ProvenanceMappingResult =
  | { readonly ok: true; readonly record: MethodSelectionProvenanceRecord }
  | { readonly ok: false; readonly issues: readonly string[] };

/**
 * Map a selection record to its Arena provenance record (state: draft). The
 * evidence chain must AGREE with the entry on every shared fact — method,
 * seed, the telemetry counts, the delegated target for learned selections,
 * and the certified evaluation for certified selections. Divergence is
 * refused with the full issue list (audit, never rubber-stamp).
 */
export function mapSelectionToProvenance(
  input: MethodSelectionProvenanceMappingInput,
): ProvenanceMappingResult {
  const issues: string[] = [];
  const parsed = MethodSelectionLedgerEntrySchema.safeParse(input.entry);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => `entry.${issue.path.join(".")}: ${issue.message}`),
    };
  }
  const entry = parsed.data;
  const { evidence } = input;

  if (evidence.ledgerRecordRef.trim().length === 0) {
    issues.push("evidence.ledgerRecordRef: the ledger record reference is required");
  }
  const telemetry: ProvenanceTelemetry = evidence.telemetry;
  if (telemetry.method !== entry.method) {
    issues.push(`evidence.telemetry.method "${telemetry.method}" does not match the entry method "${entry.method}"`);
  }
  if (telemetry.seed !== entry.seed) {
    issues.push(`evidence.telemetry.seed "${telemetry.seed}" does not match the entry seed "${entry.seed}"`);
  }
  if (telemetry.candidatesConsidered !== entry.candidatesConsidered) {
    issues.push(
      `evidence.telemetry.candidatesConsidered ${telemetry.candidatesConsidered} != entry ${entry.candidatesConsidered}`,
    );
  }
  if (telemetry.candidatesEmitted !== entry.candidatesEmitted) {
    issues.push(
      `evidence.telemetry.candidatesEmitted ${telemetry.candidatesEmitted} != entry ${entry.candidatesEmitted}`,
    );
  }
  if (telemetry.evaluationsRun !== entry.evaluationsRun) {
    issues.push(
      `evidence.telemetry.evaluationsRun ${telemetry.evaluationsRun} != entry ${entry.evaluationsRun}`,
    );
  }
  // delegatedTo is exactly the learned policy's decision fact.
  if (entry.method === LEARNED_METHOD) {
    if (telemetry.delegatedTo === undefined) {
      issues.push("evidence.telemetry.delegatedTo: required for a learned selection (the decision's key fact)");
    } else if (telemetry.delegatedTo === LEARNED_METHOD) {
      issues.push('evidence.telemetry.delegatedTo: "learned" would recurse — the lab policy excludes it');
    }
  } else if (telemetry.delegatedTo !== undefined) {
    issues.push(
      `evidence.telemetry.delegatedTo: only learned selections delegate (entry method is "${entry.method}")`,
    );
  }
  // The certified-evaluation rung exists iff the selection certified.
  if (entry.certified === true) {
    if (evidence.certifiedEvaluationRef === undefined) {
      issues.push("evidence.certifiedEvaluationRef: required — the selection certified");
    }
    if (evidence.certifiedFitness === undefined) {
      issues.push("evidence.certifiedFitness: required — the selection certified");
    }
  } else if (evidence.certifiedEvaluationRef !== undefined || evidence.certifiedFitness !== undefined) {
    issues.push("evidence.certifiedEvaluationRef/certifiedFitness: a certified evaluation can only be cited by a certified selection");
  }
  if (
    evidence.certifiedFitness !== undefined &&
    entry.rankedBestFitness !== undefined &&
    evidence.certifiedFitness !== entry.rankedBestFitness
  ) {
    issues.push(
      `evidence.certifiedFitness ${evidence.certifiedFitness} != entry.rankedBestFitness ${entry.rankedBestFitness} — the chain must agree`,
    );
  }

  if (issues.length > 0) return { ok: false, issues };

  const record: MethodSelectionProvenanceRecord = {
    provenanceId: provenanceIdOf(entry),
    goalClass: entry.goalClass,
    method: entry.method,
    seed: entry.seed,
    ...(entry.evaluationBudget !== undefined ? { evaluationBudget: entry.evaluationBudget } : {}),
    candidatesConsidered: entry.candidatesConsidered,
    candidatesEmitted: entry.candidatesEmitted,
    evaluationsRun: entry.evaluationsRun,
    ...(entry.rankedBestFitness !== undefined ? { rankedBestFitness: entry.rankedBestFitness } : {}),
    ...(entry.certified !== undefined ? { certified: entry.certified } : {}),
    ...(entry.selectedAt !== undefined ? { selectedAt: entry.selectedAt } : {}),
    evidence,
    lifecycle: { state: "draft" },
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    generatedBy: "@gen/arena-bridge method-selection-provenance mapSelectionToProvenance",
  };
  return { ok: true, record };
}

export type ProvenanceTransitionResult =
  | { readonly ok: true; readonly record: MethodSelectionProvenanceRecord }
  | { readonly ok: false; readonly issue: string };

function applyTransition(
  record: MethodSelectionProvenanceRecord,
  to: MethodSelectionProvenanceState,
  via: string,
  lifecycle: Partial<MethodSelectionProvenanceRecord["lifecycle"]>,
): ProvenanceTransitionResult {
  const from = record.lifecycle.state;
  if (!canTransitionProvenance(from, to)) {
    return {
      ok: false,
      issue: `${via}: illegal transition ${from} → ${to} for provenance record ${record.provenanceId}`,
    };
  }
  return { ok: true, record: { ...record, lifecycle: { ...record.lifecycle, ...lifecycle, state: to } } };
}

/**
 * draft → certified: only a selection that certified can advance (the
 * certified-evaluation rung of the chain is the evidence).
 */
export function certifyProvenance(
  record: MethodSelectionProvenanceRecord,
  at: string,
): ProvenanceTransitionResult {
  if (record.certified !== true) {
    return {
      ok: false,
      issue: `certifyProvenance: the mapped selection did not certify — ${record.provenanceId} cannot advance to certified`,
    };
  }
  return applyTransition(record, "certified", "certifyProvenance", { certifiedAt: at });
}

/** certified → published: the provenance step becomes an auditable Arena citizen. */
export function publishProvenance(
  record: MethodSelectionProvenanceRecord,
  at: string,
): ProvenanceTransitionResult {
  return applyTransition(record, "published", "publishProvenance", { publishedAt: at });
}
