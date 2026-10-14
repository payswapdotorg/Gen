# W19 — Gen-Native Product UI (Proposed TL Work Order)

**Status:** Proposed operator directive — TL review/adoption required before worker dispatch  
**Priority:** Product-critical  
**Target:** `payswapdotorg/Gen`  
**Baseline:** `main @ c3cc34f1d01a059517f13d3dea962c48e49fe309`  
**Operator intent:** The user-facing UI must be Gen's product interface, not ZCode's coding-workbench interface.

This work order is submitted for TL adoption. On merge, the TL owns the binding work order, architecture decision, bounded worker packets, integration, and evidence ledger. Do not treat this document/PR as implementation completion.

## 1. Problem confirmed in the current repository

The current browser entry `packages/web/src/main.tsx` imports `Root` from `@zcode/ui` and mounts the ZCode application. The root README presents the product as ZCode. Gen's `apps/creative-workspace` currently documents itself as a React component library plus a static demo, not the application shell that users open.

Relevant paths:

- `packages/web/src/main.tsx` — inherited ZCode browser entry.
- `packages/ui/src/Root.tsx` and `packages/ui/src/App.tsx` — inherited ZCode shell/application.
- `apps/creative-workspace/README.md` — Gen TaskPlan/workspace component library + demo.
- `ARCHITECTURE_LOCK.md` — binding architecture contract.

## 2. Required product outcome

When a user opens the Gen product, they must see and use **Gen — the Creative Intelligence OS**. The interface must communicate that Gen helps them realize creative intent by assembling agents, models, and tools; executing a task; collaborating with them; and recovering transparently when blocked.

Do not merely rename the ZCode logo, recolor the theme, or put a Gen header on the ZCode coding workspace. Gen needs its own information architecture, landing/onboarding, navigation, project library, and creative production workspace.

### Architectural direction

Prefer a Gen-owned web entry (for example, `apps/gen-web`) that composes `@gen/creative-workspace` and Gen domain services. Keep the ZCode UI and coding-workbench behavior intact as a separate legacy surface where needed. Preserve useful runtime, provider, authentication/session, terminal/browser/tool execution, and backend capabilities through explicit adapters/contracts; do not use the ZCode product shell as Gen's shell.

The user-facing Gen entry and documented default product launch/deployment must open Gen—not the ZCode `Root`. If the team retains an explicit legacy ZCode launch command, name and document it as legacy. The TL must record the launch/routing decision before implementation and explain any deviation from the preferred direction.

## 3. Product UI requirements

### 3.1 Gen visual identity and shell

- Gen-owned name/wordmark treatment, app icon/favicon, titles/metadata, typography, spacing/color tokens, navigation, and loading/empty/error surfaces.
- No ZCode logo, product copy, home screen, or primary navigation in the default Gen flow.
- Do not mount `@zcode/ui` `Root`, `App`, or a ZCode workspace shell as the Gen application.
- Generic low-level UI primitives may be reused only where they do not import/inherit ZCode product shell or branding.
- Responsive, keyboard-accessible, and coherent on the primary web experience.
- ZCode-specific coding features must not dominate the Gen home or navigation. Developer diagnostics can exist in a secondary inspect/debug surface where relevant to a creative task.

### 3.2 Intent-first home and onboarding

The first primary action should be equivalent to **“What are we making?”**, not “Which coding repository/workspace do you want to open?”

Provide a real create-project flow for:
- natural-language creative intent;
- intended deliverable/output type;
- reference assets and uploads where supported;
- quality, budget, duration, and other applicable constraints;
- creation/opening of a project with a real persisted status.

Show real existing/recent projects and their status/next action when data is available. No fabricated projects, fake job progress, or invented cost figures.

### 3.3 Primary creative workspace

Bring the following together into one Gen product workflow:

- Canvas/preview for generated or edited media.
- Project assets and reference material.
- Timeline / sequence view backed by the existing timeline model where supported.
- Required TaskPlan: goal, current step, completed items with evidence, next step, blocked state, and alternatives.
- Agent organization and current execution stage.
- Provider/model/tool choice and provenance at an inspectable level.
- Progress, errors, cost/usage **only when known**.
- User actions: approve, reject, redirect, retry, choose a valid alternative, or supply missing input.

The TaskPlan must be visible, but the workspace should not look like an internal engineering console. Keep detailed traces and policy/routing diagnostics available on demand.

### 3.4 Real integration, honest capabilities

- The existing `@gen/creative-workspace` component/contract is a starting point, not a substitute for an application.
- Connect UI state through typed adapters to supported session/project/task/provider/agent services.
- Respect the canonical capability registry, provider control plane, timeline lineage, TaskPlan, human decision records, and failure-to-Arena gap path.
- Build the minimum persistence/API bridge needed for a user to create/open a project and see true status; choose the smallest safe integration with current backend infrastructure.
- Never expose filesystem-only demo adapters to browser code. Separate browser-facing API ports from server-side record/service adapters.
- No fake controls. When a feature lacks a real execution path, show it as unavailable/blocked with the reason and next action.
- Provider/editor “available”, “live-verified”, and “production-ready” states must remain distinct.

## 4. Work split — TL to finalize in committed worker packets

Maximum three concurrent implementation workers; ownership boundaries are binding.

### Worker A — Gen application shell + home/onboarding
Likely scope: new Gen-owned frontend entry, visual system, routes/navigation, project library, create-from-intent flow, app metadata and run/build entrypoints. Must not modify another worker's package internals.

