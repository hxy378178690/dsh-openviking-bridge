# @deepseek-ai/dsh-session-search-viking

OpenViking session search index: at `session/end-seed`, write a deterministic OV file under `viking://user/<user>/sessions/<sessionId>/index-<utc>.md` so future model turns can find past-session context via `mcp__openviking__find` or `search`.

## Configuration

| Field | Type | Default | Meaning |
|---|---|---|---|
| `url` | string | `http://127.0.0.1:1933/mcp` | OV MCP endpoint |
| `apiKey` | string | empty → `process.env.OPENVIKING_API_KEY` | API key |
| `account` | string | `default` | OV account id |
| `user` | string | `default` | OV user id |
| `timeoutMs` | number | 60_000 | per-call timeout |
| `maxMessagesPerSession` | number | 64 | upper bound on user/assistant messages per index file |
| `maxCharsPerMessage` | number | 4000 | per-message trim ceiling |

## Activation

```sh
pnpm dsh web \
  --patch "$PWD/examples/mcp-memory/openviking.cordis.yml" \
  --patch "$PWD/examples/memory-viking/session-search.cordis.yml"
```

## Behavior

- Trigger: `session/event` of type `session/end-seed` (fired once per session at lifecycle end)
- Action: gather user/assistant messages (filtered to skip `<system-reminder>` AGENTS.md blocks), render markdown index file, fire-and-forget call to OV `write` with `mode='create'`
- URI: `viking://user/<user>/sessions/<sessionId>/index-<utc>.md`
- The Consumer is a pure event listener; it does **not** call `session.append` (avoids unknown `SessionEventMap` entries)

## Verifying

```powershell
$h = @{Authorization='Bearer ov-dev-local-DO-NOT-USE-IN-PROD';'X-OpenViking-User'='default';'X-OpenViking-Account'='default';Accept='application/json, text/event-stream'}
# init → notifications/initialized
$r = Invoke-WebRequest -Method Post -Uri 'http://127.0.0.1:1933/mcp' -Headers $h -ContentType 'application/json' `
  -Body '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"tree","arguments":{"uri":"viking://user/default/sessions/","depth":2}}}'
$r.Content
```

Each ended session appears as `sessions/<sid>/index-<utc>.md`.

## Known Limitations and Deferred Work

- Trigger is `session/end-seed` only — long-running sessions don't get incremental indices. For real-time cross-session recall, use `memory-auto-recall`'s `find` query against `viking://user/<user>/sessions/`.
- Fire-and-forget write: if OV is down, the index is lost (no retry queue). The SQLite session log remains the authoritative source.
- Indexed content is plain markdown of user/assistant text — tool calls and tool results are not included (they are not model-visible surface events).
- Cross-session semantic recall of indexed content depends on OV's async indexer. The index file is the deterministic receipt; cross-session search may lag until OV indexes it.