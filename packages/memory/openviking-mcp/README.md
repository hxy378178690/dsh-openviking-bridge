# @deepseek-ai/dsh-openviking-mcp

Tiny HTTP client for the OpenViking MCP server. Used by the memory Consumers / Providers in this group. Bypasses the DSH ToolRuntime so plugin code does not need to synthesize a `ToolExecution`.

## Known Limitations and Deferred Work

- Uses Node 18+ global `fetch`; if a deployment pins an older Node the consumer should provide a polyfill at the host.
- MCP `initialize` is skipped; the server treats each call as stateless streamable HTTP, which is the OV default.