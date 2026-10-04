/**
 * @gen/media-providers — public entrypoint (ARCHITECTURE_LOCK.md §5).
 * Consumers import ONLY from this surface / contract.ts. The runtime
 * composition root (adapters wiring) is exported for Phase 2 integration.
 */
export * from "./contract.js";
export * from "./runtime.js";
