/**
 * Open-model execution adapters (wan-2.2/animate · vace · ltx · hunyuan).
 *
 * All four run against the same declared open-execution protocol over a
 * remote service (transport "remote-service", kind "open-model"):
 *
 *   POST {endpoint}/jobs            {capabilityId, modelId, parameters,
 *                                    inputArtifacts, idempotencyKey} → {jobId}
 *   GET  {endpoint}/jobs/{id}       → {status, progress?}
 *   POST {endpoint}/jobs/{id}/cancel → {result: "cancelled"|"terminal"}
 *   GET  {endpoint}/jobs/{id}/artifacts → {artifacts: [{ref, mediaType}]}
 *
 * The endpoint (and optional bearer token) are env-provided per provider —
 * a local GPU gateway or hosted open-execution service implements the
 * protocol. Maturity is "experimental" by declaration (work order C.9):
 * where an open model cannot meet a scenario invariant, the comparison
 * harness records the lower conformance score — data, not failure.
 */
import type { JobHandle, JobStatus, MediaExecutionAdapter } from "../../contract.js";
import { MediaAdapterError } from "../../domain/errors.js";
import type { EnvPort, HttpPort, HttpRequest, HttpResponse } from "../../app/ports.js";

export interface OpenModelProviderConfig {
  readonly providerId: string;
  readonly defaultModelId: string;
  readonly endpointEnv: string;
  readonly tokenEnv?: string;
  readonly defaultEndpoint: string;
}

export const OPEN_MODEL_PROVIDER_CONFIGS: Readonly<Record<string, OpenModelProviderConfig>> = {
  "wan-2.2": {
    providerId: "wan-2.2",
    defaultModelId: "animate",
    endpointEnv: "WAN_2_2_EXECUTION_ENDPOINT",
    tokenEnv: "WAN_2_2_API_KEY",
    defaultEndpoint: "http://127.0.0.1:8100",
  },
  vace: {
    providerId: "vace",
    defaultModelId: "vace-1.x",
    endpointEnv: "VACE_EXECUTION_ENDPOINT",
    tokenEnv: "VACE_API_KEY",
    defaultEndpoint: "http://127.0.0.1:8101",
  },
  ltx: {
    providerId: "ltx",
    defaultModelId: "ltx-video",
    endpointEnv: "LTX_EXECUTION_ENDPOINT",
    tokenEnv: "LTX_API_KEY",
    defaultEndpoint: "http://127.0.0.1:8102",
  },
  hunyuan: {
    providerId: "hunyuan",
    defaultModelId: "hunyuan-video",
    endpointEnv: "HUNYUAN_EXECUTION_ENDPOINT",
    tokenEnv: "HUNYUAN_API_KEY",
    defaultEndpoint: "http://127.0.0.1:8103",
  },
};

const STATUS_MAP: Readonly<Record<string, JobStatus>> = {
  queued: "queued",
  running: "running",
  succeeded: "succeeded",
  failed: "failed",
  cancelled: "cancelled",
};

export function mapOpenModelStatus(raw: unknown): JobStatus {
  if (typeof raw !== "string" || STATUS_MAP[raw] === undefined) {
    // Fail closed (P5): unknown statuses surface instead of being guessed.
    throw new MediaAdapterError("provider-internal", `open-execution service returned unknown status ${JSON.stringify(raw)}`);
  }
  return STATUS_MAP[raw];
}

export class OpenModelAdapter implements MediaExecutionAdapter {
  readonly #config: OpenModelProviderConfig;
  readonly #http: HttpPort;
  readonly #env: EnvPort;
  readonly #jobs = new Map<string, JobHandle>();
  readonly #byIdempotencyKey = new Map<string, JobHandle>();

  constructor(config: OpenModelProviderConfig, http: HttpPort, env: EnvPort) {
    this.#config = config;
    this.#http = http;
    this.#env = env;
  }