### Worker B — creative project workspace
Likely scope: compose existing workspace components into the product surface; canvas/preview, assets/references, timeline, task plan, progress, loading/blocked/error states and responsive layout.

### Worker C — real service integration + user actions
Likely scope: browser/server API adapter, real project/task state, provider/agent status, approval/redirect/retry/alternative actions, artifact/evidence display, gap/Arena links and critical journey tests.

### TL — architecture, ownership, integration, release
- Read the current web launch/runtime/auth/session contracts before selecting the app boundary.
- Commit a decision record and map all changed paths to owners before implementation.
- Register a new managed app/module with architecture policy if one is introduced.
- Preserve old ZCode UI/runtime behavior behind an explicit legacy entry if needed.
- Own shared contracts/root scripts, cross-worker changes, integration, product acceptance, and documentation.
- Delegate actual implementation; do not let all work collapse into a TL-only UI rewrite.

TL may adjust the split but must keep the full outcome and acceptance criteria below.

## 5. Delivery waves

### W19-A — architecture + execution plan
- Commit the UI boundary/launch decision.
- Commit worker work orders, ownership map, dependencies, and acceptance gates.
- Identify usable backend endpoints/services and any true missing persistence/execution capability.
- Provide a screenshot/browser acceptance plan.

### W19-B — Gen-native shell and intent-first home
- Working Gen-owned runnable frontend and product identity.
- New-project flow and real project listing/open state.
- Document the Gen product launch command.

### W19-C — integrated creative workspace
- Real TaskPlan and project state.
- Canvas/preview, assets and timeline surfaces.
- Agent/provider/tool state and human controls.
- Clear unavailable/blocked states for unconnected capabilities.

### W19-D — end-to-end verification and default product routing
- Critical user journey passes in the browser.
- Default documented product web entry points to Gen.
- Legacy ZCode UI remains available only through an explicit legacy/dev path if retained.
- Update README/run/build/deployment docs and closeout records.

## 6. Acceptance criteria (all required)

1. **Default product entry:** The documented primary Gen web command/deployment opens the Gen product UI, not ZCode's `Root`.
2. **Dependency boundary:** Source-level test or architecture check proves the Gen primary app does not mount `@zcode/ui` `Root`, `App`, or the ZCode shell.
3. **Distinct product IA:** Gen branding and product navigation are visible; no ZCode home/branding/product copy remains in the default Gen journey.
4. **Intent-first onboarding:** Users start with a creative intent and configure applicable output/references/constraints.
5. **Real state:** A user can create/open a project and see a real TaskPlan/project status via available backend/service paths.
6. **Workspace:** Canvas/preview, assets, timeline, TaskPlan, agent/org details, and actions exist as connected surfaces or explicitly unavailable states.
7. **Honest execution:** No mock jobs/evidence/costs are represented as real. Blocked/error states say why and provide a useful next action.
8. **Human loop:** UI-to-service tests cover approval, redirect, retry, and alternative selection wherever those operations exist.
9. **Provider/capability integrity:** No parallel provider abstraction and no execution outside the canonical capability registry.
10. **Accessibility/responsiveness:** Critical pages have keyboard and narrow-viewport coverage, plus accessible labels/focus/error announcements.
11. **Browser acceptance:** A repeatable browser test exercises the critical path below using real application state or explicitly controlled test service contracts.
12. **No regression:** Existing creative-plane contract/unit tests, typecheck, lint and architecture checks remain green.
13. **Cold-start proof:** Re-run relevant gates from a fresh checkout against the actual candidate merge SHA and commit results. Report skipped/live-gated tests separately.
14. **Documentation:** Gen app run/build instructions are clear; legacy ZCode commands are labelled distinctly if preserved.
15. **Product handoff:** TL provides a green-tick progress graph, residual blockers, evidence links, and follow-up work orders for any remaining production UX/operation gaps.

## 7. Critical browser acceptance journey

```text
Open Gen
  → create project with a creative intent
  → supply references/assets where supported
  → arrive in a Gen-native project workspace
  → inspect the actual TaskPlan and current status
  → review preview/artifact and timeline state
  → approve, redirect, retry, or select a supported alternative
  → see persisted project state and provenance
  → if blocked, see the reason and next action (including Arena escalation where applicable)
```

The test must fail if the application renders the inherited ZCode product shell, even if a Gen route or header exists elsewhere.

## 8. Architecture invariants and no-go conditions

- `ARCHITECTURE_LOCK.md` remains binding; no silent amendments.
- Keep `@zcode/provider` authoritative; do not create another provider system.
- Preserve ZCode engine/runtime components that are useful, but separate those from the user-visible product UI.
- Do not destabilize the inherited ZCode interface as a shortcut; keep a legacy route/command if needed.
- New modules must comply with `architecture-policy.yaml`, public-contract import rules, schema parity and worker ownership rules.
- Secrets stay environment-only.
- No checkmark without code + tests + evidence.
- If a backend operation is not yet possible, state the blocker honestly and create a specific follow-up work order.

## 9. Required TL status report

At every wave, record:

```text
Work item
Owner / branch / PR
Status: COMPLETE | PARTIAL | BLOCKED
Implementation evidence
Automated test
Browser evidence
Known limitation
Next action
```

**Priority directive:** This is a product-critical workstream. Gen must be the application users see; ZCode is an implementation foundation, not Gen's identity or shell.
