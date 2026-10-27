/**
 * Endpoint resolution for the Fusion MCP service.
 *
 * Users configure a port (and optionally a host or a full URL) from the harness'
 * plugin settings; the connection code only ever sees one URL.
 */

export const DEFAULT_ENDPOINT = { host: '127.0.0.1', port: 27182, path: '/mcp' }

/**
 * Turn the configured knobs into one endpoint URL. A full `url` wins over the
 * parts, so a remote or tunnelled endpoint needs no pseudo-configuration.
 *
 * @param {{ host?: unknown, port?: unknown, path?: unknown, url?: unknown }} config
 * @returns {string} an absolute http(s) URL
 */
export function resolveEndpoint(config = {}) {
  if (typeof config.url === 'string' && config.url.trim().length > 0) return config.url.trim()
  const host = typeof config.host === 'string' && config.host.length > 0 ? config.host : DEFAULT_ENDPOINT.host
  const port = Number.isInteger(config.port) && config.port > 0 ? config.port : DEFAULT_ENDPOINT.port
  const configuredPath =
    typeof config.path === 'string' && config.path.length > 0 ? config.path : DEFAULT_ENDPOINT.path
  const path = configuredPath.startsWith('/') ? configuredPath : `/${configuredPath}`
  return `http://${host}:${port}${path}`
}
