/**
 * Pure domain unit tests — job state machine, handle derivation, XML helper,
 * command digest stability. No IO, no binaries.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { canTransition, isTerminal, processOutcomeToStatus, transition } from "../domain/job-state.js";
import { commandDigest, makeHandleId, nextHandleId, parseHandleId, slugPart } from "../domain/handle.js";
import { parseXml, serializeXml, el, text, escapeXml, unescapeXml, mltProperty, findByTag } from "../domain/xml.js";

describe("job state machine (media-provider-contract §3 lifecycle)", () => {
  test("legal lifecycle path", () => {
    assert.equal(canTransition("queued", "running"), true);
    assert.equal(canTransition("running", "succeeded"), true);
    assert.equal(canTransition("running", "failed"), true);
    assert.equal(canTransition("queued", "cancelled"), true);
  });

  test("illegal transitions are rejected (no terminal resurrection)", () => {
    assert.equal(canTransition("succeeded", "running"), false);
    assert.equal(canTransition("failed", "queued"), false);
    assert.equal(canTransition("cancelled", "succeeded"), false);
    assert.equal(canTransition("succeeded", "failed"), false);
    const result = transition("succeeded", "failed");
    assert.ok(!result.ok);
  });

  test("terminal statuses", () => {
    assert.equal(isTerminal("succeeded"), true);
    assert.equal(isTerminal("failed"), true);
    assert.equal(isTerminal("cancelled"), true);
    assert.equal(isTerminal("queued"), false);
    assert.equal(isTerminal("running"), false);
  });

  test("process outcome mapping", () => {
    assert.equal(processOutcomeToStatus(false, null), "running");
    assert.equal(processOutcomeToStatus(true, 0), "succeeded");
    assert.equal(processOutcomeToStatus(true, 1), "failed");
  });
});

describe("handle derivation", () => {
  test("round trip parse", () => {
    const id = makeHandleId("mlt", 3, 2, "my-key");
    const parsed = parseHandleId(id);
    assert.deepEqual(parsed, { editorId: "mlt", projectSeq: 3, revision: 2 });
  });

  test("nextHandleId is deterministic and idempotent-replay stable", () => {
    const first = nextHandleId("h.ffmpeg.p1.r0", "cut-a");
    const second = nextHandleId("h.ffmpeg.p1.r0", "cut-a");
    assert.equal(first, second, "same key → same successor");
    const other = nextHandleId("h.ffmpeg.p1.r0", "cut-b");
    assert.notEqual(first, other, "different key → different successor");
    const parsed = parseHandleId(first ?? "");
    assert.equal(parsed?.revision, 1, "revision advanced by one");
  });

  test("slug sanitizes hostile idempotency keys", () => {
    assert.match(slugPart("a/b\\c d/../.."), /^[a-z0-9-]+$/);
    assert.equal(slugPart("///"), "k", "fallback slug for empty input");
  });

  test("commandDigest is order-independent and collision-shy", () => {
    assert.equal(commandDigest("editor.cut-video", { a: 1, b: 2 }), commandDigest("editor.cut-video", { b: 2, a: 1 }));
    assert.notEqual(commandDigest("editor.cut-video", { a: 1 }), commandDigest("editor.cut-video", { a: 2 }));
  });
});

describe("xml helper (MLT-family subset)", () => {
  test("serialize → parse round trip preserves structure", () => {
    const doc = el("mlt", { version: "7.28.0", root: "/w" }, [
      el("profile", { width: "320", height: "240" }),
      el("producer", { id: "p0" }, [el("property", { name: "resource" }, [text("/tmp/a.mp4")])]),
      el("playlist", { id: "pl0" }, [el("entry", { producer: "p0", in: "25", out: "74" })]),
    ]);
    const serialized = serializeXml(doc);
    const parsed = parseXml(serialized);
    assert.ok(parsed.ok, `parse failed: ${parsed.ok ? "" : JSON.stringify(parsed.issues)}`);
    if (!parsed.ok) return;
    assert.equal(parsed.root.tag, "mlt");
    assert.equal(parsed.root.attrs.version, "7.28.0");
    const producer = findByTag(parsed.root, "producer");
    assert.ok(producer !== undefined);
    assert.equal(mltProperty(producer, "resource"), "/tmp/a.mp4");
    const playlist = findByTag(parsed.root, "playlist");
    assert.ok(playlist !== undefined);
    const entry = findByTag(playlist, "entry");
    assert.ok(entry !== undefined);
    assert.equal(entry.attrs.in, "25");
    assert.equal(entry.attrs.out, "74");
  });

  test("escaping survives the round trip", () => {
    const nasty = `a&b<c>"d"'e'`;
    assert.equal(unescapeXml(escapeXml(nasty)), nasty);
    const doc = el("p", {}, [text(nasty)]);
    const parsed = parseXml(serializeXml(doc));
    assert.ok(parsed.ok);
  });

  test("malformed XML is rejected, never guessed", () => {
    assert.ok(!parseXml("<unclosed>").ok);
    assert.ok(!parseXml("<a><b></a></b>").ok);
    assert.ok(!parseXml("no tags at all").ok);
    assert.ok(parseXml("<?xml version=\"1.0\"?><!-- c --><root/>").ok, "declarations and comments are skipped");
  });
});
