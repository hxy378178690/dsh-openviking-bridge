# @deepseek-ai/dsh-session-persistence-viking

One-way session-mirror to OpenViking. See the integration doc: `D:\聚合工具\DSH-Openviking对接文档.md` §6.

## Configuration

| Field | Type | Default | Meaning |
|---|---|---|---|
| `userScope` | string | `"memories"` | OV subtree under `viking://user/<userId>/` |
| `scope.user` | string? | — | logged into each mirror record header |
| `scope.project` | string? | — | logged into each mirror record header |
| `maxConcurrentWrites` | number | 4 | upper bound on parallel OV `write` calls |
| `excludedEventTypes` | string[] | `["heartbeat"]` | event types that are not mirrored |

## Activation

```sh
pnpm dsh web \
  --patch "$PWD/examples/mcp-memory/openviking.cordis.yml" \
  --patch "$PWD/examples/memory-viking/persistence-mirror.cordis.yml"
```

## URI convention

```
viking://user/<userId>/<userScope>/<sessionId>/<seq:06d>-<eventType>.md
```

`<userId>` is resolved server-side from the `X-OpenViking-User` HTTP header that `dsh-mcp-client` sends. The mirror never passes `userId` explicitly.

## Known Limitations and Deferred Work

- This is a **mirror**, not a `PersistenceBackend<TornMarker>` substitute. `loadStored` / `readStoredRevision` / `list` are not implemented; SQLite remains the authoritative store.
- Writes are fire-and-forget (`mode='create'`, `wait=false`). There is no transaction-style guarantee — a DSH crash between SQLite commit and OV write is acceptable: SQLite is the source of truth, OV is a derived cache.
- Memory pressure on OV grows linearly with session length. Operators should prune `viking://user/<id>/<userScope>/` periodically.