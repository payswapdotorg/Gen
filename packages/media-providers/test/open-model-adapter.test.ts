import assert from "node:assert/strict";
import { test } from "node:test";
import { OPEN_MODEL_PROVIDER_CONFIGS, OpenModelAdapter } from "../src/adapters/open-models/open-model-adapter.js";
import type { EnvPort, HttpPort, HttpRequest, HttpResponse } from "../src/app/ports.js";
import { MediaAdapterError } from "../src/domain/errors.js";

const env: EnvPort = { get: () => undefined };

class RecordingHttpPort implements HttpPort {
  readonly requests: HttpRequest[] = [];
  readonly #handler: (request: HttpRequest) => HttpResponse;

  constructor(handler: (request: HttpRequest) => HttpResponse) {
    this.#handler = handler;
  }

  async request(request: HttpRequest): Promise<HttpResponse> {
    this.requests.push(request);
    return this.#handler(request);
  }
}

function json(status: number, body: unknown): HttpResponse {
  return { status, body: JSON.stringify(body) };
}

test("open-model adapter speaks the declared jobs protocol end to end", async () => {
  let jobCounter = 0;
  const state = { status: "queued" };
  const http = new RecordingHttpPort((request) => {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/jobs") {
      jobCounter += 1;
      return json(200, { jobId: `oj-${jobCounter}` });
    }
    if (request.method === "GET" && url.pathname === "/jobs/oj-1") {
      return json(200, { status: state.status, progress: 0.3 });
    }
    if (request.method === "GET" && url.pathname === "/jobs/oj-1/artifacts") {
      return json(200, { artifacts: [{ ref: "file:///out/result.mp4", mediaType: "video/mp4" }] });
    }
    return json(404, {});
  });
  const adapter = new OpenModelAdapter(OPEN_MODEL_PROVIDER_CONFIGS["wan-2.2"]!, http, env);
  const handle = await adapter.submit("video.character-replacement", "animate", { preserveAudio: true }, ["ref-1", "ref-2"], "idem-open-1");
  assert.equal(handle.providerId, "wan-2.2");
  assert.equal(handle.modelId, "animate");
  assert.equal(handle.jobId, "oj-1");

  const submitted = http.requests[0];
  assert.ok(submitted !== undefined);
  const body = JSON.parse(submitted.body ?? "{}") as Record<string, unknown>;
  assert.equal(body.capabilityId, "video.character-replacement");
  assert.equal(body.idempotencyKey, "idem-open-1");
  assert.deepEqual(body.inputArtifacts, ["ref-1", "ref-2"]);

  assert.equal(await adapter.poll(handle), "queued");
  state.status = "succeeded";
  assert.equal(await adapter.poll(handle), "succeeded");
  const refs = await adapter.retrieve(handle);
  assert.deepEqual(refs, ["file:///out/result.mp4"]);
});

test("endpoint comes from the env var name declared in the descriptor", async () => {
  const envWithEndpoint: EnvPort = { get: (name) => (name === "LTX_EXECUTION_ENDPOINT" ? "http://gpu-box:9999" : undefined) };
  const http = new RecordingHttpPort(() => json(200, { jobId: "oj-ltx" }));
  const adapter = new OpenModelAdapter(OPEN_MODEL_PROVIDER_CONFIGS.ltx!, http, envWithEndpoint);
  await adapter.submit("video.restyle", "ltx-video", {}, ["ref"], "idem-ltx");
  assert.equal(http.requests[0]?.url, "http://gpu-box:9999/jobs");
});

test("submit is idempotent per key (no duplicate job creation)", async () => {
  let created = 0;
  const http = new RecordingHttpPort(() => {
    created += 1;
    return json(200, { jobId: `oj-${created}` });
  });
  const adapter = new OpenModelAdapter(OPEN_MODEL_PROVIDER_CONFIGS.vace!, http, env);
  const one = await adapter.submit("video.restyle", undefined, {}, ["ref"], "same-key");
  const two = await adapter.submit("video.restyle", undefined, {}, ["ref"], "same-key");
  assert.equal(one, two);
  assert.equal(created, 1);
});

test("404 on the jobs endpoint maps to unsupported with a gap signal", async () => {
  const http = new RecordingHttpPort(() => json(404, {}));
  const adapter = new OpenModelAdapter(OPEN_MODEL_PROVIDER_CONFIGS.hunyuan!, http, env);
  await assert.rejects(
    adapter.submit("video.reference-handling", undefined, {}, ["ref"], "idem-hy"),
    (error: unknown) => {
      assert.ok(error instanceof MediaAdapterError);
      assert.equal(error.kind, "unsupported");
      assert.equal(error.gapSignal, true);
      return true;
    },
  );
});

test("all four open-model providers are configured", () => {
  assert.deepEqual(Object.keys(OPEN_MODEL_PROVIDER_CONFIGS).sort(), ["hunyuan", "ltx", "vace", "wan-2.2"]);
  for (const config of Object.values(OPEN_MODEL_PROVIDER_CONFIGS)) {
    assert.match(config.endpointEnv, /^[A-Z][A-Z0-9_]*$/);
  }
});
