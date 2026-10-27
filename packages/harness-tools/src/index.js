/**
 * DSH bundle entry: `hf` tools over the fusion-harness CLI.
 *
 * The CLI stays the single source of truth; this plugin only owns the boundary
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
  if (typeof config.harnessRoot !== 'string' || config.harnessRoot.length === 0) {
    throw new Error('fusion-harness-tools: configuration "harnessRoot" is required')
  }

  const disposers = []
  for (const definition of buildHarnessTools(config)) {
    disposers.push(ctx.tools.register(definition))
  }
  ctx.logger?.info?.(`fusion-harness-tools: ${disposers.length} tools against ${config.harnessRoot}`)

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
