# domain layer

- `domain`: pure logic — no IO, no awaits (schemas, registry index, routing decisions, search/fitness functions).
- `app`: side-effect decisions through ports (lifecycle orchestration, run records, plan updates).
- `adapters`: execution (HTTP/CLI/MCP clients, stores). See .agents/skills/architecture-governance/SKILL.md.

Phase 0 placeholder — owned per ARCHITECTURE_LOCK.md §5.
