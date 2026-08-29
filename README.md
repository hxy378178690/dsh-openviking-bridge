# @deepseek-ai/dsh-openviking-bridge

**Complete restore bundle** for the DSH ↔ OpenViking bridge. A fresh `git clone` of this repo, followed by `bash restore.sh /path/to/DSH`, restores the full integration into any DSH checkout.

## What this repo contains

| Path | Contents |
|---|---|
| `cordis.yml` | Single-overlay plugin entry: activates 6 DSH consumers in one patch |
| `package.json` | `dsh.plugin` manifest declaring the umbrella + 6 sibling package requirements |
| `restore.sh` | Idempotent restore script: copies siblings + applies modifications + runs `pnpm install` |
| `README.md` | This file |
| `packages/memory/{openviking-mcp, memory-auto-recall, memory-auto-capture, add-resource}/` | Four workspace packages (full source) |
| `packages/session/{session-persistence-viking, session-search-viking}/` | Two workspace packages (full source) |
| `examples/memory-viking/*.cordis.yml` | 5 split cordis.yml overlays (alternative activation, useful for picking individual layers) |
| `examples/mcp-memory/openviking.cordis.yml` | The v0 MCP bridge overlay (also referenced by the split path) |
| `dsh-modifications/` | Files that must be patched into a fresh DSH checkout (README rows, devDeps, tsconfig refs) |
| `ui-modifications/` | Files that must be patched into `UI/dsh-desktop/` (start script, aggregator config) |

## What this repo does NOT include

This is a DSH-side bridge only. **OpenViking itself is a separate Python service** that the user must install and run independently — see the [OpenViking repo](https://github.com/volcengine/OpenViking) for that.

No OV source code, models, configs, secrets, or vendored deps.

## Restore on a fresh DSH checkout

```sh
git clone https://github.com/hxy378178690/dsh-openviking-bridge.git
cd dsh-openviking-bridge
bash restore.sh /path/to/DSH
```

`restore.sh` is idempotent (safe to re-run). It will:

1. Copy 6 sibling packages into `DSH/packages/{memory,session}/`
2. Patch `DSH/packages/README.md` to add the `memory/` row (preserves any other rows DSH added)
3. Copy `DSH/packages/memory/README.md`
4. Patch `DSH/apps/cli/package.json` to add 6 new devDeps (preserves any other DSH entries)
5. Patch `DSH/tsconfig.host.json` to add 5 new references (preserves any DSH entries)
6. Patch `DSH/examples/package.json` to add 6 new deps (preserves any DSH entries)
7. Copy 5 split cordis.yml + 1 mcp-memory cordis.yml into `DSH/examples/`
8. Copy `.agents/notes/environment-local.md` and the agent note archive into `DSH/.agents/notes/`
9. Copy `start-dsh-edge.ps1` + `config.json` into `UI/dsh-desktop/`
10. Run `pnpm install` in the DSH directory

`restore.sh` will not overwrite files it did not itself restore. DSH upgrade edits to other files stay intact.

## Activation

### Recommended (single overlay)
```sh
cd /path/to/DSH
$env:OPENVIKING_API_KEY='ov-dev-local-DO-NOT-USE-IN-PROD'
pnpm dsh web --patch "$(git rev-parse --show-toplevel)/cordis.yml" --host 127.0.0.1 --port 3080
```

### Alternative (split overlays, pick only what you need)
```sh
pnpm dsh web \
  --patch "$PWD/examples/mcp-memory/openviking.cordis.yml" \
  --patch "$PWD/examples/memory-viking/auto-recall.cordis.yml" \
  --patch "$PWD/examples/memory-viking/auto-capture.cordis.yml" \
  --patch "$PWD/examples/memory-viking/persistence-mirror.cordis.yml" \
  --patch "$PWD/examples/memory-viking/add-resource.cordis.yml" \
  --patch "$PWD/examples/memory-viking/session-search.cordis.yml" \
  --host 127.0.0.1 --port 3080
```

## Prerequisites

- `dsh web ≥ 0.1.0-rc.6` (baseline needed by the plugin loader)
- `OPENVIKING_API_KEY` env var
- OpenViking server reachable at the URL in `cordis.yml` (default `http://127.0.0.1:1933`)
- Ollama + embedding model for OV's `find`/`recall`/indexing
- `python3` (used by `restore.sh` for JSON / README patching)

## Known Limitations and Deferred Work

- `restore.sh` uses `python3` for safe JSON patching. The script falls back to a manual instruction if Python is unavailable.
- Test coverage today: 21 unit tests for `openviking-mcp` (100% line coverage); the other five packages have zero committed specs. A per-package specs layer is the next milestone.
- Production release to `awesome-dsh-plugin` registry requires 100% per-file coverage gate.
- `session-search-viking` fires on `session/end-seed`; long-running DSH web sessions get a single end-of-life index. For real-time cross-session recall, use `memory-auto-recall`'s `find` against `viking://user/<user>/sessions/`.