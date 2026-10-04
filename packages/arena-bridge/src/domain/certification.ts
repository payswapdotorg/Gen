/**
 * Certification-evidence validation (work order C10, human-escalation-contract
 * §1): an Arena-sourced capability passes the STANDARD capability gate
 * (lock §7: schema + conformance + mapping) — no Arena exemption. The gate
 * here is structural over the @gen/media-capabilities contract types (the
 * capability zod binding + conformance harness belong to that package; the
 * registry index itself stays there — this validator only judges proposals).
 */
import type { CapabilityDescriptor } from "@gen/media-capabilities";

/** The proposal bundle submitted for certification. */
export interface CertificationProposal {
  readonly proposedCapabilityId: string;
  /** Draft capability descriptor (status MUST be "draft" — active requires TL review). */
  readonly capabilityDescriptor: CapabilityDescriptor;
  /** Committed conformance scenario refs that were replayed. */
  readonly conformanceScenarioRefs: readonly string[];
  /** Mappings proven to execute (provider + adapter). */
  readonly providerMappingProofs: readonly {
    readonly providerId: string;
    readonly executionAdapter: string;
  }[];
}

export type CertificationValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly issues: readonly string[] };

const CAPABILITY_ID_PATTERN = /^(video|image|audio|editor|orchestration)\.[a-z0-9.-]+$/;

export function validateCapabilityCertification(
  proposal: CertificationProposal,
): CertificationValidation {
  const issues: string[] = [];
  const descriptor = proposal.capabilityDescriptor;

  // Schema gate: the descriptor is a schema-shaped capability entry.
  if (!CAPABILITY_ID_PATTERN.test(descriptor.id)) {
    issues.push(`descriptor id "${descriptor.id}" is not a dotted-domain capability id`);
  }
  if (descriptor.id !== proposal.proposedCapabilityId) {
    issues.push(
      `descriptor id ${descriptor.id} does not match the proposed capability id ${proposal.proposedCapabilityId}`,
    );
  }
  if (!/^\d+\.\d+\.\d+$/.test(descriptor.version)) {
    issues.push(`descriptor version "${descriptor.version}" must be semver`);
  }
  if (descriptor.status !== "draft") {
    issues.push(
      `Arena-sourced capabilities enter as draft (lock §7) — got status "${descriptor.status}"`,
    );
  }
  if (descriptor.summary.trim().length === 0) {
    issues.push("descriptor summary is empty");
  }
  if (descriptor.inputs.length === 0 || descriptor.outputs.length === 0) {
    issues.push("descriptor must declare at least one input and one output artifact port");
  }
  if (descriptor.qualityDimensions.length === 0) {
    issues.push("descriptor must declare at least one quality dimension");
  }

  // Mapping gate: at least one executable mapping with a proven adapter.
  const executable = descriptor.providerMappings.filter(
    (mapping) => mapping.maturity !== "planned" && mapping.executionAdapter.trim().length > 0,
  );
  if (executable.length === 0) {
    issues.push("no executable provider mapping (maturity ≠ planned, adapter named)");
  }
  for (const proof of proposal.providerMappingProofs) {
    const matches = descriptor.providerMappings.some(
      (mapping) =>
        mapping.providerId === proof.providerId &&
        mapping.executionAdapter === proof.executionAdapter,
    );
    if (!matches) {
      issues.push(
        `provider mapping proof (${proof.providerId}/${proof.executionAdapter}) does not match any declared mapping`,
      );
    }
  }
  if (proposal.providerMappingProofs.length === 0) {
    issues.push("at least one provider mapping proof is required");
  }

  // Conformance gate: the descriptor references scenarios AND the replay refs.
  if (descriptor.conformance.scenarios.length === 0) {
    issues.push("descriptor conformance must reference at least one scenario");
  }
  if (proposal.conformanceScenarioRefs.length === 0) {
    issues.push("certification requires replayed conformance scenario refs");
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}
