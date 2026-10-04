/**
 * creative-workspace module manifest (Gen Creative Intelligence OS, ARCHITECTURE_LOCK.md §5).
 * Dependencies mirror architecture-policy.yaml; only contract.ts is public.
 */
export const creativeworkspaceModule = {
  id: "creative-workspace",
  requires: ["shared", "media-capabilities", "timeline", "agent-lab", "arena-bridge"],
  provides: ["creative-workspace"],
  publicEntrypoints: ["contract.ts"],
} as const;
