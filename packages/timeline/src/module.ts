/**
 * timeline module manifest (Gen Creative Intelligence OS, ARCHITECTURE_LOCK.md §5).
 * Dependencies mirror architecture-policy.yaml; only contract.ts is public.
 */
export const timelineModule = {
  id: "timeline",
  requires: ["shared"],
  provides: ["timeline"],
  publicEntrypoints: ["contract.ts"],
} as const;
