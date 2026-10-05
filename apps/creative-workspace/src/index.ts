/**
 * @gen/creative-workspace — public entrypoint (ARCHITECTURE_LOCK.md §5).
 * Library-style export for the consuming shell: contract (schema mirror +
 * view models), domain zod bindings, app service + record ports, and the
 * pure React 19 component layer. The demo harness composition root
 * (src/harness) is reachable through the package source.
 */
export * from "./contract.js";
export { TaskPlanSchema } from "./domain/schema/index.js";
export type { TaskPlanInput } from "./domain/schema/index.js";
export type {
  OrganizationEvaluationSummary,
  ProviderMeasurementRow,
  WorkspaceRecordBundle,
  WorkspaceRecordSource,
} from "./domain/records.js";
export { WORKSPACE_SCENARIO_META } from "./domain/records.js";
export { buildWorkspaceMount, resolveEvidenceLink, resolveGapLink } from "./domain/projection.js";
export { deltasBetween, currentPathDeltas } from "./domain/deltas.js";
export { createWorkspaceService, WORKSPACE_SCENARIO_IDS } from "./app/workspace-service.js";
export type { WorkspaceService, WorkspaceServiceDeps } from "./app/workspace-service.js";
export { PlanHeader } from "./ui/plan-header.js";
export { PlanSkeleton } from "./ui/plan-skeleton.js";
export { CompletedSection } from "./ui/evidence-links.js";
export { NextSection } from "./ui/next-section.js";
export { BlockedSection } from "./ui/blocked-section.js";
export { AlternativesSection } from "./ui/alternatives-section.js";
export { RunPanel } from "./ui/run-panel.js";
export { OrganizationPanel } from "./ui/organization-panel.js";
export { WorkspaceView } from "./ui/workspace-view.js";
export { WorkspaceRoot, WorkspaceErrorPanel } from "./ui/workspace-root.js";
