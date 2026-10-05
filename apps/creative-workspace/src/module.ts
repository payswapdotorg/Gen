/**
 * creative-workspace module manifest (Gen Creative Intelligence OS, ARCHITECTURE_LOCK.md §5).
 * Dependencies mirror architecture-policy.yaml; only contract.ts is public.
 * media-providers is additionally required for the provider-catalog deltas
 * (work order: "@gen/media-providers as needed — add them as workspace deps");
 * architecture-policy.yaml's requires list should mirror this (TL request).
 */
export const creativeworkspaceModule = {
  id: "creative-workspace",
  requires: ["shared", "media-capabilities", "timeline", "agent-lab", "arena-bridge", "media-providers"],
  provides: ["creative-workspace"],
  publicEntrypoints: ["contract.ts"],
} as const;
