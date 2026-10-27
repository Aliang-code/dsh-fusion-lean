/**
 * Re-capture the capability contract from a running Fusion endpoint.
 *
 * Writes `assets/fusion-tools.json` as `{ capturedAt, serverInfo, tools[] }`
 * where each tool carries the upstream `description`, `inputSchema`,
 * `outputSchema` and a SHA-256 of its input schema. The digest is what lets
 * activation report drift without fetching anything.
 *
 *   node scripts/snapshot.mjs [url]
 */

import { writeFileSync } from 'node:fs'

import { handshake } from './mcp.mjs'
import { schemaDigest } from '../src/digest.js'

const url = process.argv[2] ?? 'http://127.0.0.1:27182/mcp'
const target = new URL('../assets/fusion-tools.json', import.meta.url)

const { serverInfo, tools } = await handshake(url)
if (tools.length === 0) {
  console.error(`snapshot: ${url} reported no tools; nothing written`)
  process.exit(1)
}

const snapshot = {
  capturedAt: new Date().toISOString(),
  serverInfo,
  tools: tools.map((tool) => ({
    name: tool.name,
    description: tool.description ?? '',
    inputSchema: tool.inputSchema ?? {},
    ...(tool.outputSchema === undefined ? {} : { outputSchema: tool.outputSchema }),
    digest: schemaDigest(tool.inputSchema),
  })),
}

writeFileSync(target, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')

const total = snapshot.tools.reduce((sum, tool) => sum + Buffer.byteLength(tool.description ?? ''), 0)
console.log(`snapshot: ${snapshot.tools.length} tools from ${serverInfo?.name ?? 'unknown'} ${serverInfo?.version ?? ''}`)
console.log(`snapshot: description bytes ${total}; written to ${target.pathname}`)

