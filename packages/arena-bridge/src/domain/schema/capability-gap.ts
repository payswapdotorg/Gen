/**
 * Zod binding for spec/schemas/capability-gap.schema.json (lock §6: parity
 * mandatory; the JSON Schema is the source of truth — this mirror must not
 * drift). Cross-field semantics (state machine legality) are enforced by
 * domain/state-machine.ts on top of this structural binding.
 */
import { z } from "zod";

const gapIdPattern = /^gap\.[a-z0-9-]+$/;

export const GapRequestedCapabilitySchema = z
  .object({
    intent: z.string().min(1),
    capabilityId: z.string().optional(),
    parameters: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const GapFailureEvidenceSchema = z
  .object({
    summary: z.string().min(1),
    routerDecisionTrace: z.string().optional(),
    comparisonTableRef: z.string().optional(),
    adapterErrorRecords: z.array(z.string()).optional(),
    organizationRunRef: z.string().optional(),
    artifactRefs: z.array(z.string()).optional(),
  })
  .strict();

export const GapImpactSchema = z
  .object({
    goalClass: z.string().min(1),
    severity: z.enum(["low", "medium", "high", "critical"]),
    frequency: z.string().optional(),
  })
  .strict();

export const GapArenaFieldsSchema = z
  .object({
    state: z.enum([
      "detected",
      "reported",
      "arena-requested",
      "expert-session",
      "proposed",
      "certifying",
      "certified",
      "available",
      "rejected",
      "wont-fix",
    ]),
    requestId: z.string().optional(),
    expertSessionRef: z.string().optional(),
    proposedCapabilityId: z.string().optional(),
    certificationEvidence: z.string().optional(),
    rationale: z.string().optional(),
  })
  .strict();

export const CapabilityGapReportSchema = z
  .object({
    gapId: z.string().regex(gapIdPattern),
    detectedAt: z.string().min(1),
    requestedCapability: GapRequestedCapabilitySchema,
    kind: z.enum([
      "missing-capability",
      "mapping-shortfall",
      "organizational-gap",
      "editor-coverage-gap",
    ]),
    failureEvidence: GapFailureEvidenceSchema,
    impact: GapImpactSchema,
    arena: GapArenaFieldsSchema,
  })
  .strict();

export type CapabilityGapReportInput = z.input<typeof CapabilityGapReportSchema>;

/** Expert-session record ingest (human-escalation-contract.md §1). */
export const ExpertSessionRecordSchema = z
  .object({
    sessionId: z.string().min(1),
    gapIds: z.array(z.string().min(1)).min(1),
    decision: z.enum(["propose-capability", "reject", "wont-fix", "needs-info"]),
    proposedCapabilityId: z.string().optional(),
    rationale: z.string().min(1),
    recordedAt: z.string().min(1),
  })
  .strict();

export type ExpertSessionRecordInput = z.input<typeof ExpertSessionRecordSchema>;
