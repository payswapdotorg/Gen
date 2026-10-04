/**
 * Agent body registry (work order A2): git-tracked descriptors under
 * src/domain/bodies/, in-memory index, possession-class validation at binding,
 * model requirement classes ONLY — a descriptor naming a concrete model id is a
 * lock violation (§8.2) and is rejected here.
 */
import { AgentBodyDescriptorSchema } from "../schema/agent-body.js";
import type { AgentBodyDescriptor } from "../../contract.js";
import { directorBody } from "./body.director.js";
import { videoEditorBody } from "./body.video-editor.js";
import { colorSpecialistBody } from "./body.color-specialist.js";
import { audioSpecialistBody } from "./body.audio-specialist.js";
import { criticBody } from "./body.critic.js";
import { videoContinuitySupervisorBody } from "./body.video-continuity-supervisor.js";

/** Launch bodies (work order A3). */
export const LAUNCH_BODIES: readonly AgentBodyDescriptor[] = [
  directorBody,
  videoEditorBody,
  colorSpecialistBody,
  audioSpecialistBody,
  criticBody,
  videoContinuitySupervisorBody,
];

/**
 * Heuristic semantic guard backing lock §8.2: bodies must not name concrete
 * model ids. JSON Schema cannot express "no model ids" — this regex matches
 * model-id-shaped tokens (vendor prefix + version digits) such as glm-5.3,
 * gpt-4o, claude-3.5, wan-2.2 — while allowing class prose like "GPT-class".
 */
const CONCRETE_MODEL_ID_PATTERNS: readonly RegExp[] = [
  /\b(gpt|claude|gemini|glm|llama|qwen|deepseek|grok|kimi|mistral|sora|wan|vace|genjutsu)[-_./]?\d/i,
  /\bopenai\b|\banthropic\b|\bhiggsfield\b/i,
];

/** Returns the list of concrete model-id-looking tokens found in a descriptor. */
export function findConcreteModelIdReferences(body: AgentBodyDescriptor): string[] {
  const text = JSON.stringify(body);
  const found: string[] = [];
  for (const pattern of CONCRETE_MODEL_ID_PATTERNS) {
    const match = pattern.exec(text);
    if (match) found.push(match[0]);
  }
  return found;
}

export interface BodyRegistry {
  readonly bodies: readonly AgentBodyDescriptor[];
  readonly issues: readonly string[];
  /** Latest non-deprecated descriptor for a body id. */
  get(bodyId: string): AgentBodyDescriptor | undefined;
  /** Exact (bodyId, version) descriptor. */
  getExact(bodyId: string, version: string): AgentBodyDescriptor | undefined;
}

export function buildBodyRegistry(
  extra: readonly AgentBodyDescriptor[] = [],
): BodyRegistry {
  const all = [...LAUNCH_BODIES, ...extra];
  const issues: string[] = [];
  const seen = new Set<string>();
  const bodies: AgentBodyDescriptor[] = [];
  for (const body of all) {
    const parsed = AgentBodyDescriptorSchema.safeParse(body);
    if (!parsed.success) {
      issues.push(
        `body ${String(body.id ?? "<unknown>")}: schema violation: ${parsed.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; ")}`,
      );
      continue;
    }
    const modelIdRefs = findConcreteModelIdReferences(parsed.data);
    if (modelIdRefs.length > 0) {
      issues.push(`body ${parsed.data.id}: names concrete model id(s) ${modelIdRefs.join(", ")} — lock §8.2 violation`);
      continue;
    }
    const key = `${parsed.data.id}@${parsed.data.version}`;
    if (seen.has(key)) {
      issues.push(`body ${parsed.data.id}: duplicate version ${parsed.data.version}`);
      continue;
    }
    seen.add(key);
    bodies.push(parsed.data);
  }
  const byId = new Map<string, AgentBodyDescriptor[]>();
  for (const body of bodies) {
    const list = byId.get(body.id) ?? [];
    list.push(body);
    byId.set(body.id, list);
  }
  return {
    bodies,
    issues,
    get(bodyId) {
      const list = byId.get(bodyId);
      if (!list) return undefined;
      const live = list.filter((body) => body.lifecycle.state !== "deprecated");
      return live.length > 0 ? live[live.length - 1] : undefined;
    },
    getExact(bodyId, version) {
      return (byId.get(bodyId) ?? []).find((body) => body.version === version);
    },
  };
}

/** Shared built-in registry (bodies are immutable committed data). */
export const bodyRegistry: BodyRegistry = buildBodyRegistry();
