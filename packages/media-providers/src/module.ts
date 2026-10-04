/**
 * media-providers module manifest (Gen Creative Intelligence OS, ARCHITECTURE_LOCK.md §5).
 * Dependencies mirror architecture-policy.yaml; only contract.ts is public.
 */
export const mediaprovidersModule = {
  id: "media-providers",
  requires: ["shared", "media-capabilities"],
  provides: ["media-providers"],
  publicEntrypoints: ["contract.ts"],
} as const;
