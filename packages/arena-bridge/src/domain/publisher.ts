/**
 * Lab-availability publisher (work order C11): a certified capability becomes
 * visible to the registry index + organization search THROUGH THE CONTRACT
 * SURFACES. The registry index itself lives in @gen/media-capabilities — this
 * package never keeps a second one; the publication below is the data record
 * that package (and the workspace integration) ingests.
 */
import type { CapabilityGapReport } from "../contract.js";
import type { CapabilityDescriptor } from "@gen/media-capabilities";

/** A mapping that became available (projection of a ProviderMapping). */
export interface AvailableCapabilityMapping {
  readonly providerId: string;
  readonly modelId?: string;
  readonly executionAdapter: string;
  readonly maturity: string;
}

/** The publication a certified gap emits for the lab + router. */
export interface LabAvailabilityPublication {
  readonly publicationId: string;
  readonly gapId: string;
  readonly capabilityId: string;
  readonly mappings: readonly AvailableCapabilityMapping[];
  readonly publishedAt: string;
  /** Where the capability registry ingests this publication (P3: one registry). */
  readonly registryIngestRef: string;
}

export type PublishResult =
  | { readonly ok: true; readonly publication: LabAvailabilityPublication }
  | { readonly ok: false; readonly issue: string };

/**
 * Structural view of the lab's capability catalog port (agent-lab's
 * CapabilityCatalogEntry): defined here so arena-bridge does not import
 * @gen/agent-lab (architecture-policy: arena-bridge requires only shared +
 * media-capabilities). The shapes are the capability-gap/schema contract.
 */
export interface CapabilityCatalogEntryView {
  readonly capabilityId: string;
  readonly domain: string;
  readonly status: string;
}

/** Publish the certified capability behind a gap (certified → available). */
export function buildLabAvailabilityPublication(
  report: CapabilityGapReport,
  descriptor: CapabilityDescriptor,
  publishedAt: string,
): PublishResult {
  if (report.arena.state !== "certified" && report.arena.state !== "available") {
    return {
      ok: false,
      issue: `lab availability requires a certified gap, ${report.gapId} is ${report.arena.state}`,
    };
  }
  const capabilityId = report.arena.proposedCapabilityId;
  if (!capabilityId) {
    return { ok: false, issue: `gap ${report.gapId} has no proposed capability to publish` };
  }
  if (descriptor.id !== capabilityId) {
    return {
      ok: false,
      issue: `descriptor ${descriptor.id} does not match the proposed capability ${capabilityId}`,
    };
  }
  const mappings: AvailableCapabilityMapping[] = descriptor.providerMappings.map((mapping) => ({
    providerId: mapping.providerId,
    ...(mapping.modelId !== undefined ? { modelId: mapping.modelId } : {}),
    executionAdapter: mapping.executionAdapter,
    maturity: mapping.maturity,
  }));
  return {
    ok: true,
    publication: {
      publicationId: `pub.${capabilityId.replace(/[^a-z0-9]+/g, "-")}`,
      gapId: report.gapId,
      capabilityId,
      mappings,
      publishedAt,
      registryIngestRef: "media-capabilities/registry-ingest",
    },
  };
}

/**
 * Projection helper for organization search: fold a publication into the
 * capability catalog VIEW the lab's search consumes. This derives a view —
 * it is not a registry; the canonical index stays in @gen/media-capabilities.
 */
export function mergeIntoCapabilityCatalog(
  catalog: readonly CapabilityCatalogEntryView[],
  publication: LabAvailabilityPublication,
): CapabilityCatalogEntryView[] {
  const existing = new Set(catalog.map((entry) => entry.capabilityId));
  if (existing.has(publication.capabilityId)) return [...catalog];
  const domain = publication.capabilityId.split(".")[0] ?? "video";
  return [
    ...catalog,
    {
      capabilityId: publication.capabilityId,
      domain,
      // Lock §7: published-by-Arena capabilities are draft until TL review.
      status: "draft",
    },
  ];
}
