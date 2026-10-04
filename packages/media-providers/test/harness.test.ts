import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { ComparisonService } from "../src/app/comparison-service.js";
import { FsProviderPlaneSource } from "../src/adapters/fs-plane-source.js";
import { MockAdapter } from "../src/adapters/mock/mock-adapter.js";
import type { AdapterResolver, EvaluationRecordSink } from "../src/app/ports.js";
import type { EvaluationRecord, RecordedFixture } from "../src/contract.js";
import { evaluationRecordSchema } from "../src/domain/schema.js";

const repoRoot = join(import.meta.dirname, "..", "..", "..");

class MemorySink implements EvaluationRecordSink {
  readonly records: EvaluationRecord[] = [];
  async write(record: EvaluationRecord): Promise<string> {
    this.records.push(record);
    return `memory://${record.evaluationId}`;
  }
}

function serviceWithMemorySink(): { service: ComparisonService; sink: MemorySink } {
  const sink = new MemorySink();
  const resolver: AdapterResolver = {
    resolve: (fixture: RecordedFixture) => new MockAdapter(fixture),
  };
  const clock = { nowIso: () => "2026-10-04T10:00:00Z" };
  const service = new ComparisonService(new FsProviderPlaneSource(repoRoot), resolver, sink, clock);
  return { service, sink };
}

test("comparison harness runs identity-basic across ALL mappings with per-mapping verdicts", async () => {
  const { service, sink } = serviceWithMemorySink();
  const run = await service.run("video.character-replacement", "identity-basic");
  assert.equal(sink.records.length, 1);
  const rows = run.record.rows;
  assert.equal(rows.length, 3);

  const byProvider = new Map(rows.map((row) => [row.providerId, row]));
  const higgsfield = byProvider.get("higgsfield");
  const wan = byProvider.get("wan-2.2");
  const vace = byProvider.get("vace");
  assert.ok(higgsfield && wan && vace);

  // Reference quality: higgsfield passes every threshold with the top score.
  assert.equal(higgsfield.invariants.qualityThresholds, "pass");
  assert.equal(higgsfield.invariants.schema, "pass");
  assert.equal(higgsfield.normalizedQuality, 83.7);
  assert.equal(higgsfield.provenance, "simulated");

  // Open model passes but scores lower — data, not failure (T3 evidence).
  assert.equal(wan.invariants.qualityThresholds, "pass");
  assert.ok(wan.normalizedQuality < higgsfield.normalizedQuality);
  assert.ok(wan.cost.estimate < higgsfield.cost.estimate);

  // VACE misses thresholds: recorded as below-threshold data, never hidden.
  assert.equal(vace.invariants.qualityThresholds, "fail");
  assert.equal(vace.invariants.perDimension["identity-preservation"], "fail");
  assert.ok(vace.normalizedQuality < wan.normalizedQuality);

  // Provider neutrality: same scenario, same invariants, three providers.
  assert.equal(new Set(rows.map((row) => row.executionAdapter)).size, 3);
});

test("comparison harness runs motion-fidelity-basic across all mappings", async () => {
  const { service } = serviceWithMemorySink();
  const run = await service.run("video.motion-transfer", "motion-fidelity-basic");
  assert.equal(run.record.rows.length, 3);
  const higgsfield = run.record.rows.find((row) => row.providerId === "higgsfield");
  assert.ok(higgsfield);
  assert.equal(higgsfield.invariants.qualityThresholds, "pass");
  assert.equal(higgsfield.normalizedQuality, 84);
});

test("committed evaluation records stay schema-valid (evidence files, not chat)", async () => {
  const source = new FsProviderPlaneSource(repoRoot);
  const evaluations = await source.loadEvaluations();
  for (const { source: file, data } of evaluations) {
    const parsed = evaluationRecordSchema.safeParse(data);
    assert.ok(parsed.success, `${file}: ${parsed.success ? "" : parsed.error.message}`);
    for (const row of parsed.data.rows) {
      assert.equal(row.provenance, "simulated", `${file}: mock-mode records must stay marked simulated`);
    }
  }
});
