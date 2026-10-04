/**
 * Committed arena evidence replay tests (work order C, P6): the committed gap
 * record, transition log and availability publication must be reproducible
 * from the committed fixtures — deterministic timestamps, deterministic flow.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CapabilityDescriptor } from "@gen/media-capabilities";
import { createFsGapStore, readGapReport, readTransitionLog } from "../src/adapters/fs-gap-store.js";
import { createArenaService } from "../src/app/arena-service.js";
import { CapabilityGapReportSchema } from "../src/domain/schema/capability-gap.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const domainRoot = join(packageRoot, "src", "domain");

const AT = {
  reported: "2026-10-04T08:30:00.000Z",
  requested: "2026-10-04T08:45:00.000Z",
  session: "2026-10-04T09:00:00.000Z",
  proposed: "2026-10-04T09:15:00.000Z",
  certifying: "2026-10-04T09:30:00.000Z",
  certified: "2026-10-04T09:45:00.000Z",
  available: "2026-10-04T10:00:00.000Z",
} as const;

async function readJson(...segments: string[]): Promise<unknown> {
  return JSON.parse(await readFile(join(...segments), "utf8")) as unknown;
}

test("the committed gap record is schema-valid and fully escalated", () => {
  const report = readGapReport(join(domainRoot, "gaps", "gap.forced-failure-video-character-replacement.json"));
  assert.ok(CapabilityGapReportSchema.safeParse(report).success);
  assert.equal(report.arena.state, "available");
  assert.equal(report.arena.proposedCapabilityId, "video.profile-reference-replacement");
  assert.equal(report.arena.expertSessionRef, "session.t4-arena-review");
  assert.match(report.arena.requestId ?? "", /^req\.forced-failure/);
  assert.match(report.arena.certificationEvidence ?? "", /certifications\/video\.profile-reference-replacement\.json$/);
  // Evidence of the failure is preserved end-to-end (P5).
  assert.equal(report.kind, "mapping-shortfall");
  assert.match(report.failureEvidence.routerDecisionTrace ?? "", /candidates=3; rejected=3/);
});

test("the committed transition log covers the full chain in order", () => {
  const log = readTransitionLog() as { from: string; to: string; via: string }[];
  assert.deepEqual(
    log.map((entry) => `${entry.from}→${entry.to}`),
    [
      "detected→reported",
      "reported→arena-requested",
      "arena-requested→expert-session",
      "expert-session→proposed",
      "proposed→certifying",
      "certifying→certified",
      "certified→available",
    ],
  );
  for (const entry of log) {
    assert.ok(entry.via.length > 0);
  }
});

test("re-running the escalation reproduces the committed record exactly", async () => {
  const signal = await readJson(domainRoot, "gaps", "signals", "gap.forced-failure-video-character-replacement.signal.json");
  const session = await readJson(domainRoot, "expert-sessions", "session.t4-arena-review.json");
  const descriptor = (await readJson(
    domainRoot,
    "proposals",
    "video.profile-reference-replacement.json",
  )) as CapabilityDescriptor;

  // Re-run against a TEMP store — the committed store must stay untouched.
  const tempDir = join(packageRoot, "node_modules", ".arena-replay");
  const { rmSync } = await import("node:fs");
  rmSync(tempDir, { recursive: true, force: true });
  const store = createFsGapStore(tempDir);
  const arena = createArenaService({ gapStore: store });

  arena.ingestSignal(signal as never);
  arena.record("gap.forced-failure-video-character-replacement", AT.reported);
  arena.requestArena("gap.forced-failure-video-character-replacement", AT.requested);
  arena.ingestExpertSession(session as never, AT.session);
  arena.propose("gap.forced-failure-video-character-replacement", descriptor.id, AT.proposed);
  const submission = arena.submitCertification(
    "gap.forced-failure-video-character-replacement",
    {
      proposedCapabilityId: descriptor.id,
      capabilityDescriptor: descriptor,
      conformanceScenarioRefs: descriptor.conformance.scenarios.map((scenario) => scenario.path),
      providerMappingProofs: descriptor.providerMappings.map((mapping) => ({
        providerId: mapping.providerId,
        executionAdapter: mapping.executionAdapter,
      })),
    },
    AT.certifying,
  );
  assert.deepEqual(submission.validation, { ok: true });
  arena.certify("gap.forced-failure-video-character-replacement", AT.certified);
  const { publication } = arena.publish("gap.forced-failure-video-character-replacement", descriptor, AT.available);

  const committed = readGapReport(
    join(domainRoot, "gaps", "gap.forced-failure-video-character-replacement.json"),
  );
  const replayed = store.get("gap.forced-failure-video-character-replacement");
  assert.ok(replayed);
  assert.deepEqual(replayed, committed);
  const committedLog = readTransitionLog() as unknown[];
  const replayedLog = readTransitionLog(tempDir);
  assert.deepEqual(replayedLog, committedLog);

  const committedPublication = (await readJson(
    domainRoot,
    "availability",
    "pub.video-profile-reference-replacement.json",
  )) as typeof publication;
  assert.deepEqual(publication, committedPublication);
});
