/**
 * Higgsfield endpoint map (spec/media-provider-contract.md §4).
 *
 * Wire shape grounded in the public Higgsfield docs (quickstart):
 *   POST https://api.higgsfield.ai/{org}/{model}/{version}
 *     Authorization: Key <HIGGSFIELD_API_KEY>   Content-Type: application/json
 *     → { request_id, status, status_url, cancel_url }
 *   GET  {status_url} → job status   ·  POST {cancel_url} → cancel
 *
 * Provenance per path is recorded below; convention-based paths are marked
 * provisional and are recalibratable without touching adapter logic.
 */

export const HIGGSFIELD_DEFAULT_BASE_URL = "https://api.higgsfield.ai";

export interface EndpointEntry {
  readonly path: string;
  /** How the path was established — flows into reports (never fabricated). */
  readonly provenance: "doc-confirmed" | "path-convention-provisional";
}

export const HIGGSFIELD_CAPABILITY_ENDPOINTS: Readonly<Record<string, EndpointEntry>> = {
  "video.motion-transfer": {
    path: "/higgsfield/genjutsu/motion-transfer/v1.0",
    provenance: "doc-confirmed",
  },
  "video.character-replacement": {
    path: "/higgsfield/genjutsu/character-replacement/v1.0",
    provenance: "path-convention-provisional",
  },
  "video.object-replacement": {
    path: "/higgsfield/genjutsu/object-replacement/v1.0",
    provenance: "path-convention-provisional",
  },
  "video.restyle": {
    path: "/higgsfield/genjutsu/restyle/v1.0",
    provenance: "path-convention-provisional",
  },
  "video.reference-handling": {
    path: "/higgsfield/genjutsu/reference-handling/v1.0",
    provenance: "path-convention-provisional",
  },
};

/** Env var NAME only (lock P8). The login email/password pair is never read. */
export const HIGGSFIELD_API_KEY_ENV = "HIGGSFIELD_API_KEY";

/** Terminal/known status values mapped from the provider's status field. */
const STATUS_MAP: Readonly<Record<string, "queued" | "running" | "succeeded" | "failed" | "cancelled">> = {
  queued: "queued",
  pending: "queued",
  running: "running",
  processing: "running",
  in_progress: "running",
  succeeded: "succeeded",
  success: "succeeded",
  completed: "succeeded",
  done: "succeeded",
  failed: "failed",
  error: "failed",
  cancelled: "cancelled",
  canceled: "cancelled",
};

export function mapStatus(raw: unknown): "queued" | "running" | "succeeded" | "failed" | "cancelled" {
  if (typeof raw !== "string") {
    throw new Error(`higgsfield status field is not a string: ${JSON.stringify(raw)}`);
  }
  const mapped = STATUS_MAP[raw.toLowerCase()];
  if (mapped === undefined) {
    // Fail closed (P5): an unknown status is surfaced, never guessed.
    throw new Error(`higgsfield returned unknown status "${raw}"`);
  }
  return mapped;
}
