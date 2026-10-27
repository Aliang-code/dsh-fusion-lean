/**
 * Host half of the settings surface.
 *
 * The harness renders no form from a Config schema on its own (`dsh-settings`:
 * `autoGenerate` is meant for clients that generate pages, and none does), so the
 * row's page hosts whatever the plugin puts in `plugins.row.config`. This route
 * is the write path behind that page: it reads the live row config and persists
 * edits through `configEditor`, which applies them via the normal Loader path.
 */

import { resolveEndpoint } from './endpoint.js'

const ROUTE_PATH = '/fusion-lean/config'
const MAX_BODY = 8 * 1024

const FIELDS = ['host', 'port', 'path', 'url', 'toolCallTimeoutMs']

function isLoopback(req) {
  const address = req.socket?.remoteAddress ?? ''
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

function send(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(payload)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new Error('request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/** Validate one incoming field; returns the normalized value or throws. */
function normalize(field, value) {
  switch (field) {
    case 'host':
      if (typeof value !== 'string' || value.trim().length === 0) throw new Error('host must be a non-empty string')
      return value.trim()
    case 'port': {
      const port = Number(value)
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('port must be an integer 1-65535')
      return port
    }
    case 'path':
      if (typeof value !== 'string' || value.trim().length === 0) throw new Error('path must be a non-empty string')
      return value.trim()
    case 'url':
      if (typeof value !== 'string') throw new Error('url must be a string')
      if (value.trim().length === 0) return ''
      if (!/^https?:\/\//i.test(value.trim())) throw new Error('url must start with http:// or https://')
      return value.trim()
    case 'toolCallTimeoutMs': {
      const timeout = Number(value)
      if (!Number.isInteger(timeout) || timeout < 1) throw new Error('toolCallTimeoutMs must be a positive integer')
      return timeout
    }
    default:
      throw new Error(`unknown field ${field}`)
  }
}

/**
 * Register the settings route. Both services are looked up optionally: the tools
 * keep working in a deployment without a web server or a config editor, and the
 * route only appears where it can actually persist.
 */
export function registerConfigRoute(ctx, getConfig) {
  const webServer = ctx.get?.('webServer')
  const configEditor = ctx.get?.('configEditor')
  if (webServer === undefined || configEditor === undefined) return undefined

  const dispose = webServer.register({
    kind: 'exact',
    path: ROUTE_PATH,
    handler: async (req, res) => {
      if (!isLoopback(req)) {
        send(res, 403, { ok: false, error: 'loopback only' })
        return
      }
      if (req.method === 'GET') {
        const config = getConfig()
        send(res, 200, {
          ok: true,
          endpoint: resolveEndpoint(config),
          config: Object.fromEntries(FIELDS.map((field) => [field, config[field] ?? null])),
        })
        return
      }
      if (req.method !== 'POST') {
        send(res, 405, { ok: false, error: 'GET or POST' })
        return
      }
      try {
        const text = await readBody(req)
        const patch = JSON.parse(text.length === 0 ? '{}' : text)
        if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('body must be an object')
        const normalized = {}
        for (const [field, value] of Object.entries(patch)) {
          if (!FIELDS.includes(field)) throw new Error(`unknown field ${field}`)
          normalized[field] = normalize(field, value)
        }
        const entry = configEditor
          .entries()
          .find((row) => row.options?.id === 'fusion-lean' || row.options?.id === 'include:fusion-lean')
        if (entry === undefined) throw new Error('this row is not a profile entry that can be persisted')
        await configEditor.edit(entry, (raw) => ({ ...raw, ...normalized }))
        const merged = { ...getConfig(), ...normalized }
        for (const [field, value] of Object.entries(normalized)) merged[field] = value
        send(res, 200, { ok: true, endpoint: resolveEndpoint(merged), config: merged })
      } catch (error) {
        send(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
      }
    },
  })
  return () => dispose()
}
