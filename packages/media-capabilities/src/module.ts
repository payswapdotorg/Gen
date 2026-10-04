/**
 * media-capabilities module manifest (Gen Creative Intelligence OS, ARCHITECTURE_LOCK.md §5).
 * Dependencies mirror architecture-policy.yaml; only contract.ts is public.
 */
export const mediacapabilitiesModule = {
  id: "media-capabilities",
  requires: ["shared"],
  provides: ["media-capabilities"],
  publicEntrypoints: ["contract.ts"],
} as const;