  #endpoint(): string {
    return this.#env.get(this.#config.endpointEnv)?.trim() || this.#config.defaultEndpoint;
  }

  #headers(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const token = this.#config.tokenEnv === undefined ? undefined : this.#env.get(this.#config.tokenEnv);
    if (token !== undefined && token.trim() !== "") headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  async #request(method: HttpRequest["method"], url: string, body?: unknown): Promise<HttpResponse> {
    try {
      return await this.#http.request({
        method,
        url,
        headers: this.#headers(),
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      throw new MediaAdapterError("retryable", `open-execution transport failure (${method} ${url}): ${(error as Error).message}`, {
        retryable: true,
      });
    }
  }

  #checkStatus(response: HttpResponse, context: string): void {
    const { status } = response;
    if (status >= 200 && status < 300) return;
    if (status === 401 || status === 403) throw new MediaAdapterError("auth", `${context}: rejected (HTTP ${status})`);
    if (status === 404) {
      throw new MediaAdapterError("unsupported", `${context}: open-execution endpoint not found (HTTP 404)`, {
        gapSignal: true,
      });
    }
    if (status === 409 || status === 429) {
      throw new MediaAdapterError("capacity", `${context}: open-execution at capacity (HTTP ${status})`, {
        retryable: true,
        gapSignal: true,
      });
    }
    if (status === 400 || status === 422) {
      throw new MediaAdapterError("validation", `${context}: rejected payload (HTTP ${status}): ${response.body}`);
    }
    throw new MediaAdapterError("provider-internal", `${context}: open-execution error (HTTP ${status})`, { retryable: true });
  }

  #parseJson(response: HttpResponse, context: string): Record<string, unknown> {
    try {
      const parsed: unknown = JSON.parse(response.body);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("not an object");
      }
      return parsed as Record<string, unknown>;
    } catch (error) {
      throw new MediaAdapterError("provider-internal", `${context}: unparseable response: ${(error as Error).message}`);
    }
  }

  async submit(
    capabilityId: string,
    modelId: string | undefined,
    params: Readonly<Record<string, unknown>>,
    inputArtifactRefs: readonly string[],
    idempotencyKey: string,
  ): Promise<JobHandle> {
    const existing = this.#byIdempotencyKey.get(idempotencyKey);
    if (existing !== undefined) return existing;

    const response = await this.#request("POST", `${this.#endpoint()}/jobs`, {
      capabilityId,
      modelId: modelId ?? this.#config.defaultModelId,
      parameters: params,
      inputArtifacts: inputArtifactRefs,
      idempotencyKey,
    });
    this.#checkStatus(response, `submit ${capabilityId}`);
    const payload = this.#parseJson(response, `submit ${capabilityId}`);
    if (typeof payload.jobId !== "string") {
      throw new MediaAdapterError("provider-internal", "open-execution submit response missing jobId");
    }
    const handle: JobHandle = {
      jobId: payload.jobId,
      providerId: this.#config.providerId,
      modelId: modelId ?? this.#config.defaultModelId,
      capabilityId,
      idempotencyKey,
    };
    this.#jobs.set(handle.jobId, handle);
    this.#byIdempotencyKey.set(idempotencyKey, handle);
    return handle;
  }

  async poll(handle: JobHandle): Promise<JobStatus> {
    const response = await this.#request("GET", `${this.#endpoint()}/jobs/${handle.jobId}`);
    this.#checkStatus(response, `poll ${handle.jobId}`);
    return mapOpenModelStatus(this.#parseJson(response, `poll ${handle.jobId}`).status);
  }

  async *stream(handle: JobHandle): AsyncIterable<{ kind: "progress" | "preview" | "log" | "status"; payload: unknown }> {
    for (;;) {
      const response = await this.#request("GET", `${this.#endpoint()}/jobs/${handle.jobId}`);
      this.#checkStatus(response, `stream ${handle.jobId}`);
      const payload = this.#parseJson(response, `stream ${handle.jobId}`);
      const status = mapOpenModelStatus(payload.status);
      yield { kind: "progress", payload: { status, progress: payload.progress } };
      if (status === "succeeded" || status === "failed" || status === "cancelled") return;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  async cancel(handle: JobHandle): Promise<"cancelled" | "terminal"> {
    const current = await this.poll(handle);
    if (current === "succeeded" || current === "failed") return "terminal";
    const response = await this.#request("POST", `${this.#endpoint()}/jobs/${handle.jobId}/cancel`);
    this.#checkStatus(response, `cancel ${handle.jobId}`);
    return "cancelled";
  }

  async retrieve(handle: JobHandle): Promise<readonly string[]> {
    const status = await this.poll(handle);
    if (status !== "succeeded") {
      throw new MediaAdapterError("validation", `retrieve called on job in status "${status}" (not succeeded)`);
    }
    const response = await this.#request("GET", `${this.#endpoint()}/jobs/${handle.jobId}/artifacts`);
    this.#checkStatus(response, `retrieve ${handle.jobId}`);
    const payload = this.#parseJson(response, `retrieve ${handle.jobId}`);
    const artifacts = payload.artifacts;
    if (!Array.isArray(artifacts)) {
      throw new MediaAdapterError("provider-internal", "open-execution artifacts response missing artifacts[]");
    }
    const refs = artifacts
      .map((item) => (item !== null && typeof item === "object" ? (item as { ref?: unknown }).ref : undefined))
      .filter((item): item is string => typeof item === "string");
    if (refs.length === 0) {
      throw new MediaAdapterError("provider-internal", "open-execution returned zero artifact refs");
    }
    return refs;
  }
}
