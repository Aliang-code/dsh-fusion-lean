/**
 * Always-on prefix budget: what this bundle costs on every request compared with
 * what the upstream server would cost if registered as-is.
 *
 * Both sides are measured the same way — the UTF-8 bytes of
 * `{ name, description, parameters }` per tool, which is what lands in the
 * request prefix. Exits non-zero when the total exceeds the budget, so growth is
 * caught before it ships.
 *
 *   node scripts/measure.mjs [--budget <bytes>]
 */

import { readFileSync } from 'node:fs'

import { SHORT, normalizeSnapshot } from '../src/tools.js'

const BUDGET = 16384
const budgetFlag = process.argv.indexOf('--budget')
const budget = budgetFlag === -1 ? BUDGET : Number(process.argv[budgetFlag + 1])

const snapshot = normalizeSnapshot(JSON.parse(readFileSync(new URL('../assets/fusion-tools.json', import.meta.url), 'utf8')))
const byRaw = new Map(snapshot.tools.map((tool) => [tool.name, tool]))

const PUBLIC_NAMES = {
  fusion_mcp_read: 'fusion_read',
  fusion_mcp_execute: 'fusion_execute',
  fusion_mcp_update: 'fusion_update',
  fusion_mcp_electronics_read: 'fusion_electronics_read',
}

const bytesOf = (tool) =>
  Buffer.byteLength(JSON.stringify({ name: tool.name, description: tool.description, parameters: tool.parameters }))

const upstream = snapshot.tools.map((tool) => ({
  name: `mcp__fusion__${tool.name}`,
  description: tool.description ?? '',
  parameters: tool.inputSchema,
}))

const lean = Object.entries(PUBLIC_NAMES)
  .map(([rawName, publicName]) => {
    const tool = byRaw.get(rawName)
    if (tool === undefined) return undefined
    return { name: publicName, description: SHORT[publicName], parameters: tool.inputSchema }
  })
  .filter(Boolean)

// `fusion_help` and `fusion_status` are ours, so their cost is part of the total.
lean.push({
  name: 'fusion_help',
  description:
    'Return the verbatim upstream documentation and input schema of one Fusion tool. The Fusion ' +
    'tools carry several pages of parameter and precondition text that is only needed the first ' +
    'time a capability is used, so it is loaded on demand instead of sitting in every request. ' +
    'Call this before a feature type whose arguments you are unsure about.',
  parameters: {
    type: 'object',
    properties: { tool: { type: 'string', enum: Object.values(PUBLIC_NAMES) } },
    required: ['tool'],
    additionalProperties: false,
  },
})
lean.push({
  name: 'fusion_status',
  description:
    'Report the Fusion MCP connection: endpoint, reachability, upstream server identity, tool ' +
    'counts, call and redial counters, the last transport error, and whether the upstream tool ' +
    'schemas still match the bundled snapshot. Use it when a Fusion call fails, after Fusion was ' +
    'restarted, or before planning a modelling step.',
  parameters: { type: 'object', properties: {}, additionalProperties: false },
})

let upstreamTotal = 0
console.log('upstream surface (as a plain MCP client would register it)')
for (const tool of upstream) {
  const bytes = bytesOf(tool)
  upstreamTotal += bytes
  console.log(`  ${tool.name.padEnd(38)} ${String(bytes).padStart(7)} B`)
}
console.log(`  ${'total'.padEnd(38)} ${String(upstreamTotal).padStart(7)} B`)

let leanTotal = 0
console.log('\nlean surface (this bundle)')
for (const tool of lean) {
  const bytes = bytesOf(tool)
  leanTotal += bytes
  console.log(`  ${tool.name.padEnd(38)} ${String(bytes).padStart(7)} B`)
}
console.log(`  ${'total'.padEnd(38)} ${String(leanTotal).padStart(7)} B`)

const saved = upstreamTotal - leanTotal
console.log(
  `\nsaved ${saved} B per request (${((saved / upstreamTotal) * 100).toFixed(1)}% smaller; ` +
    `${(upstreamTotal / leanTotal).toFixed(2)}x)`,
)
console.log(`budget ${budget} B; using ${leanTotal} B (${((leanTotal / budget) * 100).toFixed(1)}%)`)

if (leanTotal > budget) {
  console.error(`\nBLOCKED: lean surface exceeds the ${budget} B budget by ${leanTotal - budget} B`)
  process.exit(1)
}
