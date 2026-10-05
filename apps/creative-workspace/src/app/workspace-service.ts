/**
 * Workspace service (app layer): composes workspace mounts from a record
 * source port. Side-effect-free — records arrive through the
 * WorkspaceRecordSource port (filesystem-backed adapter lives in
 * src/adapters). Every plan is schema-validated (domain zod binding) before
 * projection: a schema-invalid plan is refused, never rendered as fact.
 */
import type { WorkspaceMount, WorkspaceScenarioId } from "../contract.js";
import { TaskPlanSchema } from "../domain/schema/index.js";
import { buildWorkspaceMount } from "../domain/projection.js";
import type { WorkspaceRecordSource } from "../domain/records.js";

export interface WorkspaceServiceDeps {
  readonly recordSource: WorkspaceRecordSource;
}

export interface WorkspaceService {
  /** Load + validate + project one scenario into a workspace mount. */
  readonly mount: (scenarioId: WorkspaceScenarioId) => Promise<WorkspaceMount>;
  /** The committed scenarios this source can mount (for harness pages). */
  readonly scenarioIds: readonly WorkspaceScenarioId[];
}

export const WORKSPACE_SCENARIO_IDS: readonly WorkspaceScenarioId[] = [
  "documentary-cinematic",
  "forced-failure",
  "replace-actor-alternatives",
];

export function createWorkspaceService(deps: WorkspaceServiceDeps): WorkspaceService {
  return {
    mount: async (scenarioId) => {
      const bundle = await deps.recordSource.load(scenarioId);
      const parsed = TaskPlanSchema.safeParse(bundle.plan);
      if (!parsed.success) {
        throw new Error(
          `workspace: plan for scenario "${scenarioId}" violates task-plan.schema.json: ${parsed.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; ")}`,
        );
      }
      return buildWorkspaceMount({ ...bundle, plan: parsed.data });
    },
    scenarioIds: [...WORKSPACE_SCENARIO_IDS],
  };
}
