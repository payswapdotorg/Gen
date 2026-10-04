/**
 * @gen/editor-adapters — public entrypoint (ARCHITECTURE_LOCK.md §5).
 *
 * Types come from contract.ts (the module's declared public entrypoint);
 * the factory surface below is the package-level implementation wiring used
 * by Phase 2 integration (apps/creative-workspace) and tests.
 */
export * from "./contract.js";
export {
  createEditorAdapter,
  createEditorAdapters,
  EDITOR_ADAPTER_IDS,
  MltEditorAdapter,
  BlenderEditorAdapter,
  FfmpegEditorAdapter,
  NatronEditorAdapter,
  KdenliveEditorAdapter,
  LosslessCutEditorAdapter,
} from "./adapters/index.js";
export { createNodeAdapterContext, LocalArtifactStore, NodeBinaryProbe, NodeFsPort, NodeProcessPort } from "./adapters/node-ports.js";
export type { EditorAdapterContext } from "./app/ports.js";
