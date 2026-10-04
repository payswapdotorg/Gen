/**
 * Layerless composition root: wires ports → adapters for Phase 2 integration.
 * (Sits outside domain/app/adapters so layer direction rules stay clean;
 * consumers reach it through the package index — contract stays types-only.)
 */
import type { MediaExecutionAdapter } from "./contract.js";
import type { EnvPort, HttpPort } from "./app/ports.js";
import { HiggsfieldAdapter } from "./adapters/higgsfield/higgsfield-adapter.js";
import { OPEN_MODEL_PROVIDER_CONFIGS, OpenModelAdapter } from "./adapters/open-models/open-model-adapter.js";
import { FetchHttpPort, NodeEnvPort, SystemClockPort } from "./adapters/node-ports.js";

export { HiggsfieldAdapter } from "./adapters/higgsfield/higgsfield-adapter.js";
export { OpenModelAdapter, OPEN_MODEL_PROVIDER_CONFIGS } from "./adapters/open-models/open-model-adapter.js";
export { MockAdapter } from "./adapters/mock/mock-adapter.js";
export { NodeEnvPort, FetchHttpPort, SystemClockPort } from "./adapters/node-ports.js";
export { HIGGSFIELD_CAPABILITY_ENDPOINTS, HIGGSFIELD_API_KEY_ENV } from "./adapters/higgsfield/endpoints.js";

/**
 * Build the execution adapter for a provider id (provider identity stays
 * provider-plane shaped — P1: no second abstraction, adapters are looked up
 * by provider + executionAdapter id, never constructed ad hoc by callers).
 */
export function createAdapter(
  providerId: string,
  deps: { http?: HttpPort; env?: EnvPort } = {},
): MediaExecutionAdapter {
  const http = deps.http ?? new FetchHttpPort();
  const env = deps.env ?? new NodeEnvPort();
  if (providerId === "higgsfield") return new HiggsfieldAdapter(http, env);
  const config = OPEN_MODEL_PROVIDER_CONFIGS[providerId];
  if (config !== undefined) return new OpenModelAdapter(config, http, env);
  throw new Error(`no execution adapter registered for provider "${providerId}"`);
}
