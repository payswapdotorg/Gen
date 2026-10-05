# app layer

- `workspace-service.ts`: composes workspace mounts through the record-source port (domain/records.ts); validates every plan against the task-plan zod binding before projection — schema-invalid plans are refused, never rendered as fact.

Layer rules (ARCHITECTURE_LOCK.md §4): side-effect decisions through ports; the filesystem record source lives in `adapters/`.
