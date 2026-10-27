/**
 * Endpoint knobs → one URL. Users set host/port/path from the plugin settings;
 * a full URL overrides the parts.
 *
 *   node scripts/endpoint.test.mjs
 */

import { DEFAULT_ENDPOINT, resolveEndpoint } from '../src/endpoint.js'

const cases = [
  ['defaults', {}, 'http://127.0.0.1:27182/mcp'],
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
console.log('\nall endpoint cases pass')
