/**
 * One lazily dialled connection to the Fusion MCP endpoint.
 *
 * The endpoint only exists while Fusion is running, so activation never dials.
 * The first call dials, a failed transport is dropped, and the next call dials
 * again — a Fusion restart therefore needs neither a plugin reload nor a host
 * restart. `live` holds the tool definitions last reported by the server (used
 * for output-schema validation and drift reporting); the bundled snapshot is the
 * fallback when the server cannot be reached at all.
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const PACKAGE = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

async function loadSdk() {
  let sdk
  try {
    sdk = await import('@modelcontextprotocol/client')
  } catch (error) {
    throw new Error(
      `cannot load "@modelcontextprotocol/client" (${error instanceof Error ? error.message : String(error)}); ` +
        'it is declared as a peer dependency and must be installed next to this bundle',
    )
  }
  if (typeof sdk.Client !== 'function' || typeof sdk.StreamableHTTPClientTransport !== 'function') {
    throw new Error('"@modelcontextprotocol/client" does not export Client and StreamableHTTPClientTransport')
  }
  return sdk
}

/** Stable hash of one input schema, for drift comparison against the snapshot. */
export function schemaDigest(schema) {
  return createHash('sha256').update(JSON.stringify(schema ?? null)).digest('hex')
}

function describe(error) {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/\s+/g, ' ').trim()
}

export function createConnection(config, hooks = {}) {
  const state = {
    client: undefined,
    dialling: undefined,
    live: new Map(),
    serverInfo: undefined,
    lastError: undefined,
    calls: 0,
    redials: 0,
  }

  async function dial() {
    const { Client, StreamableHTTPClientTransport } = await loadSdk()
    const transport = new StreamableHTTPClientTransport(new URL(config.url))
    const client = new Client(
      { name: 'dsh-fusion-lean', version: PACKAGE.version },
      { capabilities: {}, versionNegotiation: { mode: 'auto' } },
    )
    await client.connect(transport)
    return client
  }

  async function reset() {
    const client = state.client
    state.client = undefined
    state.live = new Map()
    if (client !== undefined) {
      try {
        await client.close()
      } catch {
        // a dead transport is already gone
      }
    }
  }

  async function ensure() {
    if (state.client !== undefined) return state.client
    state.dialling ??= (async () => {
      const client = await dial()
      state.client = client
      state.lastError = undefined
      try {
        state.serverInfo = typeof client.getServerVersion === 'function' ? client.getServerVersion() : undefined
      } catch {
        state.serverInfo = undefined
      }
      try {
        const listed = await client.listTools(undefined, { cacheMode: 'refresh' })
        state.live = new Map(listed.tools.map((tool) => [tool.name, tool]))
        hooks.onLive?.(state.live)
      } catch (error) {
        state.live = new Map()
        hooks.onLiveError?.(error)
      }
      return client
    })()
    try {
      return await state.dialling
    } catch (error) {
      state.lastError = describe(error)
      throw new Error(
        `Fusion MCP endpoint ${config.url} is unreachable (${state.lastError}). ` +
          'Start or resume Fusion, confirm its MCP server is enabled, then call again: the endpoint is ' +
          'dialled per attempt, so no plugin reload is needed.',
      )
    } finally {
      state.dialling = undefined
    }
  }

  /** Forward one call upstream, re-dialling once when the transport has died. */
  async function call(rawName, args, exec) {
    const attempt = async () => {
      const client = await ensure()
      const upstream = state.live.get(rawName) ?? hooks.snapshotTool?.(rawName)
      return client.callTool(
        { name: rawName, arguments: args },
        { signal: exec.signal, timeout: config.toolCallTimeoutMs, toolDefinition: upstream },
      )
    }
    state.calls += 1
    try {
      return await attempt()
    } catch (error) {
      if (exec.signal !== undefined && exec.signal.aborted) throw error
      state.redials += 1
      state.lastError = describe(error)
      await reset()
      return attempt()
    }
  }

  async function statusReport(extra = {}) {
    const report = {
      endpoint: config.url,
      toolCallTimeoutMs: config.toolCallTimeoutMs,
      connected: state.client !== undefined,
      reachable: false,
      calls: state.calls,
      redials: state.redials,
      serverInfo: state.serverInfo ?? null,
      liveToolCount: state.live.size,
      lastError: state.lastError ?? null,
      ...extra,
    }
    try {
      await ensure()
      report.connected = true
      report.reachable = true
      report.serverInfo = state.serverInfo ?? report.serverInfo
      report.liveToolCount = state.live.size
      report.lastError = null
    } catch (error) {
      report.lastError = describe(error)
    }
    return report
  }

  return { state, ensure, reset, call, statusReport }
}
