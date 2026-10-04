/**
 * Typed adapter error (spec/media-provider-contract.md §3 taxonomy).
 * Thrown by execution adapters; caught by orchestrators. "unsupported" and
 * repeated "capacity" carry a gap signal (P5) — never swallow silently.
 */
import type { MediaProviderError, MediaProviderErrorKind } from "./types.js";

export class MediaAdapterError extends Error implements MediaProviderError {
  readonly kind: MediaProviderErrorKind;
  readonly retryable: boolean;
  readonly gapSignal: boolean;

  constructor(kind: MediaProviderErrorKind, message: string, options?: { retryable?: boolean; gapSignal?: boolean }) {
    super(message);
    this.name = "MediaAdapterError";
    this.kind = kind;
    this.retryable = options?.retryable ?? false;
    this.gapSignal = options?.gapSignal ?? kind === "unsupported";
  }
}
