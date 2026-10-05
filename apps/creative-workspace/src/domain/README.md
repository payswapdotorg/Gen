# domain layer

- Zod bindings for spec/schemas/task-plan.schema.json (`schema/`) — parity-tested against the canonical schema.
- `records.ts`: record-bundle input types (committed program records) + the record-source port.
- `projection.ts`: pure view-model builders (evidence links, gap links, alternative deltas) — no IO.
- `deltas.ts`: alternative-path delta derivation from committed provider measurements.

Layer rules (ARCHITECTURE_LOCK.md §4): pure logic — no IO, no awaits. Same layering as packages; `ui` depends only on contract surfaces.
