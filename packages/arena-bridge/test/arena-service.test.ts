/**
 * Arena service tests (work order D13 — T4 acceptance): a forced failure
 * produces a schema-valid gap report with evidence (path A: recorded, no
 * arena request), and optionally an arena request escalating end-to-end
 * (path B) — never a fabricated result.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CapabilityDescriptor } from "@gen/media-capabilities";
import type { CapabilityGapReport, GapStore } from "../src/contract.js";
import { createArenaService } from "../src/app/arena-service.js";
import type { CertificationProposal } from "../src/domain/certification.js";
import { CapabilityGapReportSchema } from "../src/domain/schema/capability-gap.js";

const repoRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

function memoryStore(): GapStore & { reports: CapabilityGapReport[]; log: unknown[] } {
  const reports: CapabilityGapReport[] = [];
  const log: unknown[] = [];
  const byId = new Map<string, CapabilityGapReport>();
  return {
    reports,
    log,
    save: (report) => {
      if (!byId.has(report.gapId)) reports.push(report);
      byId.set(report.gapId, report);
    },
    get: (gapId) => byId.get(gapId),
    list: () => reports,
    appendTransition: (entry) => log.push(entry),
  };
}

async function t4Signal() {
  return JSON.parse(
    await readFile(
      join(
        repoRoot,
        "packages",
        "arena-bridge",
        "src",
        "domain",
        "gaps",
        "signals",
        "gap.forced-failure-video-character-replacement.signal.json",
      ),
      "utf8",
    ),
  ) as Parameters<ReturnType<typeof createArenaService>["ingestSignal"]>[0];
}

async function t4Session() {
  return JSON.parse(
    await readFile(
      join(
        repoRoot,
        "packages",
        "arena-bridge",
        "src",
        "domain",
        "expert-sessions",
        "session.t4-arena-review.json",
      ),
      "utf8",
    ),
  ) as Parameters<ReturnType<typeof createArenaService>["ingestExpertSession"]>[0];
}

async function t4Proposal(): Promise<CertificationProposal> {
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

test("T4 path A: the gap report is recorded WITHOUT an arena request", async () => {
  const store = memoryStore();
  const arena = createArenaService({ gapStore: store });
  const signal = await t4Signal();
  const detected = arena.ingestSignal(signal);
  assert.equal(detected.arena.state, "detected");
  const reported = arena.record(signal.gapId, "2026-10-04T08:30:00.000Z");
  assert.equal(reported.arena.state, "reported");
  // The optional escalation never happened — and nothing is fabricated:
  assert.equal(reported.arena.requestId, undefined);
  assert.equal(reported.arena.proposedCapabilityId, undefined);
  assert.equal(reported.arena.certificationEvidence, undefined);
  // The recorded report is schema-valid with full evidence (P5).
  const parsed = CapabilityGapReportSchema.safeParse(reported);
  assert.ok(parsed.success);
  assert.equal(reported.kind, "mapping-shortfall");
  assert.match(reported.failureEvidence.routerDecisionTrace ?? "", /policy=cheapest-reliable/);
  assert.equal(store.log.length, 1);
});

test("T4 path B: full escalation to available with committed fixtures", async () => {
  const store = memoryStore();
  const arena = createArenaService({ gapStore: store });
  const signal = await t4Signal();
  const session = await t4Session();
  const proposal = await t4Proposal();

  arena.ingestSignal(signal);
  arena.record(signal.gapId, "2026-10-04T08:30:00.000Z");
  arena.requestArena(signal.gapId, "2026-10-04T08:45:00.000Z");
  const [sessioned] = arena.ingestExpertSession(session, "2026-10-04T09:00:00.000Z");
  assert.equal(sessioned?.arena.state, "expert-session");
  arena.propose(signal.gapId, "video.profile-reference-replacement", "2026-10-04T09:15:00.000Z");

  const submission = arena.submitCertification(signal.gapId, proposal, "2026-10-04T09:30:00.000Z");
  assert.deepEqual(submission.validation, { ok: true });
  arena.certify(signal.gapId, "2026-10-04T09:45:00.000Z");
  const { report, publication } = arena.publish(
    signal.gapId,
    proposal.capabilityDescriptor,
    "2026-10-04T10:00:00.000Z",
  );
  assert.equal(report.arena.state, "available");
  assert.equal(publication.capabilityId, "video.profile-reference-replacement");
  assert.ok(publication.mappings.length >= 1);
  assert.equal(store.log.length, 7);
});

test("the standard gate refuses a bad proposal and the gap stays proposed", async () => {
  const store = memoryStore();
  const arena = createArenaService({ gapStore: store });
  const signal = await t4Signal();
  const session = await t4Session();
  const proposal = await t4Proposal();
  arena.ingestSignal(signal);
  arena.record(signal.gapId, "2026-10-04T08:30:00.000Z");
  arena.requestArena(signal.gapId, "2026-10-04T08:45:00.000Z");
  arena.ingestExpertSession(session, "2026-10-04T09:00:00.000Z");
  arena.propose(signal.gapId, "video.profile-reference-replacement", "2026-10-04T09:15:00.000Z");

  const bad: CertificationProposal = {
    ...proposal,
    capabilityDescriptor: {
      ...proposal.capabilityDescriptor,
      providerMappings: [],
    },
    providerMappingProofs: [],
  };
  const submission = arena.submitCertification(signal.gapId, bad, "2026-10-04T09:30:00.000Z");
  assert.equal(submission.validation.ok, false);
  assert.equal(
    arena.get(signal.gapId)?.arena.state,
    "proposed",
    "a refused gate must not advance the state",
  );
  // Certifying now is illegal — the state machine enforces it.
  assert.throws(() => arena.certify(signal.gapId, "2026-10-04T09:45:00.000Z"), /illegal transition/);
});

test("schema-invalid signals are refused at ingest (never a corrupted report)", async () => {
  const store = memoryStore();
  const arena = createArenaService({ gapStore: store });
  const signal = await t4Signal();
  assert.throws(
    () => arena.ingestSignal({ ...signal, gapId: "not a gap id" }),
    /schema violation/,
  );
});

test("closing with a rationale reaches the terminal state and stops there", async () => {
  const store = memoryStore();
  const arena = createArenaService({ gapStore: store });
  const signal = await t4Signal();
  arena.ingestSignal(signal);
  const rejected = arena.close(signal.gapId, "rejected", "out of scope for this goal class", "2026-10-04T08:31:00.000Z");
  assert.equal(rejected.arena.state, "rejected");
  assert.equal(rejected.arena.rationale, "out of scope for this goal class");
  assert.throws(() => arena.record(signal.gapId, "2026-10-04T08:32:00.000Z"), /illegal transition/);
});
