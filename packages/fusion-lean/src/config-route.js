/**
 * Host half of the settings surface.
 *
 * The harness renders no form from a Config schema on its own (`dsh-settings`:
 * `autoGenerate` is meant for clients that generate pages, and none does), so the
 * row's page hosts whatever the plugin puts in `plugins.row.config`. This route
 * is the write path behind that page: it reads the live row config and persists
 * edits through `configEditor`, which applies them via the normal Loader path.
 */

import { existsSync, mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { resolveEndpoint } from './endpoint.js'

const ROUTE_PATH = '/fusion-lean/config'
const CLIENT_STATUS_PATH = '/fusion-lean/client-status'
const WORKSPACE_PATH = '/fusion-lean/workspace'
const MAX_BODY = 8 * 1024

const FIELDS = ['host', 'port', 'path', 'url', 'toolCallTimeoutMs']
const PICK_PATH = '/fusion-lean/pick'
const PICK_TIMEOUT_MS = 120000

/**
 * Report what a workspace path currently offers.
 *
 * Only `exists` / `isDirectory` are treated as a hard requirement, because that
 * is the only thing a save can be wrong about. `hasScript` is a **signal**, not a
 * gate: the workspace can be cloned or created after the path is saved, and the
 * truth is re-read on every `hf_*` call anyway.
 */
function inspectWorkspace(root) {
  if (typeof root !== 'string' || root.trim().length === 0) {
    return { configured: false, exists: false, isDirectory: false, hasScript: false }
  }
  const clean = root.trim()
  let isDirectory = false
  try {
    isDirectory = statSync(clean).isDirectory()
  } catch {
    isDirectory = false
  }
  return {
    configured: true,
    exists: existsSync(clean),
    isDirectory,
    hasScript: existsSync(join(clean, 'tools', 'hf.py')),
  }
}

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
 * Register the settings route on a context that already has `webServer` and
 * `configEditor` (call it from inside `ctx.inject([...])`, so a deployment
 * without either simply never registers the route and the tools keep working).
 *
 * A second route collects the browser half's own boot report: when the settings
 * row does not appear, the only question worth asking is "did the module load at
 * all", and the browser console is not reachable from here.
 */
export function registerConfigRoute(ctx, getConfig, graphInfo = null) {
  const webServer = ctx.webServer
  const configEditor = ctx.configEditor
  let clientReport = null

  const disposeClientStatus = webServer.register({
    kind: 'exact',
    path: CLIENT_STATUS_PATH,
    handler: async (req, res) => {
      if (!isLoopback(req)) {
        send(res, 403, { ok: false, error: 'loopback only' })
        return
      }
      if (req.method === 'GET') {
        send(res, 200, { ok: true, client: clientReport, graph: graphInfo })
        return
      }
      try {
        const body = JSON.parse((await readBody(req)) || '{}')
        clientReport = {
          stage: typeof body.stage === 'string' ? body.stage : 'unknown',
          message: typeof body.message === 'string' ? body.message.slice(0, 500) : null,
          at: new Date().toISOString(),
        }
        send(res, 200, { ok: true })
      } catch (error) {
        send(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
      }
    },
  })

  // The `fusion-harness` row belongs to another plugin instance, so its value is
  // read from that entry's resolved fiber config and written as a profile override
  // keyed by the same entry id. That is how someone else points the hf tools at
  // their own workspace without editing YAML by hand.
  const harnessEntry = () =>
    configEditor.entries().find((row) => row.options?.id === 'fusion-harness' || row.options?.id === 'include:fusion-harness')

  const readWorkspace = () => {
    const live = harnessEntry()?.fiber?.config ?? {}
    return {
      harnessRoot: typeof live.harnessRoot === 'string' ? live.harnessRoot : '',
      python: typeof live.python === 'string' && live.python.length > 0 ? live.python : 'python',
    }
  }

  const disposeWorkspace = webServer.register({
    kind: 'exact',
    path: WORKSPACE_PATH,
    handler: async (req, res) => {
      if (!isLoopback(req)) {
        send(res, 403, { ok: false, error: 'loopback only' })
        return
      }
      if (req.method === 'GET') {
        const config = readWorkspace()
        send(res, 200, { ok: true, config, checks: inspectWorkspace(config.harnessRoot) })
        return
      }
      if (req.method !== 'POST') {
        send(res, 405, { ok: false, error: 'GET or POST' })
        return
      }
      try {
        const body = JSON.parse((await readBody(req)) || '{}')
        if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new Error('body must be an object')
        const harnessRoot = typeof body.harnessRoot === 'string' ? body.harnessRoot.trim() : ''
        const python = typeof body.python === 'string' && body.python.trim().length > 0 ? body.python.trim() : undefined
        const wantCreate = body.create === true

        const before = inspectWorkspace(harnessRoot)
        let created = false
        if (before.configured && !before.exists) {
          // Creating a directory is a deliberate second step, never a side effect of
          // typing a path: a typo would otherwise leave a junk folder that looks
          // configured forever.
          if (!wantCreate) {
            send(res, 400, {
              ok: false,
              code: 'not-found',
              canCreate: true,
              error: `${harnessRoot} does not exist`,
            })
            return
          }
          mkdirSync(harnessRoot, { recursive: true })
          created = true
        }

        const checks = inspectWorkspace(harnessRoot)
        if (checks.configured && !checks.isDirectory) throw new Error(`${harnessRoot} is a file, not a directory`)

        const entry = harnessEntry()
        if (entry === undefined) throw new Error('the fusion-harness row is not an entry that can be persisted')
        await configEditor.edit(entry, (raw) => ({
          ...raw,
          harnessRoot,
          ...(python === undefined ? {} : { python }),
        }))
        send(res, 200, {
          ok: true,
          created,
          config: { harnessRoot, python: python ?? readWorkspace().python },
          checks,
          // Saved on purpose even when tools/hf.py is missing: the workspace can be
          // cloned afterwards, and the tool call is where that truth is re-read.
          warning:
            checks.configured && !checks.hasScript
              ? created
                ? 'directory created, but it is empty — clone or copy the fusion-harness workspace into it before using hf_*'
                : 'saved, but no tools/hf.py was found there — hf_* calls will fail until the workspace is in place'
              : null,
        })
      } catch (error) {
        send(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
      }
    },
  })

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
  // Directory picking lives on the host: the desktop backend offers a native
  // dialog, the browser backend offers a browse listing. This route asks for the
  // native one and says so plainly when only browsing exists — the page then falls
  // back to its own client-side picker.
  const disposePick = webServer.register({
    kind: 'exact',
    path: PICK_PATH,
    handler: async (req, res) => {
      if (!isLoopback(req)) {
        send(res, 403, { ok: false, error: 'loopback only' })
        return
      }
      if (req.method !== 'POST') {
        send(res, 405, { ok: false, error: 'POST' })
        return
      }
      try {
        const picker = typeof ctx.get === 'function' ? ctx.get('directoryPicker') : ctx.directoryPicker
        const capability = typeof picker?.capability === 'function' ? picker.capability() : undefined
        if (capability === undefined || capability.kind !== 'native' || typeof capability.pick !== 'function') {
          send(res, 501, {
            ok: false,
            code: 'unsupported',
            error: 'this host offers no native directory dialog',
          })
          return
        }
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), PICK_TIMEOUT_MS)
        try {
          const picked = await capability.pick(controller.signal)
          if (picked === null || picked === undefined || picked === '') {
            send(res, 200, { ok: true, cancelled: true, path: null })
            return
          }
          send(res, 200, { ok: true, cancelled: false, path: String(picked) })
        } finally {
          clearTimeout(timer)
        }
      } catch (error) {
        send(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
      }
    },
  })

  return () => {
    dispose()
    disposeClientStatus()
    disposeWorkspace()
    disposePick()
  }
}
