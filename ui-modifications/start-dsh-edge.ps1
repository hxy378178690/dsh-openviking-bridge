# DSH Edge App Launcher + Aggregator
# - 启动 DSH web (3080) + OpenViking (1933) + SAG (8088+8089) + 聚合服务器 (4100)
# - Ollama 默认关，由聚合页 UI 上的开关启动 (11434)
# - Edge --app 打开聚合页 http://localhost:4100
# - SAG 必须在 DSH 之前起：DSH 的 knowledge-sag 插件在启动时快照 $env:SAG_JWT
#   作为 Bearer 头，SAG 未起则取不到 JWT，DSH 整个会话内 tools/list 永久 401。
# - OV 同理：$env:OPENVIKING_API_KEY 也要在 DSH 启动前设好。

$ErrorActionPreference = 'Continue'
$ROOT       = 'D:\聚合工具\UI\dsh-desktop'
$DSH_DIR    = 'D:\聚合工具\DSH'
$PORT_DSH   = 3080
$PORT_OV    = 1933
$PORT_SAG_A = 8088
$PORT_SAG_W = 8089
$PORT_AGG   = 4100
$PORT_OLL   = 11434
$AGG_URL    = "http://localhost:$PORT_AGG"
$EDGE_EXE   = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'

function Test-Port($port) {
  try {
    $c = [System.Net.Sockets.TcpClient]::new()
    $i = $c.BeginConnect('127.0.0.1', $port, $null, $null)
    $ok = $i.AsyncWaitHandle.WaitOne(300, $false)
    if ($ok) { $c.EndConnect($i) }
    $c.Close()
    return $ok
  } catch { return $false }
}

