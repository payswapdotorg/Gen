# Worker 6 — Human-in-the-loop collaboration plane (agent-lab, escalation contract §3)

## 1. Mission

Implement the **user-in-the-loop** semantics of `spec/human-escalation-contract.md`
§3 in `@gen/agent-lab` (`packages/agent-lab/`): approval gates must surface a
decision bundle, the runtime must pause for the human decision through a port,
humans may redirect (not just approve/reject), and run records must carry a
structured human decision trail. The definition-of-done item "human+AI
collaboration" lands here.

## 2. Hard constraint — determinism is sacred

The committed scenario records and their `replayHash` values (e.g. the
documentary-cinematic record asserted by `@gen/creative-workspace` tests, and
the lab evaluation records) MUST remain byte-stable:

- The existing `SimulationEvent` stream for scripted approvals stays
  EXACTLY as it is today (same event types, same `detail` text, same order,
  same telemetry counters).
- All new structures (decision bundles, the decision trail) are SEPARATE
  run-record extensions keyed by event `seq` — they must not enter the
  replayHash input. Study how the hash is computed FIRST and lock it with a
  regression test before touching anything.
- `runSimulation(scenario, graph)` with scripted approvals must produce
  identical events + telemetry to the current engine (regression-locked).

## 3. Tasks (in order)

### A. Study + regression lock (before any change)
1. Read `spec/human-escalation-contract.md` §3, `ARCHITECTURE_LOCK.md`,
   `packages/agent-lab/src/domain/simulation/engine.ts` (approval edge
   handling), the run-record shape, and how `replayHash` is computed.
2. Write regression tests that pin the current event stream + replayHash +
   telemetry for the committed scenarios (documentary-cinematic A,
   forced-failure B at minimum). These must pass before AND after your work.

### B. Decision bundle (domain, pure)
3. At each approval edge, construct a `DecisionBundle`: the TaskPlan delta
   at that point (completed-with-evidence, next, blocked), cost impact
   (spend so far vs envelope, projected remaining), and the alternatives
   available at that decision point (routing alternatives / model-swap
   options within the approving body's requirement class — reuse existing
   domain types; do not invent parallel ones).

### C. DecisionPort (app layer)
4. Port interface `resolveDecision(bundle): HumanDecision` — the engine
   pauses at approval edges and calls the port. Provide TWO adapters:
   (a) the scripted adapter replaying `scenario.approvals` (default; must
   reproduce today's behavior bit-exactly), (b) an interactive adapter
   harness hook (a registry callback the host can supply — used by tests
   and later by the workspace).

### D. Redirect semantics (domain)
5. `HumanDecision = approve | reject | redirect` with redirect payloads:
   `{ policyPatch }` (routing policy change), `{ modelSwap: bodyId, modelId }`
   (validated against the body's model requirement class — reject invalid
   swaps with a recorded reason), `{ inputSupply: artifactRef }`.
6. Every applied redirect is recorded with before/after (policy diff, body
   model-binding diff) in the decision trail.

### E. Decision trail (run-record extension)
7. Structured `HumanDecisionRecord[]` on the run record (SEPARATE from the
   hashed core): who (node id + role), when (clockMs + event seq), what
   (decision + payload), from which alternatives (bundle alternative ids).
   The existing `approval-recorded` events stay untouched; the trail is
   keyed by their seq.
8. Export a pure `decisionTrailOf(runRecord)` view for later workspace
   consumption (P4 tie-in — view types in contract.ts, additive only).

## 4. Boundaries (lock §5/§8 — binding)

- You own ONLY `packages/agent-lab/**`. No edits to `spec/**`, other
  packages, or root/shared files; requests go in the report. (pnpm-lock
  exception ONLY if you must add a workspace dep — prefer none: agent-lab
  already has what you need.)
- Layer rules: no IO in domain; adapters/ports only. No network, no
  secrets. Schema/contract changes are ADDITIVE only.
- Determinism law (§2 above) overrides everything: if a task cannot be done
  without changing the hashed core, STOP and report the conflict instead.

## 5. Verification gates (must pass at your pushed SHA)

```bash
# PRE-GATE REF SYNC (mandatory — stale main refs cause false architecture failures):
git fetch origin main:main
pnpm --filter @gen/agent-lab typecheck && pnpm --filter @gen/agent-lab build
pnpm lint                        # zero NEW violations in your files
node scripts/architecture/architecture-check.mjs check   # 0 new violations
pnpm spec:validate
pnpm --filter @gen/agent-lab test        # + your regression + feature tests
pnpm --filter @gen/creative-workspace test   # MUST STAY 35/35 (replayHash lock)
```

## 6. Report format (COMPLETION REPORT — last message, exact)

```
COMPLETION REPORT — Worker 6 (Human-in-the-loop)
Base SHA: <base>   Branch: w6-escalation-loop   Head SHA: <sha>
Gate table:
  typecheck/build: <real numbers>
  lint: <violations before/after in YOUR files>
  architecture: <new violations count>
  spec:validate: OK/FAIL
  tests: <agent-lab counts + creative-workspace 35/35 confirmation>
Determinism: <replayHash regression evidence — before/after hashes identical>
Decision bundle: <construction sites, fields, tests>
Port: <scripted bit-parity evidence + interactive adapter harness>
Redirect: <payload kinds, validation rules, before/after recording>
Decision trail: <record shape, seq keying, view export>
Contract change requests: <none | list with rationale>
```
