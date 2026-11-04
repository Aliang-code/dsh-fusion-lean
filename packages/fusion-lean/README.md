# @aliangbaby/dsh-fusion-lean

Fusion 360 for DSH, in one bundle with two rows:

| Row | What it does | Needs |
|---|---|---|
| `fusion-lean` | Bridges the MCP server Fusion ships — `fusion_read`, `fusion_execute`, `fusion_update`, `fusion_electronics_read` — plus `fusion_help`, `fusion_status`, a one-shot gate on irreversible actions and an editable endpoint | Fusion running, **no Python** |
| `fusion-harness` | Bridges the `hf.py` modelling loop — `hf_probe`, `hf_build`, `hf_run`, `hf_flat`, `hf_verify`, `hf_new`, `hf_model`, `hf_stl`, `hf_doc` | `python` 3.10+ and a fusion-harness workspace |

```powershell
dsh plugin add @aliangbaby/dsh-fusion-lean
```

Then open **Settings → General**:

- **Fusion MCP endpoint** — the port (default `27182`); the full URL and the call
  timeout sit behind *Advanced*.
- **Fusion workspace** — the root of your fusion-harness checkout, validated
  against `tools/hf.py`. Use **Browse** or paste a path; leaving it empty keeps the
  MCP tools only.

The always-on tool surface is **11,866 B** against the upstream 40,446 B (−70.7 %),
with every upstream `inputSchema` / `outputSchema` kept byte-for-byte; the long
documentation is fetched on demand through `fusion_help`.

## How the harness row is organised

One product is one folder — model, mesh, deliverables and code together:

```
产品/<产品>/
  模型.f3d      Fusion archive (hf_model)
  外形.stl      mesh for viewers and printers (hf_stl)
  说明.md       regenerated summary: requirement, current numbers, map, evolution (hf_doc)
  交付/         factory set: dxf · drawings · 3d · send (read-only)
  生成物/       disposable output (hf flat / spec / shot)
  代码/         build.py · flat.py · spec.py · expected.json · spec.md · notes.md
```

`hf build` starts from a blank document unless you pass `--reuse`, so two products
never accumulate features in the same design.

## Safety

`fusion_execute` runs arbitrary Python inside your Fusion process with your user
privileges, and `127.0.0.1:27182` has no authentication — any local process can
drive your Fusion. This plugin does not change that; it only asks once before
`document.close` and `purchase`, and refuses `hf_*` writes into
`产品/<产品>/交付/send/`.

Full documentation, release notes and the design record live in the repository:
<https://github.com/Aliang-code/dsh-fusion-lean>.

MIT.
