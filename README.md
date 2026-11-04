# dsh-fusion-lean

把 DSH 接进 Fusion 建模：**一个 bundle，两行**。

| 行 | 作用 | 前置条件 |
|---|---|---|
| `fusion-lean` | 接 Fusion 自带的 MCP 服务：`fusion_read` / `fusion_execute` / `fusion_update` / `fusion_electronics_read`，加 `fusion_help`、`fusion_status`、不可逆动作门禁、可编辑端点 | Fusion 在跑，**无 Python 依赖** |
| `fusion-harness` | 把 `fusion-harness` 的 `hf.py` 包成 `hf_probe` / `hf_build` / `hf_run` / `hf_flat` / `hf_verify` / `hf_new` / `hf_model` / `hf_stl` / `hf_doc` | 本机 `python`（3.10+）+ `harnessRoot` 配置 |

两行在同一个包里，安装一次、插件列表只出现一个条目；**停用其中一行，另一行照常工作**。`fusion-harness` 没有配置 `harnessRoot` 时只记一条警告并跳过注册，不会拖垮 `fusion-lean`。

动机、设计与验收口径在 `openspec/changes/add-fusion-mcp-plugin/`（proposal / specs / design / tasks）。

## 前置条件

1. 已安装 Fusion，并在 Fusion 内启用其 MCP 服务；服务监听 `127.0.0.1:27182`。
2. DSH 0.2.0-rc.2 或更新。
3. （仅 `fusion-harness` 行）本机有可用的 Python；`hf.py` 与工作区在 `harnessRoot` 指向的目录。

Fusion 未运行时 **`fusion-*` 工具仍然存在**，调用会给出明确错误；启动 Fusion 后直接重试即可，不需要重载插件。

## 安装

```powershell
dsh plugin add D:\path\to\local-dsh-fusion-lean-0.3.0.tgz   # tarball
dsh plugin add @<scope>/dsh-fusion-lean                      # 发布后
```

GUI：侧栏「插件」→「添加插件」→ 填包名或 tarball 路径。

`harnessRoot` 是**本机路径**，所以随包发布的 patch 里它是空的，由 profile 的 patch 做 id 覆盖：

```yaml
- id: fusion-harness
  name: '@aliangbaby/dsh-fusion-lean/harness'
  config:
    harnessRoot: D:\work\fusion-harness
    python: python          # 或 ["py", "-3"]
    timeoutMs: 300000
```

## 配置端点

端点默认 `http://127.0.0.1:27182/mcp`，改端口有两条路：

1. **设置页**：左下角齿轮 → 通用设置 → 最下面一行「Fusion MCP 端点」。只需要填**端口**，`完整 URL` 与 `超时` 在「▸ 高级设置」里。保存即写回 profile（需要重启 DSH 生效）。
2. **直接编辑** `cordis.patch.yml` 里 `fusion-lean` 行的 `config`：

```yaml
- id: fusion-lean
  name: '@aliangbaby/dsh-fusion-lean'
  config:
    host: 127.0.0.1      # 默认
    port: 27182          # 默认，改这里即可换端口
    path: /mcp           # 默认
    url: ''              # 非空时覆盖 host/port/path（远端/隧道场景）
    toolCallTimeoutMs: 120000
```

设置页的表单由本包的 client 半区渲染——DSH 不会按 schema 自动生成表单（`dsh-settings`：`autoGenerate`「目前没有已发布的客户端这样做」）。

## 配置工作区（`fusion-harness` 行）

`hf_*` 工具需要一个 fusion-harness 工作区。**别人装完之后在设置页填一行就能用**，不用手改 YAML：

设置 → 通用设置 → 「Fusion 工作区」→ 填根目录 → 保存。保存时会校验该目录下确实有 `tools/hf.py`，否则拒绝并说明原因；留空表示只启用 MCP 工具面（`hf_*` 不注册，其余照常）。

它写入的是 profile patch 里按行 id 的覆盖：

```yaml
- id: fusion-harness
  name: '@aliangbaby/dsh-fusion-lean/harness'
  config:
    harnessRoot: D:\work\fusion-harness
```

> 注意：`packages/fusion-lean/package.json` 的 `exports` 必须保留 `"./package.json": "./package.json"`。缺这一行时 client 扫描器读不到清单，会**静默**把插件当成"不是 client 包"（表现为设置行永远不出现、日志无任何报错）。

## 安全边界（安装前请读完）

- **`fusion_execute` 能在你的 Fusion 进程里运行任意 Python**，拥有你的用户权限：可以删改模型、读写本机文件、发网络请求。它不在 DSH 的文件/命令沙箱内。
- **`127.0.0.1:27182` 没有鉴权**，本机任何进程都能直连并驱动你的 Fusion；本插件不改变这一点。
- 因此本插件只做两件收窄：`document.close` 与 `purchase` 在分发前需要**一次人工确认**（无应答者时按拒绝关闭）；`hf_*` 工具拒绝任何可能写入 `产品/<产品>/交付/send/` 的调用（路径穿越在启动子进程之前就被拒）。

## 可复核的数字

```powershell
node packages/fusion-lean/scripts/measure.mjs   # 常驻前缀体积，超 16 KB 退出码非 0
node packages/fusion-lean/scripts/probe.mjs     # 端点连通性（可达 0 / 不可达 2）
node packages/fusion-lean/scripts/snapshot.mjs  # 重抓能力契约快照
```

当前结果（Fusion 2705.1.30 / MCP Server Adapter 1.0.0）：

```
upstream surface (as a plain MCP client would register it)   40,446 B
lean surface (this bundle)                                   11,866 B
saved 28,580 B per request (70.7% smaller; 3.41x)
budget 16384 B; using 11866 B (72.4%)
```

上游四个工具的 `inputSchema` / `outputSchema` 逐字节保留，只有描述被压缩；完整上游说明由 `fusion_help` 按需返回（`fusion_help({tool:"fusion_execute"})` 约 18.5 KB 原文）。

## 编码

Fusion 的 MCP 传输会把 UTF-8 当 latin-1 重新解码。两个方向都处理了：

- 连接器把 `fusion_execute` 的 `object.script`（Python 源码）转成 `\uXXXX` 再发送，回传文本在严格可逆时还原；`DSH_FUSION_NO_TRANSCODE=1` 可关闭还原方向用于排障。
- `hf.py` 的载荷同样 `backslashreplace`；`--json` 结果用 `ensure_ascii=True` 输出，并在宿主侧以 `spawn`（无 shell）+ `PYTHONUTF8=1` 调用，所以中文零件名、文档名、诊断文本在整条链路上不变形。

## 测试

```powershell
cd packages/fusion-lean
node scripts/codec.test.mjs
node scripts/guard.test.mjs
node scripts/endpoint.test.mjs
node scripts/drift.test.mjs
node scripts/config-route.test.mjs
node scripts/client-module.test.mjs
node scripts/harness.test.mjs ..\..\..\..\fusion-harness
```

## 回滚

迁移前的 profile 备份：`%USERPROFILE%\.dsh\profiles\<profile>\*.bak-migrate-*`。回滚 = 恢复这三份文件 → 卸载新 bundle → 装回原包 → 重启宿主。
