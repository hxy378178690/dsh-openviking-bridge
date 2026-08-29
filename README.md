# DSH ↔ OpenViking Bridge 插件包

**DSH ↔ OpenViking 对接完整恢复包**。`git clone` 本仓 + 执行 `restore.sh` 即可把 DSH ↔ OpenViking 全部功能恢复到任意 DSH 检出目录。

---

## 中文说明

### 这是什么

DSH ↔ OpenViking 桥接插件，把两个系统对接成一个整体：

| 层 | 组件 | 功能 |
|---|---|---|
| **v0** | `@deepseek-ai/dsh-mcp-client` | 16 个 OV MCP 工具（`mcp__openviking__find / search / recall / read / write / edit / list / tree / remember / add_resource / list_watches / cancel_watch / grep / glob / forget / health`）暴露给模型 |
| **v1** | `@deepseek-ai/dsh-memory-auto-recall` | 每轮对话自动把相关记忆 prepend 到 system prompt |
| **v1** | `@deepseek-ai/dsh-memory-auto-capture` | 每轮结束自动把对话 commit 到 OV |
| **v2** | `@deepseek-ai/dsh-session-persistence-viking` | session 事件流自动镜像到 OV |
| **扩展** | `@deepseek-ai/dsh-add-resource` | 模型可用工具把本地文件 / 目录 / Git 仓库 / URL 导入 OV 记忆 |
| **扩展** | `@deepseek-ai/dsh-session-search-viking` | session 结束自动索引内容，支持跨会话语义搜索 |

