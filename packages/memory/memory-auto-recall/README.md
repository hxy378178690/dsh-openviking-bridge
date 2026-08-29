# @deepseek-ai/dsh-memory-auto-recall

OV `recall` auto-injection into the `agent/pre-step` waterfall. See the integration doc: `D:\聚合工具\DSH-Openviking对接文档.md` §5.1.

## Configuration

| Field | Type | Default | Meaning |
|---|---|---|---|
| `maxTokens` | number | 800 | hard ceiling on the recall block's token estimate |
| `maxQueryChars` | number | 800 | trim trailing user text to this many chars before passing as the `query` |

## Activation

```sh
pnpm dsh web \
  --patch "$PWD/examples/mcp-memory/openviking.cordis.yml" \
  --patch "$PWD/examples/memory-viking/auto-recall.cordis.yml"
```

The Consumer is silent unless `mcp__openviking__recall` (or any `mcp__*__recall`) is registered. If OV is down or the tool is absent, the waterfall simply does not get a recall block.

## Known Limitations and Deferred Work

- Token estimate uses `gpt-tokenizer`-style heuristic from `@deepseek-ai/dsh-token-meter` when available; falls back to the meter heuristic when not.
- The recall block is anchored to the trailing user message of the entering batch. Empty trailing user text → no recall block.
- Recall errors are warn-logged, never thrown to the loop.