/**
 * Provider-plane composition for the acceptance harness: loads the git-tracked
 * provider descriptors + evaluation records from @gen/media-providers and the
 * TL's local-tool provider glue (Phase 2: software tools join the plane), then
 * derives routing facts per capability (W1's evidence machine feeding the router).
 */
import { join } from "node:path";
import { parseProviderPlane, deriveRoutingFacts } from "../../../../packages/media-providers/src/domain/routing-facts.js";
import type { RoutingFacts, CapabilityRegistryView } from "../../../../packages/media-capabilities/src/contract.js";
import { readJsonDir, repoRoot } from "./compose-registry.js";
import type { RawDescriptorSource } from "../../../../packages/media-capabilities/src/domain/registry.js";

export interface ComposedPlane {
  readonly providers: readonly string[];
  readonly evaluations: readonly string[];
  readonly errors: readonly string[];
}

/** Load + validate the provider plane (media providers + local tools + evaluations). */
export async function composePlane(): Promise<ReturnType<typeof parseProviderPlane>> {
  const providers = await readJsonDir(
    join(repoRoot(), "packages/media-providers/src/domain/providers"),
    "media-providers",
  );
  const localTools = await readJsonDir(
    join(repoRoot(), "scripts/creative/acceptance/data/local-tool-providers"),
    "local-tool-providers",
  );
  const evaluations = await readJsonDir(
    join(repoRoot(), "packages/media-providers/src/domain/evaluations"),
    "media-providers-evals",
  );
  return parseProviderPlane([...providers, ...localTools], evaluations);
}

/**
 * Routing facts for a capability: each provider mapping gets facts from the
 * plane (evaluation rows win over descriptor defaults).
 */
export function factsForCapability(
  capabilityId: string,
  view: CapabilityRegistryView,
  plane: ReturnType<typeof parseProviderPlane>,
): RoutingFacts {
  const capability = view.capabilities.find((c) => c.id === capabilityId);
  if (capability === undefined) return { candidates: [] };
  return {
    candidates: deriveRoutingFacts(capabilityId, capability.providerMappings, plane),
  };
}

export type { RawDescriptorSource };
