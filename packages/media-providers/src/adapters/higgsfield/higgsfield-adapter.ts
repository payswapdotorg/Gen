/**
 * Higgsfield reference adapter — the Genjutsu compatibility baseline
 * (maturity "reference", spec/media-provider-contract.md §4).
 *
 * Implements MediaExecutionAdapter over the HTTP transport port:
 * submit / poll / stream / cancel / retrieve, client-side idempotency
 * (retry of submit with the same key returns the same JobHandle), and the
 * full error taxonomy. Credentials arrive env-only via the EnvPort; the
 * adapter never logs or persists credential values.
 */
import type { JobEvent, JobHandle, JobStatus, MediaExecutionAdapter } from "../../contract.js";
import { MediaAdapterError } from "../../domain/errors.js";
import type { EnvPort, HttpPort, HttpRequest, HttpResponse } from "../../app/ports.js";
import {
  HIGGSFIELD_API_KEY_ENV,
  HIGGSFIELD_CAPABILITY_ENDPOINTS,
  HIGGSFIELD_DEFAULT_BASE_URL,
  mapStatus,
} from "./endpoints.js";

interface TrackedJob {
  readonly handle: JobHandle;
  readonly statusUrl: string;
  readonly cancelUrl: string;
}

export interface HiggsfieldAdapterOptions {
  readonly baseUrl?: string;
  readonly pollIntervalMs?: number;
}

/**
 * Builds the request body per capability. The motion-transfer payload shape
 * (video_url + image_urls) is doc-confirmed; the others follow the same
 * convention (first video artifact → video_url, image artifacts → image_urls).
 */
function buildBody(
  capabilityId: string,
  params: Readonly<Record<string, unknown>>,
  inputArtifactRefs: readonly string[],
): Record<string, unknown> {
  const known: ReadonlySet<string> = new Set(["video.motion-transfer", "video.character-replacement"]);
  if (known.has(capabilityId) || HIGGSFIELD_CAPABILITY_ENDPOINTS[capabilityId] !== undefined) {
    const [first, ...rest] = inputArtifactRefs;
    const body: Record<string, unknown> = { ...params };
    if (first !== undefined) body.video_url = first;
    if (rest.length > 0) body.image_urls = rest;
    return body;
  }
  return { ...params, inputs: inputArtifactRefs };
}

export class HiggsfieldAdapter implements MediaExecutionAdapter {
  readonly #http: HttpPort;
  readonly #env: EnvPort;
  readonly #baseUrl: string;
  readonly #pollIntervalMs: number;
  readonly #jobs = new Map<string, TrackedJob>();
  readonly #byIdempotencyKey = new Map<string, JobHandle>();

  constructor(http: HttpPort, env: EnvPort, options: HiggsfieldAdapterOptions = {}) {
    this.#http = http;
    this.#env = env;
    this.#baseUrl = options.baseUrl ?? HIGGSFIELD_DEFAULT_BASE_URL;
    this.#pollIntervalMs = options.pollIntervalMs ?? 2000;
  }

