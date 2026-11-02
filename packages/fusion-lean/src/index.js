/**
 * DSH bundle entry: the Fusion MCP facade.
 *
 * Responsibilities are split by module:
 *   codec.js      transport encoding in both directions
 *   connection.js lazy dial, redial, live/snapshot tool table, status report
 *   tools.js      the model-visible surface (four upstream tools + help + status)
 *   guard.js      the one-shot gate on irreversible or billable calls
 */

import { readFileSync } from 'node:fs'

import z from '@deepseek-ai/schemastery'

import { createConnection, schemaDigest } from './connection.js'
import { registerConfigRoute } from './config-route.js'
import { DEFAULT_ENDPOINT, readConfig, resolveEndpoint } from './endpoint.js'
import { registerGuard } from './guard.js'
import {
  buildDoctorTool,
  buildHelpTool,
  buildStatusTool,
  normalizeSnapshot,
  registerUpstreamTools,
} from './tools.js'

export const name = 'dsh-fusion-lean'
export const inject = ['tools']

/**
 * Deployment-varying tunables, editable from the harness' own settings form
 * instead of only from `cordis.patch.yml`.
 *
 * Every field is `.volatile()`: the settings surface renders only volatile
 * fields, and a plain field leaves the row's form empty. `url`, when set, wins
 * over host/port/path.
 */
export const Config = z.object({
  host: z.string().default('127.0.0.1').volatile(),
  port: z.number().step(1).min(1).max(65535).default(27182).volatile(),
  path: z.string().default('/mcp').volatile(),
  url: z.string().volatile(),
  toolCallTimeoutMs: z.number().step(1).min(1).default(120000).volatile(),
})

const DEFAULT_CONFIG = { ...DEFAULT_ENDPOINT, toolCallTimeoutMs: 120000 }

export { resolveEndpoint }

const SNAPSHOT_URL = new URL('../assets/fusion-tools.json', import.meta.url)
const ADAPTER_PACKAGE = '@deepseek-ai/dsh-mcp-client'

function loadSnapshot() {
  return normalizeSnapshot(JSON.parse(readFileSync(SNAPSHOT_URL, 'utf8')))
}

async function loadAdapter() {
  const module = await import(ADAPTER_PACKAGE)
  if (typeof module.createMcpToolDefinition !== 'function') {
    throw new Error(`${ADAPTER_PACKAGE} does not export createMcpToolDefinition`)
  }
  return module
}

export async function apply(ctx, rowConfig) {
  const config = readConfig({ ...DEFAULT_CONFIG, ...(rowConfig ?? {}) })
  const endpoint = resolveEndpoint(config)
  const runtime = { url: endpoint, toolCallTimeoutMs: config.toolCallTimeoutMs ?? DEFAULT_CONFIG.toolCallTimeoutMs }
  const snapshot = loadSnapshot()
  const digests = new Map(snapshot.tools.map((tool) => [tool.name, schemaDigest(tool.inputSchema)]))
  const drift = { checked: false, changed: [], missing: [] }

  const connection = createConnection(runtime, {
    snapshotTool: (rawName) => snapshot.tools.find((tool) => tool.name === rawName),
    onLive: (live) => {
      drift.checked = true
      drift.changed = []
      drift.missing = []
      for (const [rawName, digest] of digests) {
        const liveTool = live.get(rawName)
        if (liveTool === undefined) {
          drift.missing.push(rawName)
          continue
        }
        if (schemaDigest(liveTool.inputSchema) !== digest) drift.changed.push(rawName)
      }
      if (drift.changed.length > 0) {
        ctx.logger?.warn?.(
          `fusion-lean: upstream schema changed for ${drift.changed.join(', ')}; run scripts/snapshot.mjs to refresh assets/fusion-tools.json`,
        )
      }
      if (drift.missing.length > 0) {
        ctx.logger?.warn?.(
          `fusion-lean: upstream no longer lists ${drift.missing.join(', ')}; those tools stay registered from the snapshot`,
        )
      }
    },
  })

  let adapter
  try {
    adapter = await loadAdapter()
  } catch (error) {
    const problem = {
      ok: false,
      problem: error instanceof Error ? error.message : String(error),
      adapter: ADAPTER_PACKAGE,
      bundle: 'dsh-fusion-lean',
      hint:
        'The harness no longer offers the MCP adapter this bundle reuses. Reinstall a bundle version ' +
        'that matches the running DSH, or report the adapter signature change.',
    }
    ctx.logger?.error?.(`fusion-lean: ${problem.problem}`)
    const dispose = ctx.tools.register(buildDoctorTool(problem))
    return () => {
      dispose()
      void connection.reset()
    }
  }

  const disposers = registerUpstreamTools(ctx, adapter, connection, snapshot)

  // Filled once the client graph is readable, then served by the settings route:
  // when the row does not appear, this is the difference between "never composed
  // into the browser bundle" and "composed but failed inside the page".
  const graphInfo = { ids: null, error: null }

  // The settings route needs two services the tools do not. Register it in a
  // child context that waits for them, inside a guard: a deployment without a
  // web server must still get every tool.
  const attachSettingsRoute = (child) => {
    try {
      const dispose = registerConfigRoute(child, () => config, graphInfo)
      child.effect(() => dispose, 'fusion-lean: settings route')
      ctx.logger?.info?.('fusion-lean: settings route mounted at /fusion-lean/config')
    } catch (error) {
      ctx.logger?.warn?.(`fusion-lean: settings route unavailable: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  try {
    if (typeof ctx.inject === 'function') ctx.inject(['webServer', 'configEditor'], attachSettingsRoute)
    else ctx.logger?.warn?.('fusion-lean: this host has no ctx.inject; the settings route is skipped')
  } catch (error) {
    ctx.logger?.warn?.(`fusion-lean: cannot request webServer/configEditor: ${error instanceof Error ? error.message : String(error)}`)
  }

  // One line of proof that the browser half reached the client graph: when the
  // settings row is missing, this is the difference between "never composed" and
  // "composed but failed in the page".
  try {
    ctx.inject(['clientModules'], (child) => {
      try {
        const graph = child.clientModules.graph()
        const entries = Array.isArray(graph?.entries) ? graph.entries : []
        graphInfo.ids = entries.map((entry) => entry?.id ?? entry?.name ?? '?')
        graphInfo.batches = Array.isArray(graph?.batches) ? graph.batches.map((batch) => batch?.phase ?? '?') : null
        graphInfo.error = null
        ctx.logger?.info?.(`fusion-lean: client graph entries=${JSON.stringify(graphInfo.ids).slice(0, 700)}`)
      } catch (error) {
        graphInfo.error = error instanceof Error ? error.message : String(error)
        ctx.logger?.warn?.(`fusion-lean: cannot read the client graph: ${graphInfo.error}`)
      }
    })
  } catch (error) {
    graphInfo.error = error instanceof Error ? error.message : String(error)
    ctx.logger?.warn?.(`fusion-lean: cannot request clientModules: ${graphInfo.error}`)
  }

  disposers.push(ctx.tools.register(buildHelpTool(snapshot)))
  disposers.push(
    ctx.tools.register(
      buildStatusTool(connection, () => ({
        bundledToolCount: snapshot.tools.length,
        snapshotCapturedAt: snapshot.capturedAt,
        snapshotServerInfo: snapshot.serverInfo,
        drift: {
          checked: drift.checked,
          changed: [...drift.changed],
          missing: [...drift.missing],
        },
        gated: ['document.close', 'purchase'],
      })),
    ),
  )
  disposers.push(registerGuard(ctx))

  ctx.logger?.info?.(`fusion-lean: ${disposers.length} registrations against ${endpoint}`)

  return () => {
    for (const dispose of disposers.splice(0).reverse()) {
      try {
        dispose()
      } catch {
        // already unregistered
      }
    }
    void connection.reset()
  }
}
