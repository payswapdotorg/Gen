/**
 * timeline adapters — sha256 content addressing (node:crypto lives here only).
 *
 * The domain stays pure (no node: imports); importers inject this function as
 * the ContentAddresser port. Binary content is NEVER stored here — the
 * address is a format-validated REFERENCE (sha256 of bytes that live behind
 * storeRefs).
 */
import { createHash } from "node:crypto";
import type { ContentAddresser } from "../domain/otio-import.js";

export const sha256ContentAddress: ContentAddresser = (serialized: string): string => {
  return `sha256:${createHash("sha256").update(serialized).digest("hex")}`;
};
