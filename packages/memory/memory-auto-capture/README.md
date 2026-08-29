# @deepseek-ai/dsh-memory-auto-capture

OV `remember` + deterministic `write` mirror on `turn/end`. See the integration doc: `D:\聚合工具\DSH-Openviking对接文档.md` §5.2.

## Configuration

| Field | Type | Default | Meaning |
|---|---|---|---|
| `maxMessagesPerTurn` | number | 32 | upper bound on `user/message` + `assistant/message` events included in one commit |
| `maxCharsPerMessage` | number | 4000 | per-message trim ceiling; long messages get a truncation marker |
| `mirrorWrites` | bool | `true` | also call OV `write` to a deterministic URI so the user has a synchronous, readable receipt for each commit |
| `url` | string | `http://127.0.0.1:1933/mcp` | OV MCP endpoint |
| `apiKey` | string | (empty → fall back to `process.env.OPENVIKING_API_KEY`) | API key |
| `account` | string | `default` | OV account id |
| `user` | string | `default` | OV user id |
| `timeoutMs` | number | 60_000 | per-call timeout |

## Activation

```sh
pnpm dsh web \
  --patch "$PWD/examples/mcp-memory/openviking.cordis.yml" \
  --patch "$PWD/examples/memory-viking/auto-capture.cordis.yml"
```

## Behavior

- Trigger: `session/event` of type `turn/end` with reason not in `{aborted, error}`
- Skip: any active `compaction/start` ↔ `compaction/end` bracket (no commit during compaction)
- Outcomes (per turn):
  1. **Mirror write** (default on): `mcp__openviking__write` to a deterministic URI
     `viking://user/<user>/memories/auto-capture/<sessionId>/<turn:03d>-<utc>.md`
     — synchronous, always-readable receipt; lets the user verify the commit landed without grepping OV internal indexes
  2. **Semantic commit**: `mcp__openviking__remember(messages=[...])` — async OV extraction + VLM summarization (subject to OV async pipeline; degraded to dedup-only when VLM is missing)

The mirror write runs first; if it fails, the rest still proceeds (warn-logged, never blocks). The `remember` semantic commit is independent and never blocks on the mirror.

## Verifying a commit landed

```powershell
$h = @{Authorization='Bearer ov-dev-local-DO-NOT-USE-IN-PROD';'X-OpenViking-User'='default';'X-OpenViking-Account'='default';Accept='application/json, text/event-stream'}
# 1. list the auto-capture tree
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:1933/mcp' -Headers $h -ContentType 'application/json' `
  -Body '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"v","version":"0"}}}'
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:1933/mcp' -Headers $h -ContentType 'application/json' `
  -Body '{"jsonrpc":"2.0","method":"notifications/initialized"}'
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:1933/mcp' -Headers $h -ContentType 'application/json' `
  -Body '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"tree","arguments":{"uri":"viking://user/default/default/auto-capture/","depth":3}}}'
# 2. read a specific file
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:1933/mcp' -Headers $h -ContentType 'application/json' `
  -Body '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"read","arguments":{"uris":["viking://user/default/default/auto-capture/<sid>/<file>"]}}}'
```

## Known Limitations and Deferred Work

- The mirror write is single-file-per-turn with `mode='create'`. If the same `(account, user, sessionId, turn, utc)` tuple collides (impossible under UTC millisecond precision but not guaranteed under low-resolution clocks), the second write would fail with a conflict. OV's atomic rename policy handles this defensively.
- DSH does not run its own summarization; OV's `remember` owns L0/L1 dedup and upgrading.
- VLM-disabled OV falls back to dedup-only commits (per OV README §current gaps). The mirror write is unaffected by VLM availability — it always produces a file.
- Cross-session semantic recall of auto-captured content depends on OV's async indexer. The mirror file is the deterministic receipt; cross-session search may lag until OV indexes it.
- This Consumer deliberately does **not** append a `memory/committed` SessionEvent (a previous version did, but adding new `SessionEventMap` entries from plugin code pollutes the session log with a type DSH's persistence layer rejects on reopen — the durable observability is the OV mirror file itself, which is enough).