# Changelog

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
