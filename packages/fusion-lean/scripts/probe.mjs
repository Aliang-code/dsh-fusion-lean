/**
 * Connectivity check for the Fusion endpoint, in both directions.
 *
 * Exit codes: 0 reachable, 2 unreachable (a reported failure, not a crash),
 * 1 unexpected error. Nothing here throws an unhandled rejection.
 *
 *   node scripts/probe.mjs [url]
 */

import { handshake } from './mcp.mjs'

const url = process.argv[2] ?? 'http://127.0.0.1:27182/mcp'

try {
  const { serverInfo, tools } = await handshake(url, { timeoutMs: 5000 })
  console.log(
    JSON.stringify(
      {
        endpoint: url,
        reachable: true,
        serverInfo,
        toolCount: tools.length,
        tools: tools.map((tool) => tool.name),
      },
      null,
      2,
    ),
  )
  process.exit(0)
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error)
  console.log(
    JSON.stringify(
      {
        endpoint: url,
        reachable: false,
        reason,
        hint: 'Start or resume Fusion and confirm its MCP server is enabled, then retry.',
      },
      null,
      2,
    ),
  )
  const known = /fetch failed|ECONNREFUSED|aborted|HTTP 4|HTTP 5/i.test(reason)
  process.exit(known ? 2 : 1)
}
