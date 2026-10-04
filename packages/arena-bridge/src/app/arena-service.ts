/**
 * Arena service (app layer, work order C): gap-store ingestion, the state
 * machine, expert-session ingest, certification validation and lab-availability
 * publishing. Side effects go through the GapStore port only; timestamps are
 * caller-supplied so committed evidence stays deterministic.
 */
import type {
  CapabilityGapReport,
  ExpertSessionRecord,
  GapSignalInput,
  GapStore,
  GapTransitionEntry,
} from "../contract.js";
import {
  CapabilityGapReportSchema,
  ExpertSessionRecordSchema,
} from "../domain/schema/capability-gap.js";
import {
  certifyGap,
  closeGap,
  ingestExpertSession,
  proposeCapability,
  publishAvailability,
  reportGap,
  requestArena,
  submitCertification,
} from "../domain/state-machine.js";
import type { CertificationProposal, CertificationValidation } from "../domain/certification.js";
import { validateCapabilityCertification } from "../domain/certification.js";
import type { LabAvailabilityPublication } from "../domain/publisher.js";
import {
  buildLabAvailabilityPublication,
  mergeIntoCapabilityCatalog,
} from "../domain/publisher.js";
import type { CapabilityDescriptor } from "@gen/media-capabilities";

export interface ArenaServiceDeps {
  readonly gapStore?: GapStore;
}

export interface ArenaService {
  /** Ingest a gap signal (lab/router emit, P5) → detected record. */
  readonly ingestSignal: (signal: GapSignalInput) => CapabilityGapReport;
  /** detected → reported: recorded in the committed store (P6). */
  readonly record: (gapId: string, at: string) => CapabilityGapReport;
  /** reported → arena-requested: the request carries the evidence bundle. */
  readonly requestArena: (gapId: string, at: string) => CapabilityGapReport;
  /** arena-requested → expert-session (or terminal, per the session decision). */
  readonly ingestExpertSession: (session: ExpertSessionRecord, at: string) => CapabilityGapReport[];
  /** expert-session → proposed. */
  readonly propose: (gapId: string, proposedCapabilityId: string, at: string) => CapabilityGapReport;
  /** proposed → certifying, gated on the standard capability check (no Arena exemption). */
  readonly submitCertification: (
    gapId: string,
    proposal: CertificationProposal,
    at: string,
  ) => { report: CapabilityGapReport; validation: CertificationValidation };
  /** certifying → certified. */
  readonly certify: (gapId: string, at: string) => CapabilityGapReport;
  /** certified → available + the lab-availability publication. */
  readonly publish: (
    gapId: string,
    descriptor: CapabilityDescriptor,
    at: string,
  ) => { report: CapabilityGapReport; publication: LabAvailabilityPublication };
  /** rejected / wont-fix with recorded rationale. */
  readonly close: (gapId: string, to: "rejected" | "wont-fix", rationale: string, at: string) => CapabilityGapReport;
  readonly list: () => readonly CapabilityGapReport[];
  readonly get: (gapId: string) => CapabilityGapReport | undefined;
}

type TransitionFn = (report: CapabilityGapReport) => { ok: true; report: CapabilityGapReport } | { ok: false; issue: string };

export function createArenaService(deps: ArenaServiceDeps = {}): ArenaService {
  const store = deps.gapStore;
  const require = (gapId: string): CapabilityGapReport => {
    const report = store?.get(gapId);
    if (report) return report;
    throw new Error(`gap ${gapId} not found in the arena store`);
  };
  const apply = (
    gapId: string,
    via: string,
    at: string,
    transition: TransitionFn,
    detail?: string,
  ): CapabilityGapReport => {
    const before = require(gapId);
    const result = transition(before);
    if (!result.ok) throw new Error(`${via}: ${result.issue}`);
    store?.save(result.report);
    const entry: GapTransitionEntry = {
      gapId,
      from: before.arena.state,
      to: result.report.arena.state,
      at,
      via,
      ...(detail !== undefined ? { detail } : {}),
    };
    store?.appendTransition(entry);
    return result.report;
  };
  return {
    ingestSignal: (signal) => {
      const parsed = CapabilityGapReportSchema.safeParse({
        ...signal,
        arena: { state: "detected" },
      });
      if (!parsed.success) {
        throw new Error(
          `gap signal ${signal.gapId}: schema violation: ${parsed.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; ")}`,
        );
      }
      store?.save(parsed.data);
      return parsed.data;
    },
    record: (gapId, at) => apply(gapId, "record", at, reportGap),
    requestArena: (gapId, at) => {
      const requestId = `req.${gapId.replace(/^gap\./, "")}`;
      return apply(gapId, "requestArena", at, (report) => requestArena(report, requestId));
    },
    ingestExpertSession: (session, at) => {
      const parsed = ExpertSessionRecordSchema.safeParse(session);
      if (!parsed.success) {
        throw new Error(
          `expert session ${session.sessionId}: schema violation: ${parsed.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; ")}`,
        );
      }
      const results: CapabilityGapReport[] = [];
      for (const gapId of parsed.data.gapIds) {
        results.push(
          apply(gapId, "ingestExpertSession", at, (report) => ingestExpertSession(report, parsed.data), parsed.data.decision),
        );
      }
      return results;
    },
    propose: (gapId, proposedCapabilityId, at) =>
      apply(gapId, "propose", at, (report) => proposeCapability(report, proposedCapabilityId)),
    submitCertification: (gapId, proposal, at) => {
      const validation = validateCapabilityCertification(proposal);
      if (!validation.ok) {
        return { report: require(gapId), validation };
      }
      const evidenceRef = `arena-bridge/src/domain/certifications/${proposal.proposedCapabilityId}.json`;
      const report = apply(gapId, "submitCertification", at, (current) =>
        submitCertification(current, evidenceRef),
      );
      return { report, validation };
    },
    certify: (gapId, at) => apply(gapId, "certify", at, certifyGap),
    publish: (gapId, descriptor, at) => {
      const report = apply(gapId, "publish", at, publishAvailability);
      const publicationResult = buildLabAvailabilityPublication(report, descriptor, at);
      if (!publicationResult.ok) throw new Error(`publish: ${publicationResult.issue}`);
      return { report, publication: publicationResult.publication };
    },
    close: (gapId, to, rationale, at) =>
      apply(gapId, "close", at, (report) => closeGap(report, to, rationale), rationale),
    list: () => store?.list() ?? [],
    get: (gapId) => store?.get(gapId),
  };
}

/** Fold a publication into a capability catalog view for organization search. */
export function catalogWithPublication(
  catalog: Parameters<typeof mergeIntoCapabilityCatalog>[0],
  publication: LabAvailabilityPublication,
): ReturnType<typeof mergeIntoCapabilityCatalog> {
  return mergeIntoCapabilityCatalog(catalog, publication);
}
