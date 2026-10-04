# ARCHITECTURE_LOCK — Gen Creative Intelligence OS

| | |
|---|---|
| **Lock version** | 1.0.0 |
| **Status** | LOCKED — Phase 0 (Foundation) |
| **Owner** | TL (Team Lead) — the only role permitted to amend this file |
| **Base SHA** | `29628c9` (main, "feat: update v3.14.3") |
| **Created** | 2026-10-04 — operator directive, IM trace `1a10530222635c29` |
| **Amendment rule** | PR to `spec/` reviewed + merged by TL only; every amendment bumps the lock version and updates `spec/architecture-lock.md` |

This file is the **single binding authority** for the Gen Creative Intelligence OS
program. Every worker prompt, every work order, every PR is subordinate to it.
**No worker begins implementation before this file exists** — it now does; all
Phase 1 work references this document and the SHA it was locked at.

The mission, the phase plan and the worker allocation come from the operator's
implementation plan (2026-10-04). This lock converts them into enforceable
repository rules.

---

## 1. Mission (from the operator directive)

Transform Gen into a **provider-neutral creative intelligence platform** capable of:

1. Replicating Higgsfield Genjutsu capabilities.
2. Switching between video/image/audio model providers.
3. Orchestrating multiple editing software systems.
4. Allowing humans and AI agents to collaborate on creative intent.
5. Learning optimal agent organizations for user goals.
6. Discovering capability gaps and escalating them through Arena.

**Primary risk (named by the operator, binding):** building a collection of
integrations without a **capability graph + agent organization layer** — that
would recreate a normal AI wrapper instead of the intended system. Every
acceptance decision in this program is tested against that risk first.

---

## 2. Non-negotiable principles

### P1 — Gen remains the provider control plane. Extend, never replace.

The existing `@zcode/provider` plane (packages/provider: `ProviderId`, `ModelId`,
`ProviderConfig`/`ProviderModel`/`ProviderRegistry`/`ProviderConfigResolver`,
zod schemas, overlay system) is the **authoritative concept chain**:

```
Provider → Model → Capability → Execution Adapter → Artifact
```

No second provider abstraction may be created. Media/editor providers are
expressed **through** this chain: a creative provider is a provider entry with
capability mappings; an execution adapter is the concrete executor for a
(provider, model, capability) triple. See `spec/media-provider-contract.md`.

### P2 — A model is not an agent.

```
Agent Instance =
    Agent Body Version
    + Cognitive Model
    + Possession Configuration
    + Environment
    + Runtime State
```

A model **inhabits** an Agent Body. The body (e.g. `body.video-continuity-supervisor`)
stays stable while models (GPT-class, Claude-class, Gemini-class, local VLM)
change. Agent bodies MUST NOT hardcode a specific cognitive model — only
requirement classes (modality, quality class, context budget). See
`spec/agent-body-model.md`.

### P3 — All functionality is a capability.

Every action the system can perform — media generation, editor operations,
orchestration steps — is a registered capability descriptor
(`spec/schemas/capability.schema.json`) in the canonical capability registry.
Nothing executes outside the registry. Capability IDs use dotted domains:
`video.character-replacement`, `image.restyle`, `audio.*`, `editor.cut-video`,
`editor.render-project`, `orchestration.*`.

### P4 — Zcode-style task planning: no black boxes.

Every user-facing workflow exposes a **TaskPlan**
(`spec/schemas/task-plan.schema.json`): Goal / Current step / Completed (with
evidence) / Next / Blocked / Alternative. The user must never observe a
generation process without status, evidence and alternatives.

### P5 — Failure produces Capability Gap Reports, never hallucination.

When the system cannot fulfill intent, it emits a
`CapabilityGapReport` (`spec/schemas/capability-gap.schema.json`) and may
escalate through Arena (`spec/human-escalation-contract.md`). Fabricating a
capability result, or silently swallowing a failure, is a lock violation.

### P6 — All decisions live in repository documentation, not chat history.

Roadmaps, work orders, contract decisions, worker reports and evaluation
results are committed files under `spec/` and `work/`. Chat (including worker
transcripts) is a lossy transport channel, never the system of record.

