# Agent body model — Gen Creative Intelligence OS

Status: **CONTRACT v1.0** (Phase 0, locked by ARCHITECTURE_LOCK.md v1.0.0)
Owner: TL (contract) · Worker 3 (implementation)
Schema: [`schemas/agent-body.schema.json`](schemas/agent-body.schema.json),
[`schemas/agent-instance.schema.json`](schemas/agent-instance.schema.json)

> **P2 (lock §2): a model is not an agent.** A model **inhabits** an Agent
> Body. The body is the stable role contract; the cognitive model is a
> swappable occupant selected by the organization lab.

## 1. The agent instance equation (binding)

```
Agent Instance =
    Agent Body Version        // stable role: percepts, actuators, decision interface
    + Cognitive Model         // (providerId, modelId) from the @zcode/provider plane
    + Possession Configuration// granted capabilities, tools, budget
    + Environment             // workspace refs, artifact store, sandbox
    + Runtime State           // transient phase/task-plan pointers — persisted out-of-band
```

- The **body version** is the compatibility unit: swapping the cognitive model
  must not change the body's contract observables.
- **Runtime state is never part of the persisted descriptor** — it lives in
  the run record (organization run store), keyed by instance id.

## 2. Agent Body descriptor

```
body.<name>            e.g. body.director, body.video-editor,
                       body.critic, body.color-specialist,
                       body.audio-specialist, body.video-continuity-supervisor
```

A `AgentBodyDescriptor` (schema) declares:

- `id`, `version`, `role` (one-line mission), `summary`.
- **`decisionInterface`** — the stable contract the occupant model fulfills:
  input schema ref (percept bundle) + output schema ref (decision bundle,
  e.g. plan-approval, edit-instruction, critique). This is what makes models
  interchangeable: any model able to produce the output schema can inhabit
  the body.
- **`percepts`** — what the body observes (artifact refs, task-plan state,
  capability results, human messages).
- **`actuators`** — capabilities (capability IDs) + tools the body may invoke
  through its decision outputs; execution always goes through the capability
  router (P3).
- **`possessionClasses`** — grantable possession classes (capability sets,
  tool sets, budget classes) with limits.
- **`modelRequirements`** — REQUIREMENT CLASSES ONLY, never model ids:
  `modalities` (text/image/video/audio in/out), `qualityClass`
  (`lightweight | standard | flagship`), `minContextTokens`, latency class.
  A descriptor naming a concrete model id is a lock violation (§8.2).
- **`contextSchema`** — the body's working-memory contract.
- **`evaluationCriteria`** — named criteria used by the organization lab's
  fitness function for this role (e.g. "critic catches seeded defects",
  "director plans within budget").
- `lifecycle`: `created`, `deprecated` (bodies are versioned; breaking
  decision-interface change = new version + deprecation path).

## 3. Agent Instance descriptor

`AgentInstanceDescriptor` (schema) binds a run: `instanceId`, `bodyId` +
`bodyVersion`, `cognitiveModel {providerId, modelId}`, `possessionConfig`
(concrete grants within the body's classes + budget allocation),
`environment {workspaceRef, artifactStoreRef, sandboxRef?}`, and a pointer to
runtime state. Instantiation rules:

- grants MUST be within the body's `possessionClasses` (validated);
- `cognitiveModel` MUST resolve in the provider registry (P1);
- the lab (not the caller) performs binding in organization assembly.

## 4. Registry

- Bodies: git-tracked descriptors in `packages/agent-lab/src/domain/bodies/`.
- Model assignment is a **lab decision output** (search dimension), recorded
  in the organization graph, never in the body descriptor.
- Example target bodies for Phase 1 (from the operator's acceptance T2):
  `body.director`, `body.video-editor`, `body.color-specialist`,
  `body.audio-specialist`, `body.critic`.

## 5. Human roles

Humans are first-class organization nodes (`kind: "human"`) with roles and
approval gates (see `human-escalation-contract.md` §"user-in-the-loop") — a
human node can hold an `AgentBody`-shaped contract too (same decision
interface, model = the human).

## 6. TS surface

`packages/agent-lab/src/contract.ts` mirrors both schemas. Worker 3 adds zod
bindings; schema parity is mandatory (lock §6).
