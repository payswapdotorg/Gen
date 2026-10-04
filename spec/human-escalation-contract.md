# Human escalation contract (Arena) — Gen Creative Intelligence OS

Status: **CONTRACT v1.0** (Phase 0, locked by ARCHITECTURE_LOCK.md v1.0.0)
Owner: TL (contract) · Worker 3 (implementation)
Schema: [`schemas/capability-gap.schema.json`](schemas/capability-gap.schema.json)

> **P5 (lock §2): failure produces Capability Gap Reports, never
> hallucination.** This contract defines both human loops: escalation of
> system gaps to Arena experts, and the user-in-the-loop collaboration during
> execution.

## 1. Capability gap flow (binding state machine)

```
Failure (router/adapter/organization)
        |
        v
Capability Gap Report            state: detected
        |
        v
Arena Request                    state: arena-requested
        |
        v
Expert Session                   state: expert-session
        |
        v
New Capability (proposed)        state: proposed
        |   (descriptor draft + provider mapping proposal
        |    + conformance scenario)
        v
Certification                    state: certifying → certified
        |
        v
Lab availability                 state: available
        |   (registered capability/mapping usable by router & org search)
        v
(optional terminal states: rejected · wont-fix — with recorded rationale)
```

- `CapabilityGapReport` (schema): requested capability/intent, failure
  evidence (router decision trace, adapter error records, organization run
  ref, artifact refs), impact (goal class, severity), and the arena state
  machine fields.
- Gap reports are **committed records** under
  `packages/arena-bridge/src/domain/gaps/` (P6: decisions in the repo).
- Arena requests carry the evidence bundle; expert sessions record
  decisions; certification requires the standard capability gate
  (schema + conformance + mapping, lock §7) — an Arena-sourced capability is
  NOT exempt from the gate.

## 2. What escalates

- **Missing capability** — nothing in the registry can fulfill the intent.
- **Mapping shortfall** — mappings exist but none satisfies the policy
  (quality/cost/latency/reliability) — include the comparison table as
  evidence.
- **Organizational gap** — no certified organization achieves the goal class
  within constraints (lab evaluation evidence attached).
- **Editor coverage gap** — no editor adapter implements the needed
  `editor.*` capability headlessly.

## 3. User-in-the-loop during execution (P4 collaboration)

- Every user-facing workflow surfaces the **TaskPlan** (task-plan.md) with:
  goal, current step, completed-with-evidence, next, blocked (with gap-report
  refs), alternatives.
- **Approval gates** are organization edges (`kind: "approval"`) to human
  nodes: the runtime pauses, presents the decision bundle (plan delta, cost
  impact, alternatives), and records the human decision in the run record.
- Humans may redirect: change routing policy, swap models within a body's
  requirement class, approve/reject artifacts, supply missing inputs.
- The loop is recorded: run records keep the human decision trail (who,
  when, what was chosen, from which alternatives) — auditability is part of
  the collaboration contract.

## 4. Arena bridge package surface

`@gen/arena-bridge` implements: gap report store (git-tracked), arena request
builder, expert-session record ingest, certification evidence validator, and
the lab-availability publisher (makes certified capabilities visible to the
router + org search). TS surface: `packages/arena-bridge/src/contract.ts`.

## 5. Acceptance mapping

**T4**: a forced failure (unavailable capability for a user intent) must
produce a schema-valid gap report with evidence, and optionally an arena
request — the system NEVER fabricates a result. The acceptance harness
asserts both paths.
