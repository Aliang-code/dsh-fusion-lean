/**
 * Endpoint resolution for the Fusion MCP service.
 *
 * Two things live here because both are pure and both are easy to get wrong:
 *
 *  * **field unwrapping** — a `.volatile()` field reaches the plugin as a
 *    container with `get()`, not as a plain value, so reading it raw yields an
 *    object and every default silently wins;
 *  * **URL assembly** — users configure a port (and optionally a host or a full
 *    URL) from the harness settings; the connection code only ever sees one URL.
 */

export const DEFAULT_ENDPOINT = { host: '127.0.0.1', port: 27182, path: '/mcp' }

/**
 * Read one configuration field, whether the loader handed over a plain value or
 * a volatile container.
 *
 * @param {unknown} value raw field value
 * @returns {unknown} the underlying value
 */
export function readField(value) {
  if (value !== null && typeof value === 'object' && typeof value.get === 'function') return value.get()
  return value
}

/** Read every field of interest into one plain object. */
export function readConfig(config = {}) {
  return {
    host: readField(config.host),
    port: readField(config.port),
    path: readField(config.path),
    url: readField(config.url),
    toolCallTimeoutMs: readField(config.toolCallTimeoutMs),
  }
}

/**
 * Turn the configured knobs into one endpoint URL. A full `url` wins over the
 * parts, so a remote or tunnelled endpoint needs no pseudo-configuration.
 *
 * @param {{ host?: unknown, port?: unknown, path?: unknown, url?: unknown }} config
 * @returns {string} an absolute http(s) URL
 */
export function resolveEndpoint(config = {}) {
  const fields = readConfig(config)
  if (typeof fields.url === 'string' && fields.url.trim().length > 0) return fields.url.trim()
  const host = typeof fields.host === 'string' && fields.host.length > 0 ? fields.host : DEFAULT_ENDPOINT.host
  const port = Number.isInteger(fields.port) && fields.port > 0 ? fields.port : DEFAULT_ENDPOINT.port
  const configuredPath =
    typeof fields.path === 'string' && fields.path.length > 0 ? fields.path : DEFAULT_ENDPOINT.path
  const path = configuredPath.startsWith('/') ? configuredPath : `/${configuredPath}`
  return `http://${host}:${port}${path}`
}
