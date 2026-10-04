/**
 * Certification validation tests (work order C10, human-escalation-contract
 * §1): Arena-sourced capabilities pass the STANDARD gate (schema + conformance
 * + mapping) — there is no Arena exemption (lock §7).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CapabilityDescriptor } from "@gen/media-capabilities";
import { validateCapabilityCertification } from "../src/domain/certification.js";
import type { CertificationProposal } from "../src/domain/certification.js";

const repoRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

async function loadProposalFixture(): Promise<CertificationProposal> {
  const descriptor = JSON.parse(
    await readFile(
      join(
        repoRoot,
        "packages",
        "arena-bridge",
        "src",
        "domain",
        "proposals",
        "video.profile-reference-replacement.json",
      ),
      "utf8",
    ),
  ) as CapabilityDescriptor;
  return {
    proposedCapabilityId: descriptor.id,
    capabilityDescriptor: descriptor,
    conformanceScenarioRefs: descriptor.conformance.scenarios.map((scenario) => scenario.path),
    providerMappingProofs: descriptor.providerMappings.map((mapping) => ({
      providerId: mapping.providerId,
      executionAdapter: mapping.executionAdapter,
    })),
  };
}

test("the committed T4 proposal passes the standard gate (structurally)", async () => {
  const proposal = await loadProposalFixture();
  const result = validateCapabilityCertification(proposal);
  assert.deepEqual(result, { ok: true });
});

test("no Arena exemption: a descriptor marked active is refused", async () => {
  const proposal = await loadProposalFixture();
  const active = {
    ...proposal,
    capabilityDescriptor: {
      ...proposal.capabilityDescriptor,
      status: "active" as const,
    },
  };
  const result = validateCapabilityCertification(active);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.issues.some((issue) => /enter as draft/.test(issue)));
  }
});

test("mapping gate: no executable mapping is refused", async () => {
  const proposal = await loadProposalFixture();
  const unmapped = {
    ...proposal,
    capabilityDescriptor: {
      ...proposal.capabilityDescriptor,
      providerMappings: [],
    },
    providerMappingProofs: [],
  };
  const result = validateCapabilityCertification(unmapped);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.issues.some((issue) => /no executable provider mapping/.test(issue)));
  }
});

test("mapping gate: only-planned mappings are refused", async () => {
  const proposal = await loadProposalFixture();
  const plannedOnly = {
    ...proposal,
    capabilityDescriptor: {
      ...proposal.capabilityDescriptor,
      providerMappings: [
        {
          providerId: "future",
          executionAdapter: "future-adapter",
          maturity: "planned" as const,
          conformanceStatus: "unverified" as const,
        },
      ],
    },
  };
  const result = validateCapabilityCertification(plannedOnly);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.issues.some((issue) => /no executable provider mapping/.test(issue)));
  }
});

test("mapping gate: proofs must match declared mappings", async () => {
  const proposal = await loadProposalFixture();
  const mismatched = {
    ...proposal,
    providerMappingProofs: [{ providerId: "someone-else", executionAdapter: "ghost-adapter" }],
  };
  const result = validateCapabilityCertification(mismatched);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.issues.some((issue) => /does not match any declared mapping/.test(issue)));
  }
});

test("conformance gate: missing scenario references are refused", async () => {
  const proposal = await loadProposalFixture();
  const noConformance = {
    ...proposal,
    capabilityDescriptor: {
      ...proposal.capabilityDescriptor,
      conformance: { scenarios: [], certification: "none" as const },
    },
    conformanceScenarioRefs: [],
  };
  const result = validateCapabilityCertification(noConformance);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.issues.some((issue) => /conformance/.test(issue)));
  }
});

test("schema gate: id mismatch and malformed versions are refused", async () => {
  const proposal = await loadProposalFixture();
  const mismatchedId = {
    ...proposal,
    proposedCapabilityId: "video.something-else",
  };
  assert.equal(validateCapabilityCertification(mismatchedId).ok, false);
  const badVersion = {
    ...proposal,
    capabilityDescriptor: {
      ...proposal.capabilityDescriptor,
      version: "one",
    },
  };
  const result = validateCapabilityCertification(badVersion);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.issues.some((issue) => /semver/.test(issue)));
  }
});
