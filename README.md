# fusion-mcp-plugin

把 DSH 接进 Fusion 建模的两个包：**A 层瘦身连接器** 与 **B 层 hf 工具**。

动机、设计与验收口径在 `openspec/changes/add-fusion-mcp-plugin/`（proposal / specs / design / tasks）。

## 两个包

| 包 | 作用 | 依赖 |
|---|---|---|
| `packages/fusion-lean` | 通过 Fusion 自带的 MCP 服务（`127.0.0.1:27182`）暴露 `fusion_read` / `fusion_execute` / `fusion_update` / `fusion_electronics_read`，加 `fusion_help` 与 `fusion_status` | **无** Python 依赖 |
| `packages/harness-tools` | 把 `fusion-harness` 的 `hf.py` 包成 `hf_probe` / `hf_build` / `hf_run` / `hf_flat` / `hf_verify` / `hf_new` | 需要本机 `python`（3.10+）与 `harnessRoot` 配置 |

## 前置条件

1. 已安装 Fusion，并在 Fusion 内启用其 MCP 服务；服务监听 `127.0.0.1:27182`。
2. DSH 0.2.0-rc.2 或更新。
3. （仅 B 层）本机有可用的 Python；`hf.py` 与工作区在 `harnessRoot` 指向的目录。

Fusion 未运行时 **A 层的工具仍然存在**，调用会给出明确错误；启动 Fusion 后直接重试即可，不需要重载插件。

## 安装

```powershell
# 从 tarball（本仓库产物）
dsh plugin add D:\path\to\local-dsh-fusion-lean-0.1.0.tgz

# 或从包名（发布后）
dsh plugin add @<scope>/dsh-fusion-lean
```

GUI：侧栏「插件」→「添加插件」→ 填包名或 tarball 路径。

B 层需要在 `cordis.patch.yml` 里给出 `harnessRoot`（安装时由 bundle 自带默认值，按需改）：

```yaml
- id: fusion-harness
  name: '@local/dsh-fusion-harness-tools'
  config:
    harnessRoot: D:\Users\Aliang\Desktop\装修\接单\fusion-harness
    python: python          # 或 ["py", "-3"]
    timeoutMs: 300000
```

## 配置端点（A 层）

端口、主机、路径都做成了插件配置，可通过插件设置页或 `cordis.patch.yml` 修改：

```yaml
- id: fusion-lean
  name: '@local/dsh-fusion-lean'
  config:
    host: 127.0.0.1      # 默认
    port: 27182          # 默认，改这里即可换端口
    path: /mcp           # 默认
    url: ''              # 非空时覆盖 host/port/path（远端/隧道场景）
    toolCallTimeoutMs: 120000
```

`url` 优先级最高；`host`/`port`/`path` 用来拼 `http://host:port/path`。改完不需要重写代码，也不需要重启 —— 配置变更按 Loader 的正常路径重新激活该行。

## 安全边界（安装前请读完）

- **`fusion_execute` 能在你的 Fusion 进程里运行任意 Python**，拥有你的用户权限：可以删改模型、读写本机文件、发网络请求。它不在 DSH 的文件/命令沙箱内。
- **`127.0.0.1:27182` 没有鉴权**，本机任何进程都能直连并驱动你的 Fusion；本插件不改变这一点。
- 因此本插件只做两件收窄：`document.close` 与 `purchase` 在分发前需要**一次人工确认**（无应答者时按拒绝关闭）；`hf_*` 工具拒绝任何可能写入 `deliveries/*/send/` 的调用（路径穿越在启动子进程之前就被拒）。

## 可复核的数字

```powershell
node packages/fusion-lean/scripts/measure.mjs   # 常驻前缀体积，超 16 KB 退出码非 0
node packages/fusion-lean/scripts/probe.mjs     # 端点连通性（可达 0 / 不可达 2）
node packages/fusion-lean/scripts/snapshot.mjs  # 重抓能力契约快照
```

当前结果（Fusion 2705.1.30 / MCP Server Adapter 1.0.0）：

```
upstream surface (as a plain MCP client would register it)   40,446 B
lean surface (this bundle)                                   11,875 B
saved 28,571 B per request (70.6% smaller; 3.41x)
budget 16384 B; using 11875 B (72.5%)
```

上游四个工具的 `inputSchema` / `outputSchema` 逐字节保留，只有描述被压缩；完整上游说明由 `fusion_help` 按需返回（`fusion_help({tool:"fusion_execute"})` 约 18.5 KB 原文）。

## 编码

Fusion 的 MCP 传输会把 UTF-8 当 latin-1 重新解码。两个方向都处理了：

- 连接器把 `fusion_execute` 的 `object.script`（Python 源码）转成 `\uXXXX` 再发送，回传文本在严格可逆时还原；`DSH_FUSION_NO_TRANSCODE=1` 可关闭还原方向用于排障。
- `hf.py` 的载荷同样 `backslashreplace`；`--json` 结果用 `ensure_ascii=True` 输出，并在宿主侧以 `spawn`（无 shell）+ `PYTHONUTF8=1` 调用，所以中文零件名、文档名、诊断文本在整条链路上不变形。

## 测试

```powershell
node packages/fusion-lean/scripts/codec.test.mjs
node packages/fusion-lean/scripts/guard.test.mjs
node packages/harness-tools/scripts/tools.test.mjs .\..\..\fusion-harness
```

## 回滚

迁移前的 profile 备份：`%USERPROFILE%\.dsh\profiles\<profile>\*.bak-migrate-*`。回滚 = 恢复这三份文件 → 卸载新 bundle → 装回原包 → 重启宿主。
