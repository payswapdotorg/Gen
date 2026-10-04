/**
 * Arena state machine tests (human-escalation-contract.md §1, work order C10):
 * the full chain, illegal transitions, terminal states, expert-session
 * decisions, and guard rails.
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { CapabilityGapReport, ExpertSessionRecord } from "../src/contract.js";
import {
  ARENA_CHAIN,
  canTransition,
  closeGap,
  isTerminal,
  certifyGap,
  ingestExpertSession,
  proposeCapability,
  publishAvailability,
  reportGap,
  requestArena,
  submitCertification,
} from "../src/domain/state-machine.js";

function gap(state: CapabilityGapReport["arena"]["state"]): CapabilityGapReport {
  return {
    gapId: "gap.test-01",
    detectedAt: "2026-10-04T00:00:00.000Z",
    requestedCapability: { intent: "Test intent that cannot be fulfilled." },
    kind: "missing-capability",
    failureEvidence: { summary: "Test evidence summary." },
    impact: { goalClass: "generic-edit", severity: "low" },
    arena: { state },
  };
}

test("the chain advances exactly one step at a time", () => {
  for (let i = 0; i + 1 < ARENA_CHAIN.length; i += 1) {
    const from = ARENA_CHAIN[i]!;
    const to = ARENA_CHAIN[i + 1]!;
    assert.equal(canTransition(from, to), true, `${from} → ${to} must be legal`);
    if (i + 2 < ARENA_CHAIN.length) {
      assert.equal(
        canTransition(from, ARENA_CHAIN[i + 2]!),
        false,
        `${from} → ${ARENA_CHAIN[i + 2]!} must be illegal (no skipping)`,
      );
    }
  }
});

test("backwards transitions are illegal", () => {
  assert.equal(canTransition("reported", "detected"), false);
  assert.equal(canTransition("certified", "proposed"), false);
  assert.equal(canTransition("available", "certified"), false);
});

test("terminal states are absorbing", () => {
  for (const state of ["available", "rejected", "wont-fix"] as const) {
    assert.ok(isTerminal(state));
    for (const to of ARENA_CHAIN) {
      assert.equal(canTransition(state, to), false, `${state} → ${to} must be illegal`);
    }
  }
});

test("rejected / wont-fix are reachable from any non-terminal state with rationale", () => {
  for (const from of ["detected", "reported", "arena-requested", "expert-session", "proposed", "certifying"] as const) {
    const rejected = closeGap(gap(from), "rejected", "not worth it");
    assert.equal(rejected.ok && rejected.report.arena.state, "rejected", `${from} → rejected`);
    const wontFix = closeGap(gap(from), "wont-fix", "out of scope");
    assert.equal(wontFix.ok && wontFix.report.arena.state, "wont-fix", `${from} → wont-fix`);
  }
  const noRationale = closeGap(gap("detected"), "rejected", "  ");
  assert.equal(noRationale.ok, false);
  assert.match(noRationale.issue, /rationale/);
});

test("the happy path walks end-to-end", () => {
  let report = gap("detected");
  const chain: { run: () => { ok: true; report: CapabilityGapReport } | { ok: false; issue: string }; expect: string }[] = [
    { run: () => reportGap(report), expect: "reported" },
    { run: () => requestArena(report, "req.test-01"), expect: "arena-requested" },
    {
      run: () =>
        ingestExpertSession(report, {
          sessionId: "session.test",
          gapIds: [report.gapId],
          decision: "propose-capability",
          proposedCapabilityId: "video.test-capability",
          rationale: "propose it",
          recordedAt: "2026-10-04T00:00:00.000Z",
        }),
      expect: "expert-session",
    },
    { run: () => proposeCapability(report, "video.test-capability"), expect: "proposed" },
    { run: () => submitCertification(report, "evidence.json"), expect: "certifying" },
    { run: () => certifyGap(report), expect: "certified" },
    { run: () => publishAvailability(report), expect: "available" },
  ];
  for (const step of chain) {
    const result = step.run();
    assert.ok(result.ok, result.ok ? "" : result.issue);
    if (result.ok) {
      assert.equal(result.report.arena.state, step.expect);
      report = result.report;
    }
  }
  assert.equal(report.arena.state, "available");
  assert.equal(report.arena.requestId, "req.test-01");
  assert.equal(report.arena.proposedCapabilityId, "video.test-capability");
  assert.equal(report.arena.certificationEvidence, "evidence.json");
});

test("expert session guards: wrong gap reference and wrong state", () => {
  const session: ExpertSessionRecord = {
    sessionId: "session.other",
    gapIds: ["gap.someone-else"],
    decision: "propose-capability",
    rationale: "n/a",
    recordedAt: "2026-10-04T00:00:00.000Z",
  };
  const wrongGap = ingestExpertSession(gap("arena-requested"), session);
  assert.equal(wrongGap.ok, false);
  assert.match(wrongGap.issue, /does not reference gap/);

  const wrongState = ingestExpertSession(gap("detected"), {
    ...session,
    gapIds: ["gap.test-01"],
  });
  assert.equal(wrongState.ok, false);
  assert.match(wrongState.issue, /requires arena-requested/);
});

test("expert session decisions reject / wont-fix / needs-info", () => {
  const base: ExpertSessionRecord = {
    sessionId: "session.test",
    gapIds: ["gap.test-01"],
    decision: "propose-capability",
    rationale: "rationale text",
    recordedAt: "2026-10-04T00:00:00.000Z",
  };
  const rejected = ingestExpertSession(gap("arena-requested"), { ...base, decision: "reject" });
  assert.ok(rejected.ok);
  assert.equal(rejected.ok && rejected.report.arena.state, "rejected");
  assert.equal(rejected.ok && rejected.report.arena.rationale, "rationale text");

  const wontFix = ingestExpertSession(gap("arena-requested"), { ...base, decision: "wont-fix" });
  assert.equal(wontFix.ok && wontFix.report.arena.state, "wont-fix");

  const needsInfo = ingestExpertSession(gap("arena-requested"), { ...base, decision: "needs-info" });
  assert.ok(needsInfo.ok);
  assert.equal(needsInfo.ok && needsInfo.report.arena.state, "expert-session");
  // A follow-up session in expert-session state can still decide.
  const followUp = ingestExpertSession(
    needsInfo.ok ? needsInfo.report : gap("expert-session"),
    { ...base, decision: "propose-capability", proposedCapabilityId: "video.follow-up" },
  );
  assert.ok(followUp.ok);
  assert.equal(followUp.ok && followUp.report.arena.state, "expert-session");
});

test("transitions from the wrong state are refused", () => {
  const early = proposeCapability(gap("detected"), "video.x");
  assert.equal(early.ok, false);
  assert.match(early.issue, /illegal transition/);
  const late = reportGap(gap("certified"));
  assert.equal(late.ok, false);
  const posthumous = reportGap(gap("rejected"));
  assert.equal(posthumous.ok, false);
});
