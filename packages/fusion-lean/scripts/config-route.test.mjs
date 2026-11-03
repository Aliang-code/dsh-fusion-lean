/**
 * The settings routes, driven without a web server.
 *
 *   node scripts/config-route.test.mjs
 *
 * Verifies request handling and the persistence call for both the endpoint row
 * and the workspace row, so a failure after a restart can only be registration.
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { registerConfigRoute } from '../src/config-route.js'

const WORKSPACE = mkdtempSync(join(tmpdir(), "fusion-lean-ws-"))
mkdirSync(join(WORKSPACE, "tools"), { recursive: true })
writeFileSync(join(WORKSPACE, "tools", "hf.py"), "# test fixture\n")
const HARNESS_ROOT = WORKSPACE

class FakeRequest extends EventEmitter {
  constructor({ method, body, url, remoteAddress = '127.0.0.1' }) {
    super()
    this.method = method
    this.socket = { remoteAddress }
    this.body = body
    this.url = url
  }

  start() {
    if (this.body !== undefined) this.emit('data', Buffer.from(this.body, 'utf8'))
    this.emit('end')
  }
}

function fakeResponse() {
  const captured = { status: 0, body: '' }
  return {
    captured,
    writeHead(status) {
      captured.status = status
    },
    end(payload) {
      captured.body = payload ?? ''
    },
  }
}

function harness(config, picker) {
  const routes = new Map()
  const edits = []
  const harnessRow = { options: { id: 'fusion-harness' }, fiber: { config: { harnessRoot: '' } } }
  const leanRow = { options: { id: 'fusion-lean' } }
  const ctx = {
    webServer: {
      register(route) {
        routes.set(route.path, route.handler)
        return () => routes.delete(route.path)
      },
    },
    configEditor: {
      entries: () => [leanRow, harnessRow],
      edit: async (entry, change) => {
        const next = change(entry.options, {})
        edits.push({ id: entry.options.id, next })
        if (entry === harnessRow) harnessRow.fiber.config = { ...harnessRow.fiber.config, ...next }
      },
    },
    get: (name) => (name === 'directoryPicker' ? picker : undefined),
  }
  registerConfigRoute(ctx, () => config)
  return { routes, edits }
}

async function call(routes, path, request) {
  const handler = routes.get(path)
  if (handler === undefined) throw new Error(`route ${path} is not registered`)
  const response = fakeResponse()
  const pending = handler(request, response)
  request.start()
  await pending
  return { status: response.captured.status, body: JSON.parse(response.captured.body) }
}

let failures = 0
const check = (label, ok, detail) => {
  if (ok) {
    console.log(`ok   ${label}`)
    return
  }
  failures += 1
  console.error(`FAIL ${label}${detail === undefined ? '' : `: ${detail}`}`)
}

const config = { host: '127.0.0.1', port: 27182, path: '/mcp', url: '', toolCallTimeoutMs: 120000 }

// --- endpoint row ---------------------------------------------------------
{
  const { routes } = harness(config)
  const { status, body } = await call(routes, '/fusion-lean/config', new FakeRequest({ method: 'GET' }))
  check('GET /config returns the endpoint', status === 200 && body.endpoint === 'http://127.0.0.1:27182/mcp', JSON.stringify(body))
  check('GET /config lists the five fields', Object.keys(body.config).length === 5, JSON.stringify(body.config))
}
{
  const { routes, edits } = harness(config)
  const { status, body } = await call(routes, '/fusion-lean/config', new FakeRequest({ method: 'POST', body: JSON.stringify({ port: 28000 }) }))
  check('POST /config recomputes the endpoint', status === 200 && body.endpoint === 'http://127.0.0.1:28000/mcp', body.endpoint)
  check('POST /config persisted on the lean row', edits.length === 1 && edits[0].id === 'fusion-lean' && edits[0].next.port === 28000)
}
{
  const { routes, edits } = harness(config)
  const bad = await call(routes, '/fusion-lean/config', new FakeRequest({ method: 'POST', body: JSON.stringify({ port: 70000 }) }))
  check('out-of-range port is refused', bad.status === 400 && /port/.test(bad.body.error), JSON.stringify(bad.body))
  const unknown = await call(routes, '/fusion-lean/config', new FakeRequest({ method: 'POST', body: JSON.stringify({ token: 'x' }) }))
  check('unknown field is refused', unknown.status === 400)
  check('nothing persisted on rejection', edits.length === 0)
}

// --- workspace row --------------------------------------------------------
{
  const { routes } = harness(config)
  const { status, body } = await call(routes, '/fusion-lean/workspace', new FakeRequest({ method: 'GET' }))
  check('GET /workspace reports unset', status === 200 && body.checks.configured === false, JSON.stringify(body))
  check('GET /workspace defaults python to "python"', body.config.python === 'python', body.config.python)
}
{
  const { routes, edits } = harness(config)
  const { status, body } = await call(routes, '/fusion-lean/workspace', new FakeRequest({ method: 'POST', body: JSON.stringify({ harnessRoot: HARNESS_ROOT }) }))
  check('POST /workspace accepts a real workspace', status === 200 && body.checks.hasScript === true, JSON.stringify(body))
  check('POST /workspace persisted on the harness row', edits.length === 1 && edits[0].id === 'fusion-harness' && edits[0].next.harnessRoot === HARNESS_ROOT)
}
{
  const { routes, edits } = harness(config)
  const missing = await call(routes, '/fusion-lean/workspace', new FakeRequest({ method: 'POST', body: JSON.stringify({ harnessRoot: 'D:\\definitely\\not\\here' }) }))
  check('a path that does not exist is refused', missing.status === 400 && /does not exist/.test(missing.body.error), JSON.stringify(missing.body))
  check('the refusal offers to create it', missing.body.canCreate === true && missing.body.code === 'not-found', JSON.stringify(missing.body))
  check('a refused path is not persisted', edits.length === 0)

  // Explicit second step: a typo must never create a folder, so creation needs
  // `create: true` from the user's confirmation.
  const target = join(process.env.TEMP, `fusion-lean-create-test-${Date.now()}`)
  const created = await call(routes, '/fusion-lean/workspace', new FakeRequest({ method: 'POST', body: JSON.stringify({ harnessRoot: target, create: true }) }))
  check('an explicit create succeeds', created.status === 200 && created.body.created === true, JSON.stringify(created.body))
  check('the directory really exists', existsSync(target))
  check('the empty directory carries a warning', typeof created.body.warning === 'string' && /empty/.test(created.body.warning), JSON.stringify(created.body.warning))
  check('the created path was persisted', edits.length === 1 && edits[0].next.harnessRoot === target)
  rmSync(target, { recursive: true, force: true })

  // The workspace may be cloned after the path is saved, so a missing script is a
  // warning, not a gate — the tool call is where that truth is re-read.
  const noScript = await call(routes, '/fusion-lean/workspace', new FakeRequest({ method: 'POST', body: JSON.stringify({ harnessRoot: process.env.TEMP }) }))
  check('an existing directory without tools/hf.py is accepted', noScript.status === 200 && noScript.body.checks.hasScript === false, JSON.stringify(noScript.body))
  check('… and it comes with an explicit warning', typeof noScript.body.warning === 'string' && /tools\/hf\.py/.test(noScript.body.warning), JSON.stringify(noScript.body.warning))

  const empty = await call(routes, '/fusion-lean/workspace', new FakeRequest({ method: 'POST', body: JSON.stringify({ harnessRoot: '' }) }))
  check('an empty path is allowed (MCP-only mode)', empty.status === 200 && empty.body.checks.configured === false, JSON.stringify(empty.body))
  check('every accepted save reached persistence', edits.length === 3 && edits.at(-1).next.harnessRoot === '')
}

// --- directory picking ----------------------------------------------------
{
  const native = { capability: () => ({ kind: 'native', pick: async () => HARNESS_ROOT }) }
  const { routes } = harness(config, native)
  const picked = await call(routes, '/fusion-lean/pick', new FakeRequest({ method: 'POST' }))
  check('POST /pick returns the native choice', picked.status === 200 && picked.body.path === HARNESS_ROOT, JSON.stringify(picked.body))
}
{
  const cancel = { capability: () => ({ kind: 'native', pick: async () => null }) }
  const { routes } = harness(config, cancel)
  const picked = await call(routes, '/fusion-lean/pick', new FakeRequest({ method: 'POST' }))
  check('cancelling the dialog is not an error', picked.status === 200 && picked.body.cancelled === true, JSON.stringify(picked.body))
}
{
  const browseOnly = { capability: () => ({ kind: 'browse', list: async () => ({}) }) }
  const { routes } = harness(config, browseOnly)
  const unsupported = await call(routes, '/fusion-lean/pick', new FakeRequest({ method: 'POST' }))
  check('a browse-only host reports unsupported', unsupported.status === 501 && unsupported.body.code === 'unsupported', JSON.stringify(unsupported.body))
}
{
  const { routes } = harness(config, undefined)
  const missing = await call(routes, '/fusion-lean/pick', new FakeRequest({ method: 'POST' }))
  check('a host without a picker reports unsupported', missing.status === 501 && missing.body.code === 'unsupported', JSON.stringify(missing.body))
}

// --- directory browsing (the browse-only capability) ----------------------
{
  const HOME = 'D:\\work'
  const browse = {
    capability: () => ({
      kind: 'browse',
      list: async (requested) => ({
        path: requested ?? HOME,
        home: HOME,
        entries: [{ name: 'fusion-harness', path: `${HOME}\\fusion-harness`, hidden: false }],
      }),
    }),
  }
  const { routes } = harness(config, browse)

  const listed = await call(routes, '/fusion-lean/list', new FakeRequest({ method: 'GET' }))
  check('GET /list lists the home directory', listed.status === 200 && listed.body.path === HOME, JSON.stringify(listed.body))
  check('GET /list returns entries', listed.body.entries?.[0]?.name === 'fusion-harness', JSON.stringify(listed.body.entries))
  check('GET /list still offers a parent above the home', listed.body.parent === 'D:\\', String(listed.body.parent))

  const sub = await call(routes, '/fusion-lean/list', new FakeRequest({ method: 'GET', url: `/fusion-lean/list?path=${encodeURIComponent(HOME + '\\fusion-harness')}` }))
  check('GET /list honours the path query', sub.status === 200 && sub.body.path === `${HOME}\\fusion-harness`, JSON.stringify(sub.body))
  check('GET /list computes the parent', sub.body.parent === HOME, String(sub.body.parent))

  const wrongMethod = await call(routes, '/fusion-lean/list', new FakeRequest({ method: 'POST' }))
  check('POST /list is refused', wrongMethod.status === 405, JSON.stringify(wrongMethod.body))
}
{
  const nativeOnly = { capability: () => ({ kind: 'native', pick: async () => null }) }
  const { routes } = harness(config, nativeOnly)
  const unsupported = await call(routes, '/fusion-lean/list', new FakeRequest({ method: 'GET' }))
  check('a native-only host reports no listing', unsupported.status === 501 && unsupported.body.code === 'unsupported', JSON.stringify(unsupported.body))
}

// --- shared guards --------------------------------------------------------
{
  const { routes } = harness(config)
  for (const path of ['/fusion-lean/config', '/fusion-lean/workspace']) {
    const denied = await call(routes, path, new FakeRequest({ method: 'GET', remoteAddress: '10.1.2.3' }))
    check(`${path} refuses non-loopback`, denied.status === 403, JSON.stringify(denied.body))
  }
  const status = await call(routes, '/fusion-lean/client-status', new FakeRequest({ method: 'GET' }))
  check('/client-status reports the beacon', status.status === 200 && 'client' in status.body, JSON.stringify(status.body))
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nall config-route checks pass')
