/**
 * Minimal MCP client over `fetch` for the repository's own scripts.
 *
 * The bundle's runtime uses the official SDK (installed as a peer dependency),
 * but a checkout has no node_modules yet, and a diagnostic must work before
 * anything is installed. This speaks just enough protocol for `probe` and
 * `snapshot`: `initialize` → `notifications/initialized` → `tools/list`.
 */

export async function handshake(url, { timeoutMs = 5000 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }
  try {
    const initResponse = await fetch(url, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'fusion-lean-scripts', version: '0.1.0' },
        },
      }),
    })
    if (!initResponse.ok) throw new Error(`initialize failed: HTTP ${initResponse.status}`)
    const sessionId = initResponse.headers.get('mcp-session-id')
    const initialized = await initResponse.json()
    const serverInfo = initialized?.result?.serverInfo ?? null

    const sessionHeaders = sessionId === null ? headers : { ...headers, 'mcp-session-id': sessionId }
    await fetch(url, {
      method: 'POST',
      headers: sessionHeaders,
      signal: controller.signal,
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    })

    const listResponse = await fetch(url, {
      method: 'POST',
      headers: sessionHeaders,
      signal: controller.signal,
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    })
    if (!listResponse.ok) throw new Error(`tools/list failed: HTTP ${listResponse.status}`)
    const listed = await listResponse.json()
    if (listed?.error !== undefined) throw new Error(`tools/list error: ${JSON.stringify(listed.error)}`)
    return { serverInfo, tools: listed?.result?.tools ?? [] }
  } finally {
    clearTimeout(timer)
  }
}
