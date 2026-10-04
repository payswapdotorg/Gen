/**
 * Arena gap evidence generation (work order C/D13, human-escalation-contract
 * §1): ingests the committed T4 gap signal from @gen/agent-lab (file-based
 * handoff — arena-bridge does not import agent-lab in the architecture
 * policy), escalates it through the full Arena state machine
 * (detected → … → available) with committed fixture records (expert session,
 * proposed capability, conformance scenario), and writes the committed gap
 * report + append-only transition log. Deterministic timestamps throughout.
 *
 * Provenance: every fixture is an explicitly-labeled Phase-1 simulation
 * fixture; the certification here validates the standard gate's STRUCTURE
 * (schema + conformance refs + mapping proofs). Runtime conformance
 * execution belongs to the @gen/media-capabilities harness (Worker 1).
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CapabilityDescriptor } from "@gen/media-capabilities";
import type { GapSignalInput, ExpertSessionRecord } from "../src/contract.js";
import { createFsGapStore } from "../src/adapters/fs-gap-store.js";
import { createArenaService } from "../src/app/arena-service.js";
import type { CertificationProposal } from "../src/domain/certification.js";

const here = dirname(fileURLToPath(import.meta.url));
const domainRoot = join(here, "..", "src", "domain");

/** Deterministic escalation timestamps (committed evidence must be stable). */
const AT = {
  reported: "2026-10-04T08:30:00.000Z",
  requested: "2026-10-04T08:45:00.000Z",
  session: "2026-10-04T09:00:00.000Z",
  proposed: "2026-10-04T09:15:00.000Z",
  certifying: "2026-10-04T09:30:00.000Z",
  certified: "2026-10-04T09:45:00.000Z",
  available: "2026-10-04T10:00:00.000Z",
} as const;

async function readJsonFile(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function main(): Promise<void> {
  // Regeneration is canonical: reset the committed escalation artifacts to a
  // clean state first (the store itself is append-only by design — a fresh
  // clone produces exactly the single-run evidence written below).
  const gapsDir = join(domainRoot, "gaps");
  const signalPath = join(
    gapsDir,
    "signals",
    "gap.forced-failure-video-character-replacement.signal.json",
  );
  await rm(join(gapsDir, "transitions.jsonl"), { force: true });
  await rm(
    join(gapsDir, "gap.forced-failure-video-character-replacement.json"),
    { force: true },
  );

  const signal = (await readJsonFile(signalPath)) as GapSignalInput;
  const session = (await readJsonFile(
    join(domainRoot, "expert-sessions", "session.t4-arena-review.json"),
  )) as ExpertSessionRecord;
  const descriptor = (await readJsonFile(
    join(domainRoot, "proposals", "video.profile-reference-replacement.json"),
  )) as CapabilityDescriptor;

  const store = createFsGapStore();
  const arena = createArenaService({ gapStore: store });

  // Full escalation (T4 path B): detected → … → available.
  arena.ingestSignal(signal);
  arena.record(signal.gapId, AT.reported);
  arena.requestArena(signal.gapId, AT.requested);
  const [sessioned] = arena.ingestExpertSession(session, AT.session);
  if (!sessioned) throw new Error("expert session ingest produced no record");
  arena.propose(signal.gapId, session.proposedCapabilityId ?? descriptor.id, AT.proposed);

  const proposal: CertificationProposal = {
    proposedCapabilityId: descriptor.id,
    capabilityDescriptor: descriptor,
    conformanceScenarioRefs: descriptor.conformance.scenarios.map((scenario) => scenario.path),
    providerMappingProofs: descriptor.providerMappings.map((mapping) => ({
      providerId: mapping.providerId,
      executionAdapter: mapping.executionAdapter,
    })),
  };
  const submission = arena.submitCertification(signal.gapId, proposal, AT.certifying);
  if (!submission.validation.ok) {
    throw new Error(
      `standard capability gate refused the proposal: ${submission.validation.issues.join("; ")}`,
    );
  }
  arena.certify(signal.gapId, AT.certified);
  const { publication } = arena.publish(signal.gapId, descriptor, AT.available);

  // Commit the certification evidence + availability publication records.
  const certificationRecord = {
    capabilityId: descriptor.id,
    providerMapping: descriptor.providerMappings
      .map((mapping) => `${mapping.providerId}${mapping.modelId ? `/${mapping.modelId}` : ""} via ${mapping.executionAdapter}`)
      .join(", "),
    scenarioRefs: proposal.conformanceScenarioRefs,
    evidenceRef: `packages/arena-bridge/src/domain/proposals/${descriptor.id}.json`,
    certifiedAt: AT.certified,
    gate: "schema + conformance refs + mapping proofs (structural, Phase-1)",
    notes:
      "Structural standard gate validated by the arena-bridge harness; runtime conformance execution belongs to the @gen/media-capabilities harness (Worker 1). The capability stays draft (lock §7).",
    provenance: "Phase-1 simulation fixture closing gap.forced-failure-video-character-replacement.",
  };
  await mkdir(join(domainRoot, "certifications"), { recursive: true });
  await writeFile(
    join(domainRoot, "certifications", `${descriptor.id}.json`),
    `${JSON.stringify(certificationRecord, null, 2)}\n`,
    "utf8",
  );
  await mkdir(join(domainRoot, "availability"), { recursive: true });
  await writeFile(
    join(domainRoot, "availability", `${publication.publicationId}.json`),
    `${JSON.stringify(publication, null, 2)}\n`,
    "utf8",
  );

  const final = arena.get(signal.gapId);
  if (!final) throw new Error("gap record missing after escalation");
  console.log(
    `T4 escalation: ${final.gapId} → ${final.arena.state} (request ${final.arena.requestId}, capability ${final.arena.proposedCapabilityId})`,
  );
  console.log(
    `Publication: ${publication.publicationId} — mappings: ${publication.mappings.map((m) => `${m.providerId}${m.modelId ? `/${m.modelId}` : ""}`).join(", ")}`,
  );
}

await main();
