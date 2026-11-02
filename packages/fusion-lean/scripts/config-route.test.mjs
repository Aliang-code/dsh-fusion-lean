/**
 * The settings routes, driven without a web server.
 *
 *   node scripts/config-route.test.mjs
 *
 * Verifies request handling and the persistence call for both the endpoint row
 * and the workspace row, so a failure after a restart can only be registration.
 */

import { EventEmitter } from 'node:events'

import { registerConfigRoute } from '../src/config-route.js'

const HARNESS_ROOT = 'D:\\Users\\Aliang\\Desktop\\装修\\接单\\fusion-harness'

class FakeRequest extends EventEmitter {
  constructor({ method, body, remoteAddress = '127.0.0.1' }) {
    super()
    this.method = method
    this.socket = { remoteAddress }
    this.body = body
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

function harness(config) {
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
  check('a refused path is not persisted', edits.length === 0)

  // The workspace may be cloned after the path is saved, so a missing script is a
  // warning, not a gate — the tool call is where that truth is re-read.
  const noScript = await call(routes, '/fusion-lean/workspace', new FakeRequest({ method: 'POST', body: JSON.stringify({ harnessRoot: process.env.TEMP }) }))
  check('an existing directory without tools/hf.py is accepted', noScript.status === 200 && noScript.body.checks.hasScript === false, JSON.stringify(noScript.body))
  check('… and it comes with an explicit warning', typeof noScript.body.warning === 'string' && /tools\/hf\.py/.test(noScript.body.warning), JSON.stringify(noScript.body.warning))

  const empty = await call(routes, '/fusion-lean/workspace', new FakeRequest({ method: 'POST', body: JSON.stringify({ harnessRoot: '' }) }))
  check('an empty path is allowed (MCP-only mode)', empty.status === 200 && empty.body.checks.configured === false, JSON.stringify(empty.body))
  check('every accepted save reached persistence', edits.length === 2 && edits[1].next.harnessRoot === '')
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