### P7 — The console/replay governance stays project-agnostic.

Dispatch infrastructure (replay2) carries no Gen content (its §0 rule). Gen's
work orders live HERE; the deployment-local worker prompts under the replay's
`scripts/worker-prompts/` are derived, gitignored dispatch packets.

### P8 — Secrets never enter the repository.

Credentials are environment-provided only. `.env.example` documents variable
NAMES with empty values. Any PR containing a secret-shaped literal value is
rejected; test fixtures must assemble credential shapes at runtime from
fragments.

---

## 3. System boundary map

```
                    USER INTENT
                         |
                         v
              INTENT UNDERSTANDING LAYER          apps/creative-workspace
                         |                        (task planning UI, P4)
                         v
                AGENT ORGANIZATION LAB            packages/agent-lab
          --------------------------------        (bodies from packages/*,
          |              |               |         models from the provider
          v              v               v         plane, P2)
     Agent Body     Agent Body      Agent Body
      Director      Video Editor     Critic        body.* registry entries
          |              |               |
        Model          Model           Model       @zcode/provider plane (P1)
          |              |               |
      Provider       Provider       Provider
                         |
                         v
              CAPABILITY ORCHESTRATOR               packages/media-capabilities
              (registry + router over the           (canonical registry; adapters
        -------------------------------------        register INTO it, P3)
        |              |              |
    Higgsfield       Open Models    Software Tools
    Genjutsu         Wan/VACE       Blender         packages/media-providers
    Cinema           LTX            Natron          (execution adapters) +
    (reference)      Hunyuan        MLT/Kdenlive    packages/editor-adapters
                                   FFmpeg
                         |
                         v
              PROJECT ARTIFACT GRAPH               packages/timeline
              (OpenTimelineIO + lineage)           (shared, TL-owned)
                         |
                         v
                  USER + AI LOOP                    TaskPlan + approval gates
                         |
                         v
              CAPABILITY GAP DETECTION              packages/arena-bridge
                         |                          (gap reports, Arena flow)
                         v
                       ARENA                        human experts
                         |
                         v
              NEW VERIFIED CAPABILITIES             certification records
                         |                          (committed evidence)
                         v
                       LAB                          packages/agent-lab
```

---

## 4. What stays authoritative from the existing repository

The legacy ZCode coding-workbench plane is untouched by this program except
where a contract crosses it:

- **`@zcode/provider`** — the provider/model concept chain (P1). The creative
  plane extends it with media/editor provider entries and execution adapters.
- **`architecture-policy.yaml` + `scripts/architecture/`** — module/layer
  governance. All new modules are `managed: true` (domain → app → adapters,
  `contract.ts` public entrypoints) from day one.
- **`AGENTS.md` core principles** — spec-first (update spec before code),
  single state owner, no duplicate write paths, real verification results.
- **Tooling baseline** — pnpm 10.33.2 / Node 24 (mise.toml), `oxlint`,
  `oxfmt`, `tsc -b` composite projects, `pnpm verify:pre-push`
  (lint + architecture check).
- **Language policy** — legacy docs remain Chinese; all NEW creative-plane
  specs/work orders/reports are English (operator directive 2026-10-04).

---

## 5. Module map & worker ownership (BINDING)

| Path | Module id | Package | Owner | Phase |
|---|---|---|---|---|
| `ARCHITECTURE_LOCK.md`, `spec/**` | — | — | **TL** | 0 |
| `architecture-policy.yaml`, `pnpm-workspace.yaml`, root `package.json` | — | — | **TL** | 0 |
| `packages/media-capabilities/**` | `media-capabilities` | `@gen/media-capabilities` | **Worker 1** | 1 |
| `packages/media-providers/**` | `media-providers` | `@gen/media-providers` | **Worker 1** | 1 |
| `packages/editor-adapters/**` | `editor-adapters` | `@gen/editor-adapters` | **Worker 2** | 1 |
| `packages/agent-lab/**` | `agent-lab` | `@gen/agent-lab` | **Worker 3** | 1 |
| `packages/arena-bridge/**` | `arena-bridge` | `@gen/arena-bridge` | **Worker 3** | 1 |
| `packages/timeline/**` | `timeline` | `@gen/timeline` | **TL** (shared; targeted PRs from W2/W3) | 1 |
| `apps/creative-workspace/**` | `creative-workspace` | `@gen/creative-workspace` | **TL** (integration; UI work may be delegated per-work-order) | 2 |
| `work/**` | — | — | TL writes packets; workers append reports | 0–2 |

