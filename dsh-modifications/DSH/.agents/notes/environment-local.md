# 本机环境事实（agent 直接读取，不进 RFC）

本文件记录这台机器上**与 DSH/OpenViking 融合相关、不能从代码推断的硬事实**。
不要写进 `.agents/notes/<topic>.md`（那是 RFC/ADR），也不要写进 `docs/`。
agent 在落地涉及本地依赖的能力之前，应来这里核对一次。

## 1. Ollama（本机常驻）

- **形态**：桌面服务，独立安装，**不是源码项目**，因此**不在 `D:\聚合工具\` 里**。
- **端口**：`11434`，提供 OpenAI 兼容 API（`/v1`）。
- **启停**：任务栏 Ollama 图标，或 `Start-Process 'C:\Users\Dustin\AppData\Local\Programs\Ollama\ollama.exe'`。
- **配套脚本**：`D:\聚合工具\启动 Ollama.bat`、`D:\聚合工具\停止 Ollama.bat`、`D:\聚合工具\启动 Ollama.ps1`、`D:\聚合工具\停止 Ollama.ps1`。
- **当前已用模型**：`nomic-embed-text`（embedding，768d，OpenViking `ov.conf` 已在用）。
- **计划补的模型**：`qwen2.5:7b` 或 `llama3.1:8b`（~5GB，本地 VLM 候选，给 OpenViking L0/L1 摘要用）。
- **冷启动**：模型从磁盘加载到显存需要 ~15 秒，重试一次即快。

## 2. 与方案 A / 方案的约束关系

- 方案 A（`packages/memory/memory-viking-client`）调 OpenViking 之前，**应主动检测** `127.0.0.1:11434` 健康。
- 方案 A 的 `memory-auto-capture` Consumer 用 `ctx.llm.stream()` 出摘要时，**首选本机 Ollama** 作为 fallback（当 `DEEPSEEK_API_KEY` 不可用时），避免 e2e 因为缺 key 全跳过。
- 方案 C（`session-persistence-viking`）的向量索引**复用**本机 Ollama embedding，不另起一套。
- `ov.conf` 的 `embedding.api_base: http://localhost:11434/v1` **必须保持**，OpenViking 不能改成调用 DSH 侧的 embedding，避免循环依赖。