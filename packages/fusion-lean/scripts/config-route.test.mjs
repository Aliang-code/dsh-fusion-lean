/**
 * The settings route, driven without a web server.
 *
 *   node scripts/config-route.test.mjs
 *
 * Verifies the request handling and the persistence call, so a failure after a
 * restart can only be the registration, not the logic.
 */

import { EventEmitter } from 'node:events'

import { registerConfigRoute } from '../src/config-route.js'

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
  const captured = { status: 0, headers: undefined, body: '' }
  return {
    captured,
    writeHead(status, headers) {
      captured.status = status
      captured.headers = headers
    },
    end(payload) {
      captured.body = payload ?? ''
    },
  }
}

function harness(config) {
  let handler
  const edits = []
  const ctx = {
    webServer: { register(route) { handler = route.handler; return () => { handler = undefined } } },
    configEditor: {
      entries: () => [{ options: { id: 'fusion-lean' } }],
      edit: async (entry, change) => { edits.push(change(entry.options, {})) },
    },
  }
  registerConfigRoute(ctx, () => config)
  return { handler, edits }
}

async function call(handler, request) {
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

// GET reports the live endpoint and fields.
{
  const { handler } = harness(config)
  const { status, body } = await call(handler, new FakeRequest({ method: 'GET' }))
  check('GET returns 200 with the endpoint', status === 200 && body.endpoint === 'http://127.0.0.1:27182/mcp', JSON.stringify(body))
  check('GET lists all five fields', Object.keys(body.config).length === 5, JSON.stringify(body.config))
}

// POST persists through configEditor and answers with the recomputed endpoint.
{
  const { handler, edits } = harness(config)
  const { status, body } = await call(handler, new FakeRequest({ method: 'POST', body: JSON.stringify({ port: 28000 }) }))
  check('POST returns 200', status === 200, JSON.stringify(body))
  check('POST recomputes the endpoint', body.endpoint === 'http://127.0.0.1:28000/mcp', body.endpoint)
  check('POST reached configEditor.edit', edits.length === 1 && edits[0].port === 28000, JSON.stringify(edits))
}

// Invalid input is rejected without touching persistence.
{
  const { handler, edits } = harness(config)
  const bad = await call(handler, new FakeRequest({ method: 'POST', body: JSON.stringify({ port: 70000 }) }))
  check('out-of-range port is refused', bad.status === 400 && /port/.test(bad.body.error), JSON.stringify(bad.body))
  const unknown = await call(handler, new FakeRequest({ method: 'POST', body: JSON.stringify({ token: 'x' }) }))
  check('unknown field is refused', unknown.status === 400, JSON.stringify(unknown.body))
  check('nothing was persisted on rejection', edits.length === 0)
}

// A non-loopback remote cannot read or write the configuration.
{
  const { handler } = harness(config)
  const denied = await call(handler, new FakeRequest({ method: 'GET', remoteAddress: '10.1.2.3' }))
  check('non-loopback is refused', denied.status === 403, JSON.stringify(denied.body))
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nall config-route checks pass')
