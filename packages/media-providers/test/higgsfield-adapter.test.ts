import assert from "node:assert/strict";
import { test } from "node:test";
import { HiggsfieldAdapter } from "../src/adapters/higgsfield/higgsfield-adapter.js";
import type { EnvPort, HttpPort, HttpRequest, HttpResponse } from "../src/app/ports.js";
import { MediaAdapterError } from "../src/domain/errors.js";

/** Credential fragments assembled at runtime — never a committed literal (P8). */
function runtimeCredential(): string {
  return ["sim", "key", "id-01", "secret-fragment"].join(":");
}

const envWithKey: EnvPort = { get: (name) => (name === "HIGGSFIELD_API_KEY" ? runtimeCredential() : undefined) };
const envWithoutKey: EnvPort = { get: () => undefined };

interface ScriptedCall {
  readonly method: string;
  readonly url: string;
  readonly response: HttpResponse;
}

class ScriptedHttpPort implements HttpPort {
  readonly calls: HttpRequest[] = [];
  readonly #script: ScriptedCall[];

  constructor(script: readonly ScriptedCall[]) {
    this.#script = [...script];
  }

  async request(request: HttpRequest): Promise<HttpResponse> {
    this.calls.push(request);
    const next = this.#script.shift();
    if (next === undefined) throw new Error("script exhausted");
    assert.equal(request.method, next.method);
    assert.equal(request.url, next.url);
    return next.response;
  }
}

const SUBMIT_RESPONSE = JSON.stringify({
  status: "queued",
  request_id: "d7e6c0f3-6699-4f6c-bb45-2ad7fd9158ff",
  status_url: "https://api.higgsfield.ai/requests/d7e6c0f3-6699-4f6c-bb45-2ad7fd9158ff/status",
  cancel_url: "https://api.higgsfield.ai/requests/d7e6c0f3-6699-4f6c-bb45-2ad7fd9158ff/cancel",
});

function statusResponse(status: string, output?: unknown): HttpResponse {
  return { status: 200, body: JSON.stringify({ status, ...(output === undefined ? {} : { output }) }) };
}

test("submit posts the doc-confirmed motion-transfer shape and tracks the job", async () => {
  const http = new ScriptedHttpPort([
    { method: "POST", url: "https://api.higgsfield.ai/higgsfield/genjutsu/motion-transfer/v1.0", response: { status: 200, body: SUBMIT_RESPONSE } },
  ]);
  const adapter = new HiggsfieldAdapter(http, envWithKey);
  const handle = await adapter.submit(
    "video.motion-transfer",
    "genjutsu",
    { preserveAudio: false },
    ["https://example.com/driving.mp4", "https://example.com/character.png"],
    "idem-1",
  );
  assert.equal(handle.jobId, "d7e6c0f3-6699-4f6c-bb45-2ad7fd9158ff");
  assert.equal(handle.providerId, "higgsfield");
  assert.equal(handle.idempotencyKey, "idem-1");
  const submitted = http.calls[0];
  assert.ok(submitted !== undefined);
  assert.equal(submitted.headers.Authorization, `Key ${runtimeCredential()}`);
  const body = JSON.parse(submitted.body ?? "{}") as Record<string, unknown>;
  assert.equal(body.video_url, "https://example.com/driving.mp4");
  assert.deepEqual(body.image_urls, ["https://example.com/character.png"]);
});

test("submit is idempotent per key — a retry returns the same handle without a second POST", async () => {
  const http = new ScriptedHttpPort([
    { method: "POST", url: "https://api.higgsfield.ai/higgsfield/genjutsu/motion-transfer/v1.0", response: { status: 200, body: SUBMIT_RESPONSE } },
  ]);
  const adapter = new HiggsfieldAdapter(http, envWithKey);
  const one = await adapter.submit("video.motion-transfer", "genjutsu", {}, ["ref-1"], "same-key");
  const two = await adapter.submit("video.motion-transfer", "genjutsu", {}, ["ref-1"], "same-key");
  assert.equal(one, two);
  assert.equal(http.calls.length, 1);
});

test("lifecycle: poll maps provider statuses; retrieve extracts output refs", async () => {
  const http = new ScriptedHttpPort([
    { method: "POST", url: "https://api.higgsfield.ai/higgsfield/genjutsu/motion-transfer/v1.0", response: { status: 200, body: SUBMIT_RESPONSE } },
    { method: "GET", url: "https://api.higgsfield.ai/requests/d7e6c0f3-6699-4f6c-bb45-2ad7fd9158ff/status", response: statusResponse("running") },
    { method: "GET", url: "https://api.higgsfield.ai/requests/d7e6c0f3-6699-4f6c-bb45-2ad7fd9158ff/status", response: statusResponse("succeeded", ["https://cdn.example.com/out.mp4"]) },
    { method: "GET", url: "https://api.higgsfield.ai/requests/d7e6c0f3-6699-4f6c-bb45-2ad7fd9158ff/status", response: statusResponse("succeeded", ["https://cdn.example.com/out.mp4"]) },
  ]);
  const adapter = new HiggsfieldAdapter(http, envWithKey);
  const handle = await adapter.submit("video.motion-transfer", "genjutsu", {}, ["ref-1"], "idem-2");
  assert.equal(await adapter.poll(handle), "running");
  assert.equal(await adapter.poll(handle), "succeeded");
  assert.deepEqual(await adapter.retrieve(handle), ["https://cdn.example.com/out.mp4"]);
});