function Wait-Port($port, $timeoutSec = 60) {
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  while ((Get-Date) -lt $deadline) {
    if (Test-Port $port) { return $true }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

if (-not (Test-Path $EDGE_EXE)) { Write-Host "Edge 未找到: $EDGE_EXE"; pause; exit 1 }

# 1. SAG API（必须先起，DSH 启动时要拿 JWT）
if (Test-Port $PORT_SAG_A) {
  Write-Host "[SAG.api] :$PORT_SAG_A 已运行，跳过"
} else {
  $sagApiExe = "D:\聚合工具\zleap-sag\apps\api\.venv\Scripts\python.exe"
  if (Test-Path $sagApiExe) {
    Write-Host "[SAG.api] 启动 ..."
    Start-Process -FilePath $sagApiExe -ArgumentList @('-m', 'uvicorn', 'sag_api.main:app', '--host', '127.0.0.1', '--port', "$PORT_SAG_A") `
      -WorkingDirectory 'D:\聚合工具\zleap-sag\apps\api' -WindowStyle Hidden `
      -RedirectStandardOutput "$ROOT\logs\sag_api.out" `
      -RedirectStandardError "$ROOT\logs\sag_api.err" -PassThru | Out-Null
    if (-not (Wait-Port $PORT_SAG_A 30)) { Write-Host "[SAG.api] 30s 内未起" -ForegroundColor Yellow }
  } else { Write-Host "[SAG.api] venv 未找到，跳过（手动启动）" -ForegroundColor Yellow }
}

# 2. SAG Web（Next.js，给前端 UI 用；不影响 DSH 工具）
if (Test-Port $PORT_SAG_W) {
  Write-Host "[SAG.web] :$PORT_SAG_W 已运行，跳过"
} else {
  $nextBin = "D:\聚合工具\zleap-sag\apps\web\node_modules\next\dist\bin\next"
  if (Test-Path $nextBin) {
    Write-Host "[SAG.web] 启动 ..."
    $env:NEXT_PUBLIC_API_BASE = "http://localhost:$PORT_SAG_A"
    Start-Process -FilePath 'node.exe' -ArgumentList @($nextBin, 'dev', '-p', "$PORT_SAG_W", '-H', '127.0.0.1') `
      -WorkingDirectory 'D:\聚合工具\zleap-sag\apps\web' -WindowStyle Hidden `
      -RedirectStandardOutput "$ROOT\logs\sag_web.out" `
      -RedirectStandardError "$ROOT\logs\sag_web.err" -PassThru | Out-Null
    if (-not (Wait-Port $PORT_SAG_W 60)) { Write-Host "[SAG.web] 60s 内未起" -ForegroundColor Yellow }
  } else { Write-Host "[SAG.web] next bin 未找到，跳过" -ForegroundColor Yellow }
}

# 3. 拉 SAG JWT（DSH 启动前快照到 env，供 knowledge-sag 插件 Bearer 用）
#    SAG 未起时降级跳过：DSH 启动后插件 failOnStartupError:false，不阻塞主进程
if (-not $env:SAG_JWT) {
  try {
    if (Wait-Port $PORT_SAG_A 5) {
      $env:SAG_JWT = (Invoke-RestMethod -Uri "http://127.0.0.1:$PORT_SAG_A/api/v1/auth/login" `
        -Method Post -ContentType "application/json" `
        -Body '{"name":"dsh-bridge"}' -TimeoutSec 5).access_token
      Write-Host "[SAG.jwt] 取得 ($($env:SAG_JWT.Length) chars, 7 天 TTL)"
    } else { Write-Host "[SAG.jwt] SAG 未响应，DSH 启动时 knowledge-sag 插件会 401 降级" -ForegroundColor Yellow }
  } catch {
    Write-Host "[SAG.jwt] 登录失败（$($_.Exception.Message)），DSH 启动时 knowledge-sag 插件会 401 降级" -ForegroundColor Yellow
  }
} else { Write-Host "[SAG.jwt] 已存在 ($($env:SAG_JWT.Length) chars)" }

# 4. OpenViking（如未运行，spawn openviking-server）
if (Test-Port $PORT_OV) {
  Write-Host "[OV] :$PORT_OV 已运行，跳过"
} else {
  $ovExe = "$env:APPDATA\Python\Python313\Scripts\openviking-server.exe"
  if (Test-Path $ovExe) {
    Write-Host "[OV] 启动 ..."
    Start-Process -FilePath $ovExe -ArgumentList @('--config', 'D:\OpenViking\ov.conf') `
      -WindowStyle Hidden -RedirectStandardOutput "$ROOT\logs\ov.out" `
      -RedirectStandardError "$ROOT\logs\ov.err" -PassThru | Out-Null
    if (-not (Wait-Port $PORT_OV 30)) { Write-Host "[OV] 30s 内未起（可手动启动 OpenViking）" -ForegroundColor Yellow }
  } else { Write-Host "[OV] openviking-server.exe 未找到，跳过（手动启动）" -ForegroundColor Yellow }
}

# 5. OV API key（如本地 OV 跑默认 token，写死供 openviking-mcp 插件用）
if (-not $env:OPENVIKING_API_KEY) {
  $env:OPENVIKING_API_KEY = 'ov-dev-local-DO-NOT-USE-IN-PROD'
  Write-Host "[OV.key] 默认 token 已设（本地 dev 环境）"
}

# 6. DSH（必须在 SAG_JWT / OV_API_KEY 设好之后启）
if (Test-Port $PORT_DSH) {
  Write-Host "[DSH] :$PORT_DSH 已运行，跳过"
  Write-Host "[DSH.warn] 已运行的 DSH 进程的 env 是在它启动时固化的，新设的 JWT 不生效；如需生效请 kill 重启" -ForegroundColor Yellow
} else {
  Write-Host "[DSH] 启动 ..."
  Start-Process -FilePath "$env:APPDATA\npm\pnpm.cmd" `
    -ArgumentList @('dsh', '--profile', 'web',
      '--patch', "$DSH_DIR/examples/mcp-memory/openviking.cordis.yml",
      '--patch', "$DSH_DIR/examples/mcp-memory/sag.cordis.yml",
      '--patch', "$DSH_DIR/examples/mcp-memory/sag-multi-source.cordis.yml",
      '--patch', "$DSH_DIR/examples/memory-viking/auto-recall.cordis.yml",
      '--patch', "$DSH_DIR/examples/memory-viking/auto-capture.cordis.yml",
      '--patch', "$DSH_DIR/examples/memory-viking/persistence-mirror.cordis.yml",
'--patch', "$DSH_DIR/examples/memory-viking/add-resource.cordis.yml",
'--patch', "$DSH_DIR/examples/memory-viking/session-search.cordis.yml",
      '--host', '127.0.0.1', '--port', "$PORT_DSH") `
    -WorkingDirectory $DSH_DIR -WindowStyle Normal -PassThru | Out-Null
  if (-not (Wait-Port $PORT_DSH 60)) { Write-Host "[DSH] 60s 内未起"; pause; exit 1 }
}

# 7. 聚合服务器（Node 单进程托管 OV/SAG 启停 API + 聚合页）
if (Test-Port $PORT_AGG) {
  Write-Host "[AGG] :$PORT_AGG 已运行，跳过"
} else {
  Write-Host "[AGG] 启动 ..."
  Start-Process -FilePath 'node.exe' -ArgumentList (Join-Path $ROOT 'server.mjs') `
    -WorkingDirectory $ROOT -WindowStyle Hidden `
    -RedirectStandardOutput "$ROOT\logs\aggregator.out" `
    -RedirectStandardError "$ROOT\logs\aggregator.err" -PassThru | Out-Null
  if (-not (Wait-Port $PORT_AGG 15)) { Write-Host "[AGG] 15s 内未起，看 logs\aggregator.err"; pause; exit 1 }
}

# 8. Ollama 不默认起（聚合页里有开关）
Write-Host "[OLLAMA] :$PORT_OLL 默认关，在聚合页右上角开关启动"

# 9. Edge --app 打开聚合页
Write-Host ""
Write-Host "============================================================"
Write-Host "  聚合UI : $AGG_URL"
Write-Host "  入口   : $ROOT\start-dsh-edge.bat"
Write-Host "  日志   : $ROOT\logs\"
Write-Host "  DSH 工具：mcp__openviking__* (16) + mcp__sag__* (8)"
Write-Host "============================================================"
Write-Host ""
Write-Host "DSH web : http://localhost:$PORT_DSH"
Write-Host "Opening Edge --app=$AGG_URL"
Start-Process -FilePath $EDGE_EXE -ArgumentList @('--app=' + $AGG_URL, '--new-window')
Write-Host "Done. 关闭 Edge 窗口不会停服务；要真正退出请用 停止.bat（聚合 UI 右上角也可一键停）"
