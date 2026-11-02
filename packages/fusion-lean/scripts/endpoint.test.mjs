/**
 * Endpoint knobs → one URL. Users set host/port/path from the plugin settings;
 * a full URL overrides the parts.
 *
 *   node scripts/endpoint.test.mjs
 */

import { DEFAULT_ENDPOINT, readConfig, readField, resolveEndpoint } from '../src/endpoint.js'

// A `.volatile()` field reaches the plugin as a container with get(), not a value.
const cell = (value) => ({ get: () => value })

const cases = [
  ['defaults', {}, 'http://127.0.0.1:27182/mcp'],
  ['volatile cells', { host: cell('127.0.0.1'), port: cell(28000), path: cell('/mcp') }, 'http://127.0.0.1:28000/mcp'],
  ['volatile url wins', { url: cell('https://cell.test/mcp'), port: cell(1) }, 'https://cell.test/mcp'],
  ['port only', { port: 28000 }, 'http://127.0.0.1:28000/mcp'],
  ['host and port', { host: '10.0.0.5', port: 9000 }, 'http://10.0.0.5:9000/mcp'],
  ['path without slash', { path: 'rpc' }, 'http://127.0.0.1:27182/rpc'],
  ['custom path', { path: '/api/mcp' }, 'http://127.0.0.1:27182/api/mcp'],
  ['url wins', { url: 'https://example.test/mcp', port: 1 }, 'https://example.test/mcp'],
  ['blank url falls back', { url: '   ', port: 28001 }, 'http://127.0.0.1:28001/mcp'],
  ['bad port falls back', { port: -1 }, `http://127.0.0.1:${DEFAULT_ENDPOINT.port}/mcp`],
]

let failures = 0
for (const [label, config, expected] of cases) {
  const actual = resolveEndpoint(config)
  if (actual !== expected) {
    console.error(`FAIL ${label}: expected ${expected}, got ${actual}`)
    failures += 1
    continue
  }
  console.log(`ok   ${label}: ${actual}`)
}

if (failures > 0) {
  console.error(`\n${failures} case(s) failed`)
  process.exit(1)
}

// Field unwrapping: a volatile cell must yield its value, a plain value itself.
const unwrapCases = [
  ['plain number', 120000, 120000],
  ['volatile number', cell(120000), 120000],
  ['plain string', '127.0.0.1', '127.0.0.1'],
  ['volatile empty string', cell(''), ''],
  ['undefined stays undefined', undefined, undefined],
]
for (const [label, input, expected] of unwrapCases) {
  const actual = readField(input)
  if (actual !== expected) {
    console.error(`FAIL readField ${label}: expected ${String(expected)}, got ${String(actual)}`)
    failures += 1
    continue
  }
  console.log(`ok   readField ${label}`)
}

const fields = readConfig({ port: cell(28000), toolCallTimeoutMs: cell(90000), host: 'h' })
if (fields.port !== 28000 || fields.toolCallTimeoutMs !== 90000 || fields.host !== 'h') {
  console.error(`FAIL readConfig mixing: ${JSON.stringify(fields)}`)
  failures += 1
} else {
  console.log('ok   readConfig mixes volatile and plain fields')
}

if (failures > 0) {
  console.error(`\n${failures} case(s) failed`)
  process.exit(1)
}
console.log('\nall endpoint cases pass')
