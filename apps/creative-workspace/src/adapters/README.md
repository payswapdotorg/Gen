# adapters layer

- `fs-record-source.ts`: filesystem-backed record source — loads the committed evidence (organization graphs, evaluation records, gap reports, provider measurements) via the @gen/agent-lab / @gen/arena-bridge / @gen/media-providers public APIs.
- `package-paths.ts`: locates sibling @gen/* packages through declared dependencies (import.meta.resolve) + repo-relative provenance strings.
- `provider-measurements.ts`: committed evaluation-record loading (schema-validated through @gen/media-providers public bindings).

Layer rules (ARCHITECTURE_LOCK.md §4): execution (stores, file loads). Components stay pure — no raw fs outside this layer.
