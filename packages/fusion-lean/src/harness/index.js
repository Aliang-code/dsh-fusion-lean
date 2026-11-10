/**
 * Second row of the same bundle: the `hf` tools over the fusion-harness CLI.
 *
 * Kept as its own row (and its own entry point) because it has a different
 * prerequisite than the MCP facade — a Python interpreter and a workspace — and
 * because anyone can use the facade without a workspace at all. Same package,
 * one install, two rows; disabling one leaves the other running.
 *
 * The CLI stays the single source of truth; this row only owns the boundary
 * (spawn, encoding, structured result, shipped-set protection).
 */

import { buildHarnessTools } from './tools.js'

export const name = 'dsh-fusion-harness-tools'
export const inject = ['tools']

const DEFAULT_CONFIG = {
  harnessRoot: '',
  python: 'python',
  timeoutMs: 300000,
}

export function apply(ctx, rowConfig) {
  const config = { ...DEFAULT_CONFIG, ...(rowConfig ?? {}) }

  // No workspace configured: stay activated and say so. A failed activation would
  // take the whole plugin row (and its banner in the plugins page) with it, while
  // the facade row next to it is perfectly usable.
  if (typeof config.harnessRoot !== 'string' || config.harnessRoot.trim().length === 0) {
    ctx.logger?.warn?.(
      'fusion-harness: no harnessRoot configured; the hf_* tools are not registered. ' +
        'Set config.harnessRoot on the fusion-harness row to the fusion-harness workspace.',
    )
    return () => {}
  }

  const disposers = []
  for (const definition of buildHarnessTools(config, ctx)) {
    disposers.push(ctx.tools.register(definition))
  }
  ctx.logger?.info?.(`fusion-harness: ${disposers.length} tools against ${config.harnessRoot}`)

  return () => {
    for (const dispose of disposers.splice(0).reverse()) {
      try {
        dispose()
      } catch {
        // already unregistered
      }
    }
  }
}
