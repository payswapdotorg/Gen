/**
 * Role templates for the rule-based organization search (work order B5).
 * The search OUTPUT is fixed by spec/schemas/organization-graph.schema.json —
 * templates and the engine are replaceable internals.
 */
export interface RoleTemplate {
  readonly goalClass: string;
  readonly description: string;
  /** Specialist bodies after the director, in pipeline order. */
  readonly pipeline: readonly string[];
  /** Optional bodies the search may include or drop (role-structure dimension). */
  readonly optionalRoles: readonly string[];
  /** Reviewer body id (critic loop). */
  readonly reviewerBodyId: string;
  /** Terminal capability the organization invokes to deliver. */
  readonly terminalCapability: {
    readonly capabilityId: string;
    readonly parameterBindings?: Readonly<Record<string, unknown>>;
  };
  readonly humanRole: { readonly role: string; readonly approvalGates: readonly string[] };
  /** Pipeline pairs that may share a stage when the execution-order dimension allows parallelism. */
  readonly parallelizable: readonly (readonly [string, string])[];
  /** Capability ids the catalog must expose for the goal class to be servable. */
  readonly capabilityNeeds: readonly string[];
}

export const ROLE_TEMPLATES: readonly RoleTemplate[] = [
  {
    goalClass: "documentary-cinematic-remaster",
    description: "Make this documentary cinematic: cut, grade, mix and review organization (T2).",
    pipeline: ["body.video-editor", "body.color-specialist", "body.audio-specialist"],
    optionalRoles: ["body.video-continuity-supervisor"],
    reviewerBodyId: "body.critic",
    terminalCapability: { capabilityId: "editor.render-project", parameterBindings: { profile: "cinematic" } },
    humanRole: { role: "operator", approvalGates: ["final-delivery", "budget-exceeds-envelope"] },
    parallelizable: [["body.color-specialist", "body.audio-specialist"]],
    capabilityNeeds: ["editor.cut-video", "video.restyle", "audio.dialogue-cleanup", "editor.render-project"],
  },
  {
    goalClass: "character-replacement-edit",
    description: "Replace an actor with a character across a sequence (T4 forced-failure class).",
    pipeline: ["body.video-editor"],
    optionalRoles: ["body.video-continuity-supervisor"],
    reviewerBodyId: "body.critic",
    terminalCapability: { capabilityId: "editor.render-project", parameterBindings: { profile: "standard" } },
    humanRole: { role: "operator", approvalGates: ["final-delivery"] },
    parallelizable: [],
    capabilityNeeds: ["video.character-replacement", "editor.render-project"],
  },
];

export const DEFAULT_TEMPLATE: RoleTemplate = {
  goalClass: "generic-edit",
  description: "Generic edit organization fallback.",
  pipeline: ["body.video-editor"],
  optionalRoles: [],
  reviewerBodyId: "body.critic",
  terminalCapability: { capabilityId: "editor.render-project" },
  humanRole: { role: "operator", approvalGates: ["final-delivery"] },
  parallelizable: [],
  capabilityNeeds: ["editor.render-project"],
};

export function findRoleTemplate(goalClass: string): RoleTemplate {
  return ROLE_TEMPLATES.find((template) => template.goalClass === goalClass) ?? DEFAULT_TEMPLATE;
}

/** Deterministic budget share per role (normalized over present roles). */
export const ROLE_BUDGET_WEIGHTS: Readonly<Record<string, number>> = {
  "body.director": 0.2,
  "body.video-editor": 0.3,
  "body.color-specialist": 0.15,
  "body.audio-specialist": 0.15,
  "body.critic": 0.1,
  "body.video-continuity-supervisor": 0.1,
};
