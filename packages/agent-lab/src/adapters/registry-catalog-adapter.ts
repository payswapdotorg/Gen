/**
 * Adapter from the canonical capability registry (@gen/media-capabilities
 * contract surface) to the lab's capability catalog port. The registry index
 * itself stays in @gen/media-capabilities — the lab never keeps a second one.
 */
import type { CapabilityRegistryView } from "@gen/media-capabilities";
import type { CapabilityCatalogEntry } from "../contract.js";

export function registryViewToCapabilityCatalog(view: CapabilityRegistryView): CapabilityCatalogEntry[] {
  return view.capabilities.map((capability) => ({
    capabilityId: capability.id,
    domain: capability.domain,
    status: capability.status,
  }));
}
