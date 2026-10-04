/**
 * editor-adapters module manifest (Gen Creative Intelligence OS, ARCHITECTURE_LOCK.md §5).
 * Dependencies mirror architecture-policy.yaml; only contract.ts is public.
 */
export const editoradaptersModule = {
  id: "editor-adapters",
  requires: ["shared", "media-capabilities", "timeline"],
  provides: ["editor-adapters"],
  publicEntrypoints: ["contract.ts"],
} as const;