test("cancel returns terminal for finished jobs and cancels running ones", async () => {
  const http = new ScriptedHttpPort([
    { method: "POST", url: "https://api.higgsfield.ai/higgsfield/genjutsu/motion-transfer/v1.0", response: { status: 200, body: SUBMIT_RESPONSE } },
    { method: "GET", url: "https://api.higgsfield.ai/requests/d7e6c0f3-6699-4f6c-bb45-2ad7fd9158ff/status", response: statusResponse("succeeded") },
  ]);
  const adapter = new HiggsfieldAdapter(http, envWithKey);
  const handle = await adapter.submit("video.motion-transfer", "genjutsu", {}, ["ref-1"], "idem-3");
  assert.equal(await adapter.cancel(handle), "terminal");

  const http2 = new ScriptedHttpPort([
    { method: "POST", url: "https://api.higgsfield.ai/higgsfield/genjutsu/motion-transfer/v1.0", response: { status: 200, body: SUBMIT_RESPONSE } },
    { method: "GET", url: "https://api.higgsfield.ai/requests/d7e6c0f3-6699-4f6c-bb45-2ad7fd9158ff/status", response: statusResponse("queued") },
    { method: "POST", url: "https://api.higgsfield.ai/requests/d7e6c0f3-6699-4f6c-bb45-2ad7fd9158ff/cancel", response: { status: 200, body: "{}" } },
  ]);
  const adapter2 = new HiggsfieldAdapter(http2, envWithKey);
  const handle2 = await adapter2.submit("video.motion-transfer", "genjutsu", {}, ["ref-1"], "idem-4");
  assert.equal(await adapter2.cancel(handle2), "cancelled");
});

test("error taxonomy: auth when the key is missing; the message names the env var only", async () => {
  const http = new ScriptedHttpPort([]);
  const adapter = new HiggsfieldAdapter(http, envWithoutKey);
  await assert.rejects(
    adapter.submit("video.motion-transfer", "genjutsu", {}, ["ref-1"], "idem-5"),
    (error: unknown) => {
      assert.ok(error instanceof MediaAdapterError);
      assert.equal(error.kind, "auth");
      assert.match(error.message, /HIGGSFIELD_API_KEY/);
      assert.equal(error.message.includes(runtimeCredential()), false);
      return true;
    },
  );
});

test("error taxonomy: 404 submit → unsupported with gap signal; 429 → capacity; 401 → auth", async () => {
  const notFound = new HiggsfieldAdapter(
    new ScriptedHttpPort([
      { method: "POST", url: "https://api.higgsfield.ai/higgsfield/genjutsu/object-replacement/v1.0", response: { status: 404, body: "{}" } },
    ]),
    envWithKey,
  );
  await assert.rejects(
    notFound.submit("video.object-replacement", "genjutsu", {}, ["ref-1"], "idem-6"),
    (error: unknown) => {
      assert.ok(error instanceof MediaAdapterError);
      assert.equal(error.kind, "unsupported");
      assert.equal(error.gapSignal, true);
      return true;
    },
  );

  const atCapacity = new HiggsfieldAdapter(
    new ScriptedHttpPort([
      { method: "POST", url: "https://api.higgsfield.ai/higgsfield/genjutsu/motion-transfer/v1.0", response: { status: 429, body: "{}" } },
    ]),
    envWithKey,
  );
  await assert.rejects(
    atCapacity.submit("video.motion-transfer", "genjutsu", {}, ["ref-1"], "idem-7"),
    (error: unknown) => {
      assert.ok(error instanceof MediaAdapterError);
      assert.equal(error.kind, "capacity");
      assert.equal(error.retryable, true);
      return true;
    },
  );

  const unauthorized = new HiggsfieldAdapter(
    new ScriptedHttpPort([
      { method: "POST", url: "https://api.higgsfield.ai/higgsfield/genjutsu/motion-transfer/v1.0", response: { status: 401, body: "{}" } },
    ]),
    envWithKey,
  );
  await assert.rejects(
    unauthorized.submit("video.motion-transfer", "genjutsu", {}, ["ref-1"], "idem-8"),
    (error: unknown) => {
      assert.ok(error instanceof MediaAdapterError);
      assert.equal(error.kind, "auth");
      return true;
    },
  );
});

test("unmapped capability → unsupported (fail closed, never a guess)", async () => {
  const adapter = new HiggsfieldAdapter(new ScriptedHttpPort([]), envWithKey);
  await assert.rejects(
    adapter.submit("editor.cut-video", undefined, {}, [], "idem-9"),
    (error: unknown) => {
      assert.ok(error instanceof MediaAdapterError);
      assert.equal(error.kind, "unsupported");
      return true;
    },
  );
});

test("unknown poll status is surfaced, not silently mapped", async () => {
  const http = new ScriptedHttpPort([
    { method: "POST", url: "https://api.higgsfield.ai/higgsfield/genjutsu/motion-transfer/v1.0", response: { status: 200, body: SUBMIT_RESPONSE } },
    { method: "GET", url: "https://api.higgsfield.ai/requests/d7e6c0f3-6699-4f6c-bb45-2ad7fd9158ff/status", response: statusResponse("warping") },
  ]);
  const adapter = new HiggsfieldAdapter(http, envWithKey);
  const handle = await adapter.submit("video.motion-transfer", "genjutsu", {}, ["ref-1"], "idem-10");
  await assert.rejects(adapter.poll(handle), /unknown status "warping"/);
});
