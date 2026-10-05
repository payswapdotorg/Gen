/**
 * Workspace record inputs (domain layer, pure types): the committed program
 * records a workspace mount is assembled from. Adapters (src/adapters) load
 * them from the committed evidence stores via package public APIs; the
 * projection (src/domain/projection.ts) turns them into view models.
 */
import type {
  AlternativeDelta,
  TaskPlan,
  WorkspaceScenarioId,
} from "../contract.js";
import type {
  EvaluationRecord,
  OrganizationGraph,
  SimulationRunRecord,
} from "@gen/agent-lab";
import type { CapabilityGapReport } from "@gen/arena-bridge";

/** Neutral provider-measurement row used to derive alternative deltas. */
export interface ProviderMeasurementRow {
  readonly providerId: string;
  readonly modelId?: string;
  readonly qualityClass?: string;
  readonly normalizedQuality?: number;
  readonly costEstimate?: number;
  readonly costUnit?: string;
  readonly latencyClass?: string;
  readonly reliability?: number;
}

/** Measured deltas for one alternative path (matched by plan path). */
export interface AlternativeDeltaSet {
  readonly path: string;
  readonly deltas: readonly AlternativeDelta[];
}

/** Certification summary for the organization behind a plan. */
export interface OrganizationEvaluationSummary {
  readonly certified: boolean;
  readonly fitness?: number;
  readonly note?: string;
  readonly certificationEvidence?: {
    readonly scenarioSetRef: string;
    readonly replayRef: string;
    readonly certifiedAt?: string;
    readonly gapReportsResolved?: boolean;
  };
}

/** The committed records backing one workspace mount. */
export interface WorkspaceRecordBundle {
  readonly scenarioId: WorkspaceScenarioId;
  /** Schema-valid TaskPlan (validated with the domain zod binding). */
  readonly plan: TaskPlan;
  /** Committed record declaring the plan (repo-relative path). */
  readonly planSourcePath: string;
  /** The run record the plan was produced in (replayed deterministically). */
  readonly run?: SimulationRunRecord;
  /** Committed records the run replays from (replayHash-pinned). */
  readonly runProvenance: readonly string[];
  readonly organization?: OrganizationGraph;
  readonly organizationSourcePath?: string;
  readonly organizationEvaluation?: OrganizationEvaluationSummary;
  /** Committed lab evaluation record for the goal class, when one exists. */
  readonly evaluation?: EvaluationRecord;
  readonly evaluationSourcePath?: string;
  /** Committed gap reports (schema-valid) linked from blocked items. */
  readonly gapReports: readonly CapabilityGapReport[];
  /** Repo-relative source paths, parallel to gapReports. */
  readonly gapSourcePaths: readonly string[];
  /** Measured alternative deltas keyed by plan alternative path. */
  readonly alternativeDeltas: readonly AlternativeDeltaSet[];
  /** Substring hint identifying the currently active alternative path. */
  readonly activeAlternativeHint?: string;
}

/** Port: loads committed record bundles (filesystem-backed first). */
export interface WorkspaceRecordSource {
  readonly load: (scenarioId: WorkspaceScenarioId) => Promise<WorkspaceRecordBundle>;
}

/** Harness scenario metadata (titles shown by the demo harness page). */
export const WORKSPACE_SCENARIO_META: Readonly<
  Record<WorkspaceScenarioId, { readonly title: string; readonly summary: string }>
> = {
  "documentary-cinematic": {
    title: "Scenario A — T2 · documentary-cinematic run",
    summary:
      "The committed documentary-cinematic run record: plan, stages, evidence and the certified Director/Editor/Color/Audio/Critic organization.",
  },
  "forced-failure": {
    title: "Scenario B — T4 · forced-failure (blocked)",
    summary:
      "The forced-failure run: the blocked character-replacement item links the real committed gap report and certification is honestly refused.",
  },
  "replace-actor-alternatives": {
    title: "Scenario C — alternatives · premium vs open-model",
    summary:
      "The committed replace-actor plan with two alternative routing paths and measured cost/latency/quality deltas from the provider evaluation record.",
  },
} as const;
