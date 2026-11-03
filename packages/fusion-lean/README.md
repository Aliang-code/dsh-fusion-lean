# @aliangbaby/dsh-fusion-lean

Fusion 360 for DSH, in one bundle with two rows:

| Row | What it does | Needs |
|---|---|---|
| `fusion-lean` | Bridges the MCP server Fusion ships (`fusion_read` / `fusion_execute` / `fusion_update` / `fusion_electronics_read`), plus `fusion_help`, `fusion_status`, a one-shot gate on irreversible actions and an editable endpoint | Fusion running, **no Python** |
| `fusion-harness` | Bridges the `hf.py` modelling loop (`hf_probe` / `hf_build` / `hf_run` / `hf_flat` / `hf_verify` / `hf_new`) | `python` 3.10+ and a fusion-harness workspace |

Install:

```powershell
dsh plugin add @aliangbaby/dsh-fusion-lean
```

Then open **Settings → General**:

- **Fusion MCP endpoint** — the port (default `27182`); the full URL and the call
  timeout sit behind *Advanced*.
- **Fusion workspace** — the root of your fusion-harness checkout. Use **Browse**
  or paste a path; leaving it empty keeps the MCP tools only.

The always-on tool surface is **11,866 B** against the upstream 40,446 B (-70.7 %),
with every upstream `inputSchema` / `outputSchema` kept byte-for-byte; the long
documentation is fetched on demand through `fusion_help`.

## Safety

`fusion_execute` runs arbitrary Python inside your Fusion process with your user
privileges, and `127.0.0.1:27182` has no authentication — any local process can
drive your Fusion. This plugin does not change that; it only asks once before
`document.close` and `purchase`, and refuses `hf_*` writes into
`deliveries/*/send/`.

Full documentation, design notes and the OpenSpec change live in the repository:
<https://github.com/Aliang-code/dsh-fusion-lean>.

MIT.