Rules:

- **A worker never modifies a directory owned by another worker.** Cross-plane
  needs go through the owned package's `contract.ts` (read-only consumer) or a
  TL-arbitrated PR.
- Cross-worker imports are allowed **only** against `contract.ts` public
  entrypoints and `spec/schemas/**` — never internals.
- Shared-file edits (`architecture-policy.yaml`, root scripts, `spec/**`) are
  TL-only. Workers REQUEST them in their completion report.
- Each `work/worker-*.md` may further restrict its worker; it may never relax
  this lock.

---

## 6. Data contracts

Canonical machine-readable contracts live in `spec/schemas/` (JSON Schema
2020-12, TL-owned). Each new package's `src/contract.ts` mirrors its schema as
TypeScript types; parity is mandatory (Worker 1's first task adds zod bindings
+ validation harness).

| Schema | Concept | Consumed by |
|---|---|---|
| `capability.schema.json` | `CapabilityDescriptor` + `ProviderMapping` | media-capabilities, media-providers, editor-adapters, agent-lab |
| `creative-provider.schema.json` | creative provider/adapter descriptor | media-providers, editor-adapters |
| `agent-body.schema.json` | `AgentBodyDescriptor` | agent-lab |
| `agent-instance.schema.json` | `AgentInstanceDescriptor` | agent-lab, arena-bridge |
| `organization-graph.schema.json` | `OrganizationGraph` + evaluation | agent-lab |
| `task-plan.schema.json` | `TaskPlan` (P4) | creative-workspace, agent-lab |
| `capability-gap.schema.json` | `CapabilityGapReport` + Arena states | arena-bridge |
| `artifact.schema.json` | `ArtifactDescriptor` + lineage | timeline, media-capabilities |

Validated examples live in `spec/examples/` — one per schema; the lock gate
`node scripts/creative/validate-spec-examples.mjs` must pass at every merge.

---

## 7. Extension rules (the blessed paths)

- **Add a capability**: write a schema-valid descriptor into the owning
  package's registry directory; `status: "draft"` until a conformance scenario
  + at least one provider mapping land; `active` requires TL review.
- **Add a media provider**: implement the execution adapter against
  `spec/media-provider-contract.md`, map its capabilities, pass the reference
  conformance scenarios; register provider entry per P1 (no parallel registry).
- **Add an editor adapter**: declare mode (embedded / CLI / MCP / remote
  service), implement `EditorCapability` descriptors, exchange artifacts via
  the OTIO-based contract (`spec/editor-adapter-contract.md`).
- **Add an agent body**: registry entry with decision-interface schemas,
  possession classes, evaluation criteria — model-agnostic per P2.
- **Add an organization**: `OrganizationGraph` validated by schema +
  simulation evaluation before it may be marked `certified`
  (`spec/organization-lab.md`).
- **Add a module/package**: TL registers it in `architecture-policy.yaml`
  (`managed: true`, layers, owner) before code lands.

---

## 8. Prohibited shortcuts (hard NOs)

1. **No second provider abstraction** — no parallel registry/resolver that
   duplicates the `@zcode/provider` chain for media.
2. **No model-locked agent bodies** — bodies never name a specific model id.
3. **No execution outside the capability registry** (P3) — including "quick"
   direct SDK calls from UI or app layers.
