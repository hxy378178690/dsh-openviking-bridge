# Memory-viking example set

Opt-in overlays that bridge DSH to a local OpenViking MCP server (port 1933). Activate each overlay with `--patch`. The base MCP overlay (`examples/mcp-memory/openviking.cordis.yml`) must also be patched in.

| Overlay | Role | Doc § |
|---|---|---|
| `auto-recall.cordis.yml` | Consumer: injects OV `recall` into `agent/pre-step` waterfall | §5.1 |
| `auto-capture.cordis.yml` | Consumer: mirrors `turn/end` into OV `remember` | §5.2 |
| `persistence-mirror.cordis.yml` | Provider: one-way mirrors `session/event` to OV `viking://user/memories/...` | §6 |

## Full activation (v0 + v1 + v2)

```sh
pnpm dsh web \
  --patch "$PWD/examples/mcp-memory/openviking.cordis.yml" \
  --patch "$PWD/examples/memory-viking/auto-recall.cordis.yml" \
  --patch "$PWD/examples/memory-viking/auto-capture.cordis.yml" \
  --patch "$PWD/examples/memory-viking/persistence-mirror.cordis.yml"
```

Prerequisites: Ollama :11434 + OpenViking :1933. See `D:\聚合工具\OpenViking\README.md`.