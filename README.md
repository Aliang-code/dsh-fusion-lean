# dsh-fusion-lean

把 **Fusion 360** 接进 DSH：一个 bundle、两行、安装一次，既能把 Fusion 自带的 MCP 工具面接出来，也能把 `hf.py` 的建模流水线包成工具。

- 上游 4 个工具的 schema **逐字节保留**，常驻工具面从 **40,446 B 压到 11,866 B（−70.7%）**，长文档按需用 `fusion_help` 取。
- 端点、工作区都在**设置页**里改，不用手写 YAML。
- 装一次，插件列表只有一个条目；两行可以各自停用。

```
dsh plugin add @aliangbaby/dsh-fusion-lean
```

## 两行分别是什么

| 行 id | 提供 | 前置条件 |
|---|---|---|
| `fusion-lean` | `fusion_read` / `fusion_execute` / `fusion_update` / `fusion_electronics_read`，加 `fusion_help`、`fusion_status`、不可逆动作门禁、可编辑端点 | Fusion 在跑，**不需要 Python** |
| `fusion-harness` | `hf_probe` / `hf_build` / `hf_run` / `hf_flat` / `hf_verify` / `hf_new` / `hf_model` / `hf_stl` / `hf_doc` | 本机 `python` 3.10+ 与一个 fusion-harness 工作区 |

`fusion-harness` 没配 `harnessRoot` 时只记一条警告并跳过注册，不会影响 `fusion-lean`；两行互不牵连。

## 前置条件

1. 已装 Fusion，并在 Fusion 内启用它的 MCP 服务（默认监听 `127.0.0.1:27182`）。
2. DSH `>= 0.2.0-rc.2`。
3. 仅 `fusion-harness` 行：Python 3.10+，以及一个含 `tools/hf.py` 的工作区。

Fusion 没开时 **`fusion-*` 工具仍然在**，调用会给明确错误；把 Fusion 打开后直接重试即可，不必重载插件。

## 装完之后：两个设置行

侧栏齿轮 → 通用设置，最下面两行是本插件加的：

**① Fusion MCP 端点** — 只填端口（默认 `27182`）。`完整 URL` 与 `超时` 收在「▸ 高级设置」里。改完保存，**重启 DSH 生效**。

**② Fusion 工作区** — 填 fusion-harness 的根目录（点「浏览…」可选，或直接粘贴）。保存时校验该目录下确实有 `tools/hf.py`：存在就提示「已找到」，不存在照样保存但给警告。留空 = 只启用 MCP 工具面。

两者写回的都是 profile patch 里按行 id 的覆盖：

```yaml
- id: fusion-lean
  name: '@aliangbaby/dsh-fusion-lean'
  config:
    host: 127.0.0.1
    port: 27182
    path: /mcp
    url: ''               # 非空时覆盖 host/port/path（隧道/远端场景）
    toolCallTimeoutMs: 120000

- id: fusion-harness
  name: '@aliangbaby/dsh-fusion-lean/harness'
  config:
    harnessRoot: D:\work\fusion-harness   # 本机路径，所以随包发布时是空的
    python: python                        # 或 ["py", "-3"]、绝对路径
    timeoutMs: 300000
```

## `hf_*` 工具怎么用

工作区约定是 **一个产品 = 一个文件夹**：

```
产品/<产品>/
  模型.f3d          hf_model 导出的 Fusion 原生文件
  外形.stl          hf_stl 导出的网格
  说明.md           hf_doc 自动汇总（原始诉求 / 现状 / 结构 / 演化）
  交付/             工厂交付：dxf 展开图 · drawings 图纸 · 3d 三维 · send 发货（只读）
  生成物/           中间产物，可删可重建
  代码/             build.py 建模 · flat.py 展开 · spec.py 技术要求 · expected.json 验收基线
```

一条命令的闭环：

```powershell
python tools/hf.py probe                       # 链路通不通、开了哪些文档
python tools/hf.py build rack_shelf_650        # 新建空白文档 → 建模（--reuse 可沿用当前文档）
python tools/hf.py run check --part rack_shelf_650
python tools/hf.py flat  rack_shelf_650        # 展开图 → 产品/<产品>/生成物/
python tools/hf.py spec  rack_shelf_650 --pdf  # 技术要求 A4 PDF
python tools/hf.py verify rack_shelf_650       # 尺寸 + 交付 DXF 逐字节比对
python tools/hf.py model rack_shelf_650        # → 模型.f3d
python tools/hf.py stl   rack_shelf_650        # → 外形.stl
python tools/hf.py doc   rack_shelf_650        # 重写 说明.md
```

`hf_verify` PASS = 展开尺寸对上 `代码/expected.json`，且与 `交付/dxf` **逐字节一致**；`hf_build` / `hf_verify` 成功后会自动刷新 `说明.md`。

## 安全边界（装之前请读完）

- **`fusion_execute` 能在你的 Fusion 进程里跑任意 Python**，用你的用户权限：可删改模型、读写本机文件、发网络请求。它**不在** DSH 的文件/命令沙箱内。
- **`127.0.0.1:27182` 没有鉴权**，本机任何进程都能直连并驱动你的 Fusion；本插件不改变这一点。
- 因此只做两处收窄：`document.close` 与 `purchase` 分发前需**一次人工确认**（无应答者按拒绝处理）；`hf_*` 拒绝任何可能写入 `产品/<产品>/交付/send/` 的调用（路径穿越在**启动子进程之前**就被拒）。

## 可复核的数字

```powershell
node packages/fusion-lean/scripts/measure.mjs   # 常驻工具面体积，超 16 KB 退出码非 0
node packages/fusion-lean/scripts/probe.mjs     # 端点连通性（可达 0 / 不可达 2）
node packages/fusion-lean/scripts/drift.test.mjs # 与上游 schema 快照比对
```

Fusion 2705.1.30 / MCP Server Adapter 1.0.0 上测得：

```
upstream surface (a plain MCP client would register)   40,446 B
lean surface (this bundle)                             11,866 B
saved 28,580 B per request (70.7% smaller; 3.41x)
budget 16,384 B; using 11,866 B (72.4%)
```

四个上游工具的 `inputSchema` / `outputSchema` 逐字节保留，只压缩描述；完整上游说明由 `fusion_help` 按需返回（`fusion_help({tool:"fusion_execute"})` ≈ 23 KB 原文）。

## 中文与编码

Fusion 的 MCP 传输会把 UTF-8 当 latin-1 重新解码，两个方向都做了处理：

- `fusion_execute` 的 `object.script` 出站前转成 `\uXXXX`，回传文本在严格可逆时还原；`DSH_FUSION_NO_TRANSCODE=1` 可关闭还原方向用于排障。
- `hf.py` 的载荷同样 `backslashreplace`，`--json` 结果用 `ensure_ascii=True`；宿主侧以 `spawn`（无 shell）+ `PYTHONUTF8=1` 调用，所以中文产品名、文档名、诊断文本全链路不变形。

## 从源码开发 / 发版

```powershell
git clone https://github.com/Aliang-code/dsh-fusion-lean
cd dsh-fusion-lean
npm install --no-audit --no-fund

cd packages/fusion-lean
node scripts/codec.test.mjs           # 编码往返
node scripts/guard.test.mjs           # 不可逆动作门禁
node scripts/endpoint.test.mjs        # 端点解析
node scripts/drift.test.mjs           # 上游 schema 快照
node scripts/config-route.test.mjs    # 设置页路由
node scripts/client-module.test.mjs   # client 半区与 manifest
node scripts/harness.test.mjs <workspace>   # 工具层（无工作区自动 skip）
node scripts/measure.mjs              # 体积预算
```

发版用 **OIDC 信任发布**，仓库里不存任何 npm 凭据：

```powershell
# 1) 改 packages/fusion-lean/package.json 的 version
# 2) 提交后打 tag
git tag v0.9.1 && git push --tags
```

CI（`.github/workflows/publish.yml`）会跑 7 套测试、校验 tag 与版本一致，然后 `npm publish --provenance` 并附 SLSA provenance。手动触发（Run workflow）只做彩排：构建 tarball，不发包。

## 仓库结构

```
packages/fusion-lean/       ← npm 包 @aliangbaby/dsh-fusion-lean
  src/                      host 半区：连接器、工具、配置路由、harness 桥
  lib/client.js             web 半区：设置页两行
  assets/fusion-tools.json  上游工具契约快照（drift 检测用）
  scripts/                  测试与体积测量
.github/workflows/          ci.yml（测试）、publish.yml（tag 发布）
```

## 常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| `fusion-*` 调用报连接错误 | Fusion 没开或 MCP 服务没启 | 打开 Fusion，确认 `127.0.0.1:27182` 在监听 |
| 设置页没有本插件的行 | 包丢了 `exports["./package.json"]`，client 扫描器静默跳过 | 0.2.1 起已修；自查 `node -e "console.log(require.resolve('@aliangbaby/dsh-fusion-lean/package.json'))"` |
| `No usable Python interpreter` | `python` 不在 PATH | 把 `python` 配置改成 `py -3` 或绝对路径 |
| `hf_probe` 报 `no such product` | 产品名写错 | `ls 产品/` 看实际名字 |
| 两个产品的 `外形.stl` 一样大 | 旧版 `hf build` 往同一个文档叠加 | 0.9.0 起 `hf build` 默认新建空白文档 |

## License

MIT
