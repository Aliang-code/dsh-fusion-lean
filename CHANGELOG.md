# Changelog

## 0.9.5

- `hf_pack` joins the tools: bundles the current `生成物/` into a dated
  `交付/<date>_<label>/` folder plus a `.zip`, so a delivery batch is one command.
- `hf_flat` no longer offers `deliver`: `交付/` now holds only the shipped evidence
  (`send/`), the factory drawings and dated packages. The harness rejects the flag
  and points at `hf_pack`.
- `hf_verify` compares against `交付/send` and ignores DXF timestamps and
  fingerprint GUIDs, so "DRIFTED" means the geometry changed — not that the file
  was regenerated a second later.

## 0.9.4

- `hf_build` now says what it actually does since 0.9.0's harness change: one call closes stale documents,
  builds in a clean one, exports 模型.f3d + 外形.stl, and closes the document again — so Fusion stops
  accumulating windows.
- New `hf_build` options: `keepOpen` (leave the document open, needed before `hf_model` / `hf_stl` / `hf_run`)
  and `noArtifacts` (skip the exports).
- `hf_model` / `hf_stl` descriptions say they re-export from the document that is open right now.

## 0.9.3

- `publish.yml` skips publishing when that exact version is already on the
  registry, so re-pushing a tag (history rewrite, re-run) reports success instead
  of `EPUBLISHCONFLICT`. The registry is the source of truth, not the tag.

## 0.9.2

- Metadata-only release: the repository history was rewritten to fix commit
  authorship, so 0.9.0/0.9.1 attestations point at commit SHAs that no longer
  exist. 0.9.2 is the same code, published from the rewritten history, so the
  provenance chain (tag → commit → tarball) is consistent again.

## 0.9.1

- Tool descriptions follow the product layout: `hf_build` points at
  `产品/<产品>/代码/build.py` and `hf_new` at `templates/product`; both still said
  `parts/` and `templates/part` in 0.9.0.
- README rewritten around the current shape: install from the registry, the two
  settings rows, the nine `hf_*` tools, the product folder layout, the release
  workflow (tag → CI → OIDC), and a troubleshooting table.

## 0.9.0

- Three file-facing tools join the set, so the whole loop is reachable from the
  agent: `hf_model` (export `模型.f3d` from the open design), `hf_stl` (export
  `外形.stl`) and `hf_doc` (rewrite the product `说明.md`).
- Tool descriptions follow the product layout the harness now uses
  (`产品/<产品>/{代码,生成物,交付}`) instead of the old `parts/` + `deliveries/`.
- Publish from CI: `.github/workflows/publish.yml` runs the suites and publishes on
  a `v*` tag through npm Trusted Publishing, with provenance and no stored token.

## 0.8.0

- Rename to `@aliangbaby/dsh-fusion-lean` and prepare for the public registry.
- One bundle, two rows: `fusion-lean` (MCP facade) and `fusion-harness` (hf tools),
  so a single install carries both and either row can be switched off alone.
- Settings page: endpoint row (port, with the full URL and timeout behind
  *Advanced*) and workspace row (directory, with the host's native picker when it
  exists and an in-row folder list otherwise).
- `hf.py --json`: one ASCII-escaped result object per run, so no console code page
  can corrupt Chinese part names or diagnostics.

## 0.7.0

- Settings page can browse the host's directory capability when no native dialog
  is composed.

## 0.6.0

- Ask the host for a native directory dialog first, fall back to the in-row list,
  and surface the real error instead of a generic message.

## 0.5.1

- Declare the workspace client package in `dsh.client.inject`.

## 0.5.0

- Settings rows: one control row per setting, no prose, browse button.

## 0.4.2

- Creating a missing workspace directory is an explicit second step, so a typo
  never creates a folder.

## 0.4.1

- An existing directory is enough to save; a missing `tools/hf.py` is a warning,
  not a gate.

## 0.4.0

- The harness workspace became configurable from the settings page, validated
  against `tools/hf.py`.

## 0.3.0

- Merged the harness package into this bundle (two rows, one install).

## 0.2.1

- Expose `./package.json` so the client-module scanner can read the manifest; the
  settings row had been silently dropped without it.

## 0.2.0

- Row settings page (client half) plus the loopback config route.

## 0.1.5

- Destructive-action gate: only `document.close` and `purchase` ask, once.

## 0.1.4

- DSH packages back to `peerDependencies`; only the MCP SDK is a real dependency.

## 0.1.1

- First working facade: 40,446 B → 11,866 B of always-on tool surface (-70.7%),
  upstream schemas kept byte-for-byte, `fusion_help` on demand, lazy reconnect.
