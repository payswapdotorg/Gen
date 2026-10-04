/**
 * arena-bridge module manifest (Gen Creative Intelligence OS, ARCHITECTURE_LOCK.md §5).
 * Dependencies mirror architecture-policy.yaml; only contract.ts is public.
 */
export const arenabridgeModule = {
  id: "arena-bridge",
  requires: ["shared", "media-capabilities"],
  provides: ["arena-bridge"],
  publicEntrypoints: ["contract.ts"],
} as const;
