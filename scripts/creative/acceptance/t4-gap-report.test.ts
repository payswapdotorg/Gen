/**
 * T4 — gap detection / escalation (lock §9).
 *
 * System fails → CapabilityGapReport (+ optional Arena submission), never
 * hallucination. Integration chain: routing failure with trace → gap report
 * (schema-valid) → arena state machine → certification refusal while
 * unresolved → published certified capability becomes visible to the
 * registry index + org search.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { routeCapability } from "../../../packages/media-capabilities/src/domain/router.js";
import { CapabilityGapReportSchema } from "../../../packages/arena-bridge/src/index.js";
import {
  reportGap,
  requestArena,
  ingestExpertSession,
  proposeCapability,
  submitCertification,
  certifyGap,
  publishAvailability,
} from "../../../packages/arena-bridge/src/index.js";
import { buildLabAvailabilityPublication, mergeIntoCapabilityCatalog } from "../../../packages/arena-bridge/src/domain/publisher.js";
import { registryViewToCapabilityCatalog } from "../../../packages/agent-lab/src/adapters/registry-catalog-adapter.js";
import { composeRegistry } from "./lib/compose-registry.js";
import { composePlane, factsForCapability } from "./lib/plane.js";
import { repoRoot } from "./lib/compose-registry.js";

test("T4: a routing failure produces a traceable failure — never a silent pick", async () => {
  const composed = await composeRegistry();
  const plane = await composePlane();
  const facts = factsForCapability("video.character-replacement", composed.view, plane);
  const degraded = {
    candidates: facts.candidates.map((c) => ({ ...c, reliability: 0.05, available: true })),
  };
  const decision = routeCapability(
    { capabilityId: "video.character-replacement", parameters: {}, inputArtifactIds: [], policy: "cheapest-reliable" },
    composed.view,
    degraded,
  );
  assert.ok(!decision.ok);
  assert.ok(decision.decisionTrace.includes("rejection="));
  // The trace is the raw material of the gap report (P5).
});

test("T4: the committed forced-failure gap report is schema-valid", async () => {
  const raw = await readFile(
    join(repoRoot(), "packages/arena-bridge/src/domain/gaps/gap.forced-failure-video-character-replacement.json"),
    "utf8",
  );
  const parsed = CapabilityGapReportSchema.safeParse(JSON.parse(raw));
  assert.ok(parsed.success, `gap report must validate: ${parsed.success ? "" : parsed.error.message}`);
  assert.equal(parsed.data.requestedCapability.capabilityId, "video.character-replacement");
  assert.ok(parsed.data.failureEvidence.routerDecisionTrace.length > 0);
});

test("T4: arena state machine — the certified chain advances, publishing feeds the catalog", async () => {
  const committed = JSON.parse(
    await readFile(
      join(repoRoot(), "packages/arena-bridge/src/domain/gaps/gap.forced-failure-video-character-replacement.json"),
      "utf8",
    ),
  );
  // The committed file records the COMPLETED chain (terminal state). Re-run
  // the same chain from a reset copy (state=detected) to verify the machine.
  let gap = structuredClone(committed);
  gap.arena.state = "detected";

  const reported = reportGap(gap);
  assert.ok(reported.ok, `reportGap failed: ${JSON.stringify(reported)}`);
  gap = reported.report;

  const requested = requestArena(gap, "req.t4-integration");
  assert.ok(requested.ok, `requestArena failed: ${JSON.stringify(requested)}`);
  gap = requested.report;

  const session = {
    sessionId: "session.t4-integration",
    gapIds: [gap.gapId],
    expert: "tl-integration",
    decision: "propose-capability",
    rationale: "T4 integration chain: profile-view reference handling proposed.",
    notes: "integration re-run of the committed chain",
  } as never;
  const ingested = ingestExpertSession(gap, session);
  assert.ok(ingested.ok, `ingestExpertSession failed: ${JSON.stringify(ingested)}`);
  gap = ingested.report;

  const proposed = proposeCapability(gap, "video.profile-reference-replacement");
  assert.ok(proposed.ok, `proposeCapability failed: ${JSON.stringify(proposed)}`);
  gap = proposed.report;

  const submitted = submitCertification(
    gap,
    "arena-bridge/src/domain/certifications/video.profile-reference-replacement.json",
  );
  assert.ok(submitted.ok, `submitCertification failed: ${JSON.stringify(submitted)}`);
  gap = submitted.report;

  const certified = certifyGap(gap);
  assert.ok(certified.ok, `certifyGap failed: ${JSON.stringify(certified)}`);
  gap = certified.report;

  const published = publishAvailability(gap);
  assert.ok(published.ok, `publishAvailability failed: ${JSON.stringify(published)}`);
  gap = published.report;
  assert.equal(gap.arena.state, "available");

  // The terminal report matches the committed evidence (same chain, same end).
  assert.equal(gap.arena.proposedCapabilityId, committed.arena.proposedCapabilityId);

  // Publication: the certified capability becomes a lab-availability record
  // with mappings from a descriptor the workspace can register.
  const descriptor = {
    id: "video.profile-reference-replacement",
    version: "1.0.0",
    status: "draft",
    domain: "video",
    summary: "Character replacement robust to profile-view reference frames.",
    inputs: [],
    outputs: [{ name: "resultVideo", mediaType: "video/mp4", cardinality: "one" }],
    qualityDimensions: [{ id: "identity-preservation", description: "identity fidelity", scale: "0-100" }],
    latencyClass: "minutes",
    conformance: {
      scenarios: [
        {
          id: "identity-basic",
          path: "packages/media-capabilities/src/domain/conformance/video.character-replacement/identity-basic.json",
        },
      ],
      certification: "certified",
    },
    providerMappings: [
      {
        providerId: "higgsfield",
        modelId: "genjutsu",
        executionAdapter: "higgsfield-http",
        maturity: "reference",
        conformanceStatus: "self-verified",
      },
    ],
  };
  const publication = buildLabAvailabilityPublication(gap, descriptor as never, "2026-10-04T00:00:00Z");
  assert.ok(publication.ok, `publication failed: ${JSON.stringify(publication)}`);
  assert.equal(publication.publication?.capabilityId, "video.profile-reference-replacement");

  // The publication folds into the capability catalog the org search sees…
  const composed = await composeRegistry();
  const catalog = registryViewToCapabilityCatalog(composed.view);
  const merged = mergeIntoCapabilityCatalog(catalog, publication.publication!);
  const mergedIds = merged.map((c) => c.capabilityId);
  assert.ok(mergedIds.includes("video.profile-reference-replacement"));
  // …and the registry itself accepts the descriptor (single write path).
  const reg = composed.registry.register(descriptor, "t4-arena-publication");
  assert.ok(reg.ok, `registry register failed: ${JSON.stringify(reg)}`);
  assert.ok(
    composed.registry.getView().capabilities.some((c) => c.id === "video.profile-reference-replacement"),
    "the certified capability is visible in the canonical index",
  );
});

test("T4: unresolved gaps refuse arena availability (never a fabricated capability)", () => {
  const raw = {
    gapId: "gap.t4-unresolved",
    detectedAt: "2026-10-04T00:00:00.000Z",
    requestedCapability: {
      intent: "integration test",
      capabilityId: "video.character-replacement",
      parameters: {},
    },
    kind: "mapping-shortfall",
    failureEvidence: {
      summary: "unresolved",
      routerDecisionTrace: "policy=cheapest-reliable; rejected=3",
      comparisonTableRef: "none",
      adapterErrorRecords: [],
      organizationRunRef: "none",
      artifactRefs: [],
    },
    impact: { goalClass: "test", severity: "low", frequency: "once" },
    arena: { state: "detected" },
  };
  const descriptor = {
    id: "video.profile-reference-replacement",
    version: "1.0.0",
    status: "draft",
    domain: "video",
    summary: "x",
    inputs: [],
    outputs: [{ name: "r", mediaType: "video/mp4", cardinality: "one" }],
    qualityDimensions: [],
    latencyClass: "minutes",
    conformance: {
      scenarios: [],
      certification: "self",
    },
    providerMappings: [],
  };
  const result = buildLabAvailabilityPublication(raw as never, descriptor as never, "2026-10-04T00:00:00Z");
  assert.ok(!result.ok, "unresolved (detected-state) gap must not publish");
});