  #authorization(): string {
    const credential = this.#env.get(HIGGSFIELD_API_KEY_ENV);
    if (credential === undefined || credential.trim() === "") {
      throw new MediaAdapterError(
        "auth",
        `missing ${HIGGSFIELD_API_KEY_ENV} in environment (name only; value is operator-provisioned)`,
      );
    }
    return `Key ${credential}`;
  }

  async #request(method: HttpRequest["method"], url: string, body?: unknown): Promise<HttpResponse> {
    // Authorization resolves OUTSIDE the try so an auth failure keeps its
    // taxonomy kind instead of being re-wrapped as a network error.
    const authorization = this.#authorization();
    try {
      return await this.#http.request({
        method,
        url,
        headers: {
          Authorization: authorization,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      if (error instanceof MediaAdapterError) throw error;
      throw new MediaAdapterError("retryable", `network failure calling ${method} ${url}: ${(error as Error).message}`, {
        retryable: true,
      });
    }
  }

  #checkStatus(response: HttpResponse, context: string): void {
    const { status } = response;
    if (status >= 200 && status < 300) return;
    if (status === 401 || status === 403) {
      throw new MediaAdapterError("auth", `${context}: authentication rejected (HTTP ${status})`);
    }
    if (status === 404) {
      throw new MediaAdapterError(
        "unsupported",
        `${context}: endpoint not found (HTTP 404) — capability path unavailable`,
        { gapSignal: true },
      );
    }
    if (status === 409 || status === 429) {
      throw new MediaAdapterError("capacity", `${context}: provider at capacity (HTTP ${status})`, {
        retryable: true,
        gapSignal: true,
      });
    }
    if (status === 400 || status === 422) {
      throw new MediaAdapterError("validation", `${context}: request rejected (HTTP ${status}): ${response.body}`);
    }
    throw new MediaAdapterError("provider-internal", `${context}: provider error (HTTP ${status})`, {
      retryable: true,
    });
  }

  #parseJson(response: HttpResponse, context: string): Record<string, unknown> {
    try {
      const parsed: unknown = JSON.parse(response.body);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("not an object");
      }
      return parsed as Record<string, unknown>;
    } catch (error) {
      throw new MediaAdapterError("provider-internal", `${context}: unparseable response body: ${(error as Error).message}`);
    }
  }

  #tracked(handle: JobHandle): TrackedJob {
    const tracked = this.#jobs.get(handle.jobId);
    if (tracked === undefined) {
      throw new MediaAdapterError("validation", `unknown job id ${handle.jobId} for this adapter instance`);
    }
    return tracked;
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

    const endpoint = HIGGSFIELD_CAPABILITY_ENDPOINTS[capabilityId];
    if (endpoint === undefined) {
      throw new MediaAdapterError(
        "unsupported",
        `higgsfield adapter has no endpoint mapped for ${capabilityId}`,
        { gapSignal: true },
      );
    }

    const response = await this.#request(
      "POST",
      `${this.#baseUrl}${endpoint.path}`,
      buildBody(capabilityId, params, inputArtifactRefs),
    );
    this.#checkStatus(response, `submit ${capabilityId}`);
    const payload = this.#parseJson(response, `submit ${capabilityId}`);

    const requestId = payload.request_id;
    const statusUrl = payload.status_url;
    const cancelUrl = payload.cancel_url;
    if (typeof requestId !== "string" || typeof statusUrl !== "string" || typeof cancelUrl !== "string") {
      throw new MediaAdapterError("provider-internal", "submit response missing request_id/status_url/cancel_url");
    }

    const handle: JobHandle = {
      jobId: requestId,
      providerId: "higgsfield",
      modelId: modelId ?? "genjutsu",
      capabilityId,
      idempotencyKey,
    };
    this.#jobs.set(handle.jobId, { handle, statusUrl, cancelUrl });
    this.#byIdempotencyKey.set(idempotencyKey, handle);
    return handle;
  }

  async poll(handle: JobHandle): Promise<JobStatus> {
    const tracked = this.#tracked(handle);
    const response = await this.#request("GET", tracked.statusUrl);
    this.#checkStatus(response, `poll ${handle.jobId}`);
    const payload = this.#parseJson(response, `poll ${handle.jobId}`);
    return mapStatus(payload.status);
  }

  async *stream(handle: JobHandle): AsyncIterable<JobEvent> {
    // Poll-derived event stream: the docs surface no native streaming
    // endpoint, so progress events are synthesized from status transitions.
    for (;;) {
      const status = await this.poll(handle);
      yield { kind: "status", payload: { status } };
      if (status === "succeeded" || status === "failed" || status === "cancelled") return;
      await new Promise((resolve) => setTimeout(resolve, this.#pollIntervalMs));
    }
  }

  async cancel(handle: JobHandle): Promise<"cancelled" | "terminal"> {
    const tracked = this.#tracked(handle);
    const current = await this.poll(handle);
    if (current === "succeeded" || current === "failed") return "terminal";
    const response = await this.#request("POST", tracked.cancelUrl);
    this.#checkStatus(response, `cancel ${handle.jobId}`);
    return "cancelled";
  }

  async retrieve(handle: JobHandle): Promise<readonly string[]> {
    const tracked = this.#tracked(handle);
    const response = await this.#request("GET", tracked.statusUrl);
    this.#checkStatus(response, `retrieve ${handle.jobId}`);
    const payload = this.#parseJson(response, `retrieve ${handle.jobId}`);
    const status = mapStatus(payload.status);
    if (status !== "succeeded") {
      throw new MediaAdapterError("validation", `retrieve called on job in status "${status}" (not succeeded)`);
    }
    const output = payload.output;
    const refs = extractArtifactRefs(output);
    if (refs === undefined) {
      throw new MediaAdapterError("provider-internal", "succeeded job has no recognizable output artifacts");
    }
    return refs;
  }
}

/** Defensive extraction of artifact refs from the provider's output field. */
export function extractArtifactRefs(output: unknown): readonly string[] | undefined {
  if (Array.isArray(output)) {
    const refs = output.filter((item): item is string => typeof item === "string");
    return refs.length === output.length && refs.length > 0 ? refs : undefined;
  }
  if (output !== null && typeof output === "object") {
    for (const value of Object.values(output)) {
      if (Array.isArray(value)) {
        const refs = value.filter((item): item is string => typeof item === "string");
        if (refs.length > 0) return refs;
      }
    }
  }
  if (typeof output === "string" && output.length > 0) return [output];
  return undefined;
}
