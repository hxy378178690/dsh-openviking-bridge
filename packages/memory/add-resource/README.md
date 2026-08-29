# @deepseek-ai/dsh-add-resource

OpenViking resource subscription: model-facing tools for registering local files, directories, Git repos, or URLs into OpenViking memory, with persistent watch tracking.

## Configuration

| Field | Type | Default | Meaning |
|---|---|---|---|
| `url` | string | `http://127.0.0.1:1933/mcp` | OV MCP endpoint |
| `apiKey` | string | empty → `process.env.OPENVIKING_API_KEY` | API key |
| `account` | string | `default` | OV account id |
| `user` | string | `default` | OV user id |
| `timeoutMs` | number | 60_000 | per-call timeout |
| `watchStorePath` | string | `C:/Users/Dustin/.dsh/ov-watches.json` | JSON file persisting watch subscriptions |

## Activation

```sh
pnpm dsh web \
  --patch "$PWD/examples/mcp-memory/openviking.cordis.yml" \
  --patch "$PWD/examples/memory-viking/add-resource.cordis.yml"
```

## Registered tools

The plugin registers three tools in `ctx.tools`:

| Tool | Args | Behavior |
|---|---|---|
| `openviking_add_resource` | `{ source: string, target_uri?: string, recursive?: boolean, watch?: boolean }` | Calls OV `add_resource` MCP tool, then records the subscription in `watchStorePath`. Default URI: `viking://user/<account>/<user>/resources/<safe-source-name>` |
| `openviking_list_watches` | `{}` | Reads `watchStorePath` and returns all subscriptions |
| `openviking_cancel_watch` | `{ uri: string }` | Calls OV `cancel_watch` MCP tool, removes the subscription from `watchStorePath` |

## Persistence

- `watchStorePath` is a JSON file under `C:/Users/Dustin/.dsh/` (auto-created on first write)
- Each record carries `uri`, `source`, `watchHandle`, `addedAt`
- Persists across DSH restarts; `list_watches` and `cancel_watch` operate on this store

## Known Limitations and Deferred Work

- The plugin does not poll watches; the `add_resource` call returns a watch handle but auto-refresh is delegated to OV (per its `list_watches` / `cancel_watch` API surface)
- `watchStorePath` lives in the user directory (`C:/Users/Dustin/.dsh/`); on system reinstall, copy the file back or re-add resources
- No URI scheme auto-detection: callers must provide an absolute local path, directory, git URL, or http(s) URL as `source`. OV may reject malformed inputs with a tool-call error
- No deduplication of watch records across DSH restarts beyond URI equality; re-adding the same source updates the timestamp in-place

## Known Limitations and Deferred Work

- The plugin does **not** subscribe to file system change events. Watch refresh is delegated to OV via its `list_watches` / `cancel_watch` API.
- `watchStorePath` defaults to a user-directory JSON file. On system reinstall, copy the file back or re-register each source.