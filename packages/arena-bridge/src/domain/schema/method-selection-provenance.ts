/**
 * Zod bindings for the W14 method-selection provenance records (the Arena
 * plane's top rung of the provenance ladder). arena-bridge does not require
 * @gen/agent-lab in the architecture policy, so the lab's frozen
 * selection-ledger record shape is MIRRORED here exactly (file-based handoff
 * contract — same pattern as GapSignalInput mirroring the capability-gap
 * schema; drift between the two shapes is a contract violation).
 *
 * The provenance record is a proposal-style Arena citizen: it embeds the
 * mapped selection record, cites its evidence chain (ledger record →
 * telemetry → certified evaluation), and carries a draft → certified →
 * published lifecycle (domain/method-selection-provenance.ts enforces the
 * transitions on top of this structural binding).
 */
import { z } from "zod";

/**
 * Mirror of @gen/agent-lab's MethodSelectionRecord (frozen field set —
 * selection-ledger.ts owns the canonical shape; this binding must not drift).
 */
export const MethodSelectionLedgerEntrySchema = z
  .object({
    goalClass: z.string().min(1),
    method: z.string().min(1),
    seed: z.string().min(1),
    evaluationBudget: z.number().int().positive().optional(),
    candidatesConsidered: z.number().int().nonnegative(),
    candidatesEmitted: z.number().int().nonnegative(),
    evaluationsRun: z.number().int().nonnegative(),
    rankedBestFitness: z.number().min(0).max(1).optional(),
    certified: z.boolean().optional(),
    selectedAt: z.string().min(1).optional(),
  })
  .strict();

export type MethodSelectionLedgerEntry = z.output<typeof MethodSelectionLedgerEntrySchema>;
export type MethodSelectionLedgerEntryInput = z.input<typeof MethodSelectionLedgerEntrySchema>;

/**
 * The telemetry rung of the evidence chain: the search telemetry the ledger
 * record was built from (frozen public keys), plus delegatedTo when the
 * selection was the learned policy's decision.
 */
export const ProvenanceTelemetrySchema = z
  .object({
    method: z.string().min(1),
    seed: z.string().min(1),
    candidatesConsidered: z.number().int().nonnegative(),
    candidatesEmitted: z.number().int().nonnegative(),
    evaluationsRun: z.number().int().nonnegative(),
    delegatedTo: z.string().min(1).optional(),
  })
  .strict();

export type ProvenanceTelemetry = z.output<typeof ProvenanceTelemetrySchema>;

/** ledger record → telemetry → certified evaluation. */
export const MethodSelectionEvidenceChainSchema = z
  .object({
    /** Repo-relative path of the committed ledger record this step maps. */
    ledgerRecordRef: z.string().min(1),
    telemetry: ProvenanceTelemetrySchema,
    /** Repo-relative path of the committed evaluation the selection produced
     * (present iff the selection certified). */
    certifiedEvaluationRef: z.string().min(1).optional(),
    certifiedFitness: z.number().min(0).max(1).optional(),
  })
  .strict();

export type MethodSelectionEvidenceChain = z.output<typeof MethodSelectionEvidenceChainSchema>;

/** The provenance record's lifecycle (consistent with domain/state-machine.ts). */
export const MethodSelectionProvenanceStateSchema = z.enum(["draft", "certified", "published"]);

export type MethodSelectionProvenanceState = z.output<typeof MethodSelectionProvenanceStateSchema>;

export const MethodSelectionProvenanceSchema = z
  .object({
    /** msp.<goalClass-slug>.<method-slug>.<digest8> — deterministic from the entry. */
    provenanceId: z.string().regex(/^msp\.[a-z0-9-]+\.[a-z0-9-]+\.[0-9a-f]{8}$/),
    goalClass: z.string().min(1),
    method: z.string().min(1),
    seed: z.string().min(1),
    evaluationBudget: z.number().int().positive().optional(),
    candidatesConsidered: z.number().int().nonnegative(),
    candidatesEmitted: z.number().int().nonnegative(),
    evaluationsRun: z.number().int().nonnegative(),
    rankedBestFitness: z.number().min(0).max(1).optional(),
    certified: z.boolean().optional(),
    selectedAt: z.string().min(1).optional(),
    evidence: MethodSelectionEvidenceChainSchema,
    lifecycle: z
      .object({
        state: MethodSelectionProvenanceStateSchema,
        certifiedAt: z.string().min(1).optional(),
        publishedAt: z.string().min(1).optional(),
      })
      .strict(),
    notes: z.string().min(1).optional(),
    generatedBy: z.string().min(1),
  })
  .strict();

export type MethodSelectionProvenanceRecord = z.output<typeof MethodSelectionProvenanceSchema>;
export type MethodSelectionProvenanceInput = z.input<typeof MethodSelectionProvenanceSchema>;
