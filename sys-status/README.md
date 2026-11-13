# 系统状态看板（cache-stats 内置包）

本目录是“系统状态看板”整包，随 cache-stats 插件一起分发：
卡片（MCP 沙箱）+ 指标服务 + 沙箱入口，全部由外部 config.json 驱动，不写死主机/端口。

## 文件

    assets/card.template.html   卡片模板（__METRICS_URL__ / __METRICS_ORIGIN__ / __GRID_COLS__ 占位）
    services/sysmetrics.mjs     指标服务：3s 采样 → 原子写缓存 → HTTPS 端点
    services/sandbox-proxy.mjs  沙箱入口：TLS 反代到网关内部沙箱端口
    scripts/render-card.mjs     用配置渲染 card.html
    config.example.json         配置样例

## 配置

安装时把 config.example.json 复制到 /data/work/sys-status-board/config.json，
按现场填写：

| 字段 | 说明 | 示例 |
| --- | --- | --- |
| host | 对外主机名（证书 SAN 必须覆盖） | wxyg.tail2f3e0d.ts.net |
| metrics.port | 指标端口（受管端口） | 18575 |
| metrics.intervalMs | 采样间隔 | 3000 |
| metrics.cacheDir | 缓存目录 | /data/work/sys-status-board/cache |
| metrics.cert / key | 证书与私钥 | ~/.openclaw/tls/memgraph-cert.pem |
| sandbox.port | 沙箱公开端口（受管） | 18574 |
| sandbox.targetPort | 网关内部沙箱端口（网关端口+1） | 18790 |
| board.size | 看板尺寸 | full |
| board.gridCols | 各核网格列数 | 4 |
| ui.metricsUrl | 卡片取数地址 | https://HOST:18575/metrics.json?v=r6 |

## 安装

1. 渲染卡片：node scripts/render-card.mjs /data/work/sys-status-board/config.json
2. 启动服务（systemd user）：
   - 指标：ExecStart=/usr/bin/node <插件目录>/sys-status/services/sysmetrics.mjs
   - 沙箱：ExecStart=/usr/bin/node <插件目录>/sys-status/services/sandbox-proxy.mjs
   - 两者都加 Environment=SYS_STATUS_CONFIG=/data/work/sys-status-board/config.json
3. 网关配置：openclaw config set mcp.apps.sandboxOrigin https://HOST:18574
4. 挂卡片：用 scripts/install 或手动 board.widget.put，参数见下：

    {
      "sessionKey": "<目标会话>",
      "name": "sys-status",
      "title": "系统监控",
      "content": { "kind": "html", "html": "<card.html 内容>" },
      "heightMode": "auto",
      "placement": { "tabId": "main", "size": "full" },
      "declared": { "netOrigins": ["https://HOST:18575"], "tools": ["agents.list","cron.list","health","sessions.list"] },
      "presentation": "full-bleed"
    }

## 验收

    curl -s https://HOST:18575/metrics.json | head -c 120
    curl -s -o /dev/null -w '%{http_code} %{ssl_verify_result}\n' https://HOST:18574/mcp-app-sandbox
    openclaw config get mcp.apps.sandboxOrigin

期望：JSON 可读、200 且 verify=0、配置为新源。

## 注意

- 端口必须在受管清单内；18574/18575 为看板专用。
- sandboxOrigin 必须与控制台源不同（schema 强制）。
- 证书轮换后重启两个服务。
- 不要直写 board_widgets 表，统一走 board.widget.put。