**注意**：本插件**不包含 OpenViking 本身**。OpenViking 是独立的 Python 服务，需单独安装部署（见 [OpenViking 官方仓库](https://github.com/volcengine/OpenViking)）。

### 前置条件

- **DSH**：`dsh web ≥ 0.1.0-rc.6`
- **OpenViking**：已在 `http://127.0.0.1:1933` 运行（独立部署）
- **Ollama**：已运行 + 拉取 embedding 模型（如 `nomic-embed-text`）
- **API Key**：`OPENVIKING_API_KEY` 环境变量（默认开发 key：`ov-dev-local-DO-NOT-USE-IN-PROD`）

### 一、全新 DSH 检出后恢复（DSH 升级 / 重装场景）

```sh
git clone https://github.com/hxy378178690/dsh-openviking-bridge.git
cd dsh-openviking-bridge
bash restore.sh /path/to/DSH        # 默认 D:/聚合工具/DSH
```

`restore.sh` 是幂等的（重复运行无副作用），会：

1. 拷贝 6 个 sibling 包到 `DSH/packages/{memory,session}/`
2. 给 `DSH/packages/README.md` 追加 `memory/` 行（保留 DSH 其他行）
3. 拷贝 `DSH/packages/memory/README.md`
4. 给 `DSH/apps/cli/package.json` 追加 7 个 devDeps（保留 DSH 其他 entry）
5. 给 `DSH/tsconfig.host.json` 追加 6 个 references（保留 DSH 其他 entry）
6. 给 `DSH/examples/package.json` 追加 6 个 deps（保留 DSH 其他 entry）
7. 拷贝 6 个 split cordis.yml 到 `DSH/examples/{memory-viking,mcp-memory}/`
8. 拷贝 `.agents/notes/` 环境事实 + agent note 到 `DSH/.agents/notes/`
9. 拷贝 `start-dsh-edge.ps1` + `config.json` 到 `UI/dsh-desktop/`
10. 在 DSH 目录运行 `pnpm install`（自动 link 新包 + 重写 lockfile）

### 二、启用（DSH 升级后怎么启动）

**推荐方式（单一 overlay）**：

```sh
cd /path/to/DSH
export OPENVIKING_API_KEY='ov-dev-local-DO-NOT-USE-IN-PROD'
pnpm dsh web --patch "$(git rev-parse --show-toplevel)/cordis.yml" --host 127.0.0.1 --port 3080
```

**拆分方式（只启用部分层）**：

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

### 三、用户级 junction（DSH Loader 解析依赖需要）

DSH Loader 从 `C:\Users\Dustin\.dsh\profiles\node_modules\@deepseek-ai\` 解析裸模块。`pnpm install` 通常自动创建这些 junction；如缺失需手动补：

```cmd
mklink /J "C:\Users\Dustin\.dsh\profiles\node_modules\@deepseek-ai\dsh-memory-auto-recall" "D:\聚合工具\DSH\packages\memory\memory-auto-recall"
mklink /J "C:\Users\Dustin\.dsh\profiles\node_modules\@deepseek-ai\dsh-memory-auto-capture" "D:\聚合工具\DSH\packages\memory\memory-auto-capture"
mklink /J "C:\Users\Dustin\.dsh\profiles\node_modules\@deepseek-ai\dsh-openviking-mcp" "D:\聚合工具\DSH\packages\memory\openviking-mcp"
mklink /J "C:\Users\Dustin\.dsh\profiles\node_modules\@deepseek-ai\dsh-session-persistence-viking" "D:\聚合工具\DSH\packages\session\session-persistence-viking"
mklink /J "C:\Users\Dustin\.dsh\profiles\node_modules\@deepseek-ai\dsh-add-resource" "D:\聚合工具\DSH\packages\memory\add-resource"
mklink /J "C:\Users\Dustin\.dsh\profiles\node_modules\@deepseek-ai\dsh-session-search-viking" "D:\聚合工具\DSH\packages\session\session-search-viking"
```

### 四、手动验证（可选）

```sh
# 验证 6 个 sibling 包全部注册
pnpm dsh --profile headless --patch "$PWD/cordis.yml" --dump-config
# 应看到：memory-openviking / memory-auto-recall / memory-auto-capture / session-persistence-viking / add-resource / session-search-viking

# 真 LLM 冒烟
pnpm dsh --profile headless --patch "$PWD/cordis.yml" "我叫张小明，今年30岁"
```

### 五、SAG 集成说明

`ui-modifications/start-dsh-edge.ps1` 引用了两个 SAG 对接 patch（`sag.cordis.yml`、`sag-multi-source.cordis.yml`）。SAG 是另一个独立系统集成。如果您的环境**没有** SAG，请删掉 `start-dsh-edge.ps1` 里对应的两行 `--patch`，或改用 `cordis.yml` 单一 overlay 方式启动（不含 SAG）。

### 常见问题

| 问题 | 原因 | 解决 |
|---|---|---|
| `pnpm install` 报 `Cannot find package '@deepseek-ai/dsh-memory-auto-*'` | 用户级 junction 缺失 | 见上面第三节 mklink 命令 |
| `mcp__openviking__*` 工具不出现 | OV 未启 / `OPENVIKING_API_KEY` 未设 | 启动 OV + 设置环境变量 |
| OV `find` / `recall` 返回空 | Ollama embedding 模型缺失 | `ollama pull nomic-embed-text` |
| `bash` 找不到 | Windows 无 WSL / Git Bash | 用 Git Bash 或手动按 `restore.sh` 步骤执行 |

---

## English

### What this is

DSH ↔ OpenViking bridge plugin — restores the full integration into any DSH checkout in one command. It ships the six sibling DSH packages (v0 MCP tools, v1 auto-recall/capture, v2 session mirror, add-resource tools, session-search indexer) plus a single-overlay `cordis.yml`.

**OpenViking itself is NOT included** — it is a separate Python service deployed independently.

### Prerequisites

- DSH `dsh web ≥ 0.1.0-rc.6`
- OpenViking running at `http://127.0.0.1:1933`
- Ollama running with an embedding model (e.g. `nomic-embed-text`)
- `OPENVIKING_API_KEY` env var (default dev key: `ov-dev-local-DO-NOT-USE-IN-PROD`)

### Restore on a fresh DSH checkout (after upgrade / reinstall)

```sh
git clone https://github.com/hxy378178690/dsh-openviking-bridge.git
cd dsh-openviking-bridge
bash restore.sh /path/to/DSH
```

`restore.sh` is idempotent. It copies the six sibling packages, patches DSH manifests (preserving any DSH-added entries), copies split cordis.yml overlays, copies agent notes and UI files, then runs `pnpm install`.

### Activate

```sh
cd /path/to/DSH
export OPENVIKING_API_KEY='ov-dev-local-DO-NOT-USE-IN-PROD'
pnpm dsh web --patch "$(git rev-parse --show-toplevel)/cordis.yml" --host 127.0.0.1 --port 3080
```

### Verify

```sh
pnpm dsh --profile headless --patch "$PWD/cordis.yml" --dump-config
```

Should show: `memory-openviking / memory-auto-recall / memory-auto-capture / session-persistence-viking / add-resource / session-search-viking`.

### SAG note

`ui-modifications/start-dsh-edge.ps1` references two SAG integration patches (`sag.cordis.yml`, `sag-multi-source.cordis.yml`). If your environment has no SAG, remove those two `--patch` lines from the script or use the single-overlay `cordis.yml` startup instead.

---

## Repository layout

| Path | Contents |
|---|---|
| `cordis.yml` | Single-overlay plugin entry (activates all 6 layers in one patch) |
| `package.json` | `dsh.plugin` manifest + workspace deps |
| `restore.sh` | Idempotent restore script (bash + python3 for safe JSON patching) |
| `pnpm-workspace.yaml` | Workspace definition so `workspace:*` deps resolve after clone |
| `packages/memory/{openviking-mcp, memory-auto-recall, memory-auto-capture, add-resource}/` | Four memory-side packages (full source) |
| `packages/session/{session-persistence-viking, session-search-viking}/` | Two session-side packages (full source) |
| `examples/memory-viking/*.cordis.yml` | 5 split cordis.yml overlays (alternative activation) |
| `examples/mcp-memory/openviking.cordis.yml` | v0 MCP bridge overlay |
| `dsh-modifications/` | Reference copies of DSH files that must be patched (README rows, devDeps, tsconfig refs) |
| `ui-modifications/` | `start-dsh-edge.ps1` + `config.json` for `UI/dsh-desktop/` |

## Known Limitations and Deferred Work

- Test coverage: 21 unit tests for `openviking-mcp` (100% line coverage); the other five packages have zero committed specs. The `awesome-dsh-plugin` registry gate requires 100% per-file coverage.
- `session-search-viking` fires on `session/end-seed` (session lifecycle end). Long-running sessions get one end-of-life index, not per-turn updates.
- `restore.sh` uses `python3` for JSON patching. On machines without Python, follow the manual instructions in the script.
