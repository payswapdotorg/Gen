/**
 * agent-lab module manifest (Gen Creative Intelligence OS, ARCHITECTURE_LOCK.md §5).
 * Dependencies mirror architecture-policy.yaml; only contract.ts is public.
 */
export const agentlabModule = {
  id: "agent-lab",
  requires: ["shared", "media-capabilities"],
  provides: ["agent-lab"],
  publicEntrypoints: ["contract.ts"],
} as const;
