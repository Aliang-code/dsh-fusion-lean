/**
 * Transport codec for the Fusion MCP endpoint.
 *
 * The endpoint re-decodes UTF-8 payloads as latin-1: a literal `中文` arrives as
 * a run of U+00E4-style characters, while the six ASCII bytes `\u4e2d` survive
 * untouched and are interpreted by Fusion's Python at compile time. Escaping a
 * *Python source* string therefore round-trips, and this module mirrors the
 * transform `fusion-harness/tools/hf.py` already relies on (`payload()` there,
 * `mcp.py` for the reverse direction).
 *
 * Only Python source may be escaped. A data value (a filter operand, a prompt)
 * is not re-interpreted on the far side, so `\u4e2d` would reach the API as six
 * literal characters instead of the intended one.
 */

const NON_ASCII = /[^\x00-\x7F]/
const LATIN1_HIGH = /[\u0080-\u00FF]/

function hex(value, width) {
  return value.toString(16).padStart(width, '0')
}

/**
 * Rewrite every non-ASCII code point as a `\uXXXX` / `\UXXXXXXXX` escape.
 * Mirrors Python's `backslashreplace` under an ASCII codec.
 */
export function escapeForTransport(text) {
  if (typeof text !== 'string' || !NON_ASCII.test(text)) return text
  let out = ''
  for (const character of text) {
    const point = character.codePointAt(0)
    if (point < 0x80) {
      out += character
      continue
    }
    out += point <= 0xffff ? `\\u${hex(point, 4)}` : `\\U${hex(point, 8)}`
  }
  return out
}

/**
 * Undo the latin-1 mis-decoding on text coming back from the endpoint.
 *
 * Only applied when the transform is strictly reversible: every code unit must
 * fit latin-1 and the bytes must be valid UTF-8 (a replacement character breaks
 * the round trip, so genuinely-lossy text is left alone rather than mangled a
 * second time). `DSH_FUSION_NO_TRANSCODE=1` disables the reverse direction for
 * diagnosis; the outward escaping is never disabled.
 */
export function restoreFromTransport(text) {
  if (typeof text !== 'string' || text.length === 0) return text
  if (!LATIN1_HIGH.test(text)) return text
  if (process.env.DSH_FUSION_NO_TRANSCODE === '1') return text

  const bytes = Buffer.allocUnsafe(text.length)
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index)
    if (unit > 0xff) return text
    bytes[index] = unit
  }
  const decoded = bytes.toString('utf8')
  const reencoded = Buffer.from(decoded, 'utf8')
  if (reencoded.length !== bytes.length || !reencoded.equals(bytes)) return text
  return decoded
}

/** Apply {@link restoreFromTransport} to every text block of an MCP tool result. */
export function restoreToolResult(result) {
  if (result === null || typeof result !== 'object' || !Array.isArray(result.content)) return result
  let changed = false
  const content = result.content.map((block) => {
    if (block === null || typeof block !== 'object' || block.type !== 'text' || typeof block.text !== 'string') return block
    const text = restoreFromTransport(block.text)
    if (text === block.text) return block
    changed = true
    return { ...block, text }
  })
  return changed ? { ...result, content } : result
}