4. **No cross-ownership writes** (§5) — including shared files.
5. **No secrets in the repo** (P8).
6. **No capability marked `active` without schema + conformance + mapping.**
7. **No silent failures / no fabricated results** (P5).
8. **No decisions recorded only in chat** (P6).
9. **No black-box user-facing generation** (P4).
10. **No skipping gates**: `pnpm lint`, package `typecheck`, architecture
    check (`pnpm verify:pre-push`) and the lock's example-validation gate must
    pass at the exact pushed SHA — reported numbers are claims until the TL
    re-runs them at the integration station.
11. **No `git reset --hard` from foreign FETCH_HEADs**; sync via explicit
    `git fetch origin main:main` and file-level merges.
12. **No unmanaged new modules** — everything new is `managed: true` under the
    architecture policy.

---

## 9. Gates & acceptance

**Gate battery (every delivery branch, at the pushed SHA):**

```
pnpm install --ignore-scripts   # env bootstrap (Node 24, pnpm 10.33.2)
pnpm lint                       # oxlint, zero new violations
pnpm --filter <package> typecheck && pnpm --filter <package> build
node scripts/architecture/architecture-check.mjs check   # 0 NEW violations
node scripts/creative/validate-spec-examples.mjs          # schemas+examples valid
```

**Acceptance tests (the program's definition of done, from the operator plan):**

| # | Test | Proves | Phase gate |
|---|---|---|---|
| T1 | "Replace this actor with my character." → routes to Higgsfield **or** Wan/VACE per routing policy | provider-neutral capability routing | 1 (W1) |
| T2 | "Make this documentary cinematic." → spawns Director / Editor / Color / Audio / Critic organization | agent organization lab | 1 (W3) |
| T3 | "Use cheapest reliable method." → open models + local tools over premium providers | cost-aware routing | 1 (W1+W2) |
| T4 | System fails → `CapabilityGapReport` (+ optional Arena submission), never hallucination | gap detection / escalation | 1 (W3) |

Full program definition of done: the operator's checklist (provider source of
truth ✓, Genjutsu workflows represented ✓, alternative models can replace
providers ✓, multiple editing systems cooperate ✓, human+AI collaboration ✓,
bodies separate from models ✓, labs discover better organizations ✓, gaps
become Arena opportunities ✓, Zcode task planning ✓, decisions in repo docs ✓).

---

## 10. Phase plan & dispatch protocol

- **Phase 0 (TL only)** — this lock, `spec/**`, schemas + examples, package
  skeletons, policy registration, worker packets. No feature coding. Delivered
  at the Phase 0 SHA recorded in `work/phase-0-foundation.md`.
- **Phase 1 (parallel workers)** — W1/W2/W3 implement their owned packages
  against the contracts. ≤3 concurrent dispatched worker sessions (platform
  sandbox limit). Delivery: `w1-provider-plane`, `w2-editing-ecosystem`,
  `w3-mos-lab-arena` branches + COMPLETION REPORT (report format mandated in
  each work order). The TL re-runs every gate at the pushed SHA, then merges.
- **Phase 2 (TL integration)** — capability registry ⟷ agent lab ⟷ provider
  router ⟷ editor adapters ⟷ user workspace wiring; `apps/creative-workspace`
  built out; acceptance tests T1–T4 exercised end-to-end.

Dispatch mechanics follow the replay console's `AGENT_BOOT_PROMPT.md`
(agents tab, GLM-5.3, Full-Stack skill, hard-verified sends, capacity
fight-through policy). Worker-facing packets: `work/worker-{1,2,3}.md`.

---

## 11. Baseline environment facts (for worker prompts)

- Repo: `payswapdotorg/Gen` (public). Base: `main` @ Phase 0 SHA (see
  `work/phase-0-foundation.md`).
- Toolchain: Node 24, pnpm 10.33.2 (`corepack` / `npx -y pnpm@10.33.2`),
  install with `--ignore-scripts` in CI-like sandboxes.
- Monorepo conventions: `@gen/*` scope for the creative plane (new), `@zcode/*`
  legacy plane. Workspace globs: `packages/*` + `apps/creative-workspace`.
- The architecture checker is self-contained: `node
  scripts/architecture/architecture-check.mjs check` (needs `node_modules`
  present for `typescript`).
