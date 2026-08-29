# Memory packages

OpenViking-backed memory capability family for DSH.

| Package | Role |
|---|---|
| [`memory-auto-recall/`](memory-auto-recall/README.md) | Consumer that injects OV `recall` results into the agent's `agent/pre-step` waterfall |
| [`memory-auto-capture/`](memory-auto-capture/README.md) | Consumer that mirrors `turn/end` payloads into OV `remember` |
| (external) | OV MCP server itself — `@deepseek-ai/dsh-mcp-client` over `streamable-http`; see [`examples/mcp-memory/openviking.cordis.yml`](../../examples/mcp-memory/openviking.cordis.yml) |

**Activation**: every package is default-off. Enable via `--patch` overlays under [`examples/memory-viking/`](../../examples/memory-viking/).

**Shared invariants**:
- Consumers never write to the model-visible surface without first honouring `next()` in the waterfall
- OV outages (`mcp__openviking__*` tools absent) make the Consumer a no-op, never a crash
- The SQLite session store remains authoritative; the viking mirror (in `session-persistence-viking`) is a one-way cache