/**
 * The six `hf` tools.
 *
 * Each one is a thin adapter over the CLI: no geometry logic lives here, so the
 * harness stays the single source of truth. What this layer adds is the boundary
 * — plain-name arguments, a structured result, and a failure that is impossible
 * to mistake for success.
 */

import { assertNotShipped, assertPlainName, runHf } from './hf.js'

const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    command: { type: 'string' },
    ok: { type: 'boolean' },
    exitCode: { type: 'number' },
    stdout: { type: 'string' },
    stderr: { type: 'string' },
    artifacts: { type: 'array', items: { type: 'string' } },
    root: { type: 'string' },
  },
  required: ['command', 'ok', 'exitCode', 'stdout', 'stderr', 'artifacts'],
  additionalProperties: true,
}

function renderResult(value) {
  const lines = []
  const head = `${value.ok ? 'ok' : 'failed'}: hf ${value.command} (exit ${value.exitCode})`
  lines.push(head)
  if (value.stdout !== undefined && value.stdout.trim().length > 0) lines.push('', value.stdout.trimEnd())
  if (value.stderr !== undefined && value.stderr.trim().length > 0) lines.push('', 'stderr:', value.stderr.trimEnd())
  if (Array.isArray(value.artifacts) && value.artifacts.length > 0) {
    lines.push('', 'artifacts:')
    for (const artifact of value.artifacts) lines.push(`  ${artifact}`)
  }
  return [{ type: 'text', text: lines.join('\n') }]
}

function failure(result) {
  const parts = [`hf ${result.command} failed with exit code ${result.exitCode}`]
  if (result.spawnError !== undefined) {
    parts.push(`spawn error: ${result.spawnError}`)
    if (/ENOENT|not recognized|no such file/i.test(String(result.spawnError))) {
      parts.push(
        'No usable Python interpreter was found. Set the bundle configuration "python" to an executable ' +
          '(for example "python", "py" with args ["-3"], or an absolute interpreter path).',
      )
    }
  }
  if (result.timedOut) parts.push('the run was killed after the configured timeout')
  if (result.stderr !== undefined && result.stderr.trim().length > 0) parts.push(`stderr:\n${result.stderr.trim()}`)
  if (result.stdout !== undefined && result.stdout.trim().length > 0) parts.push(`stdout:\n${result.stdout.trim()}`)
  if (Array.isArray(result.artifacts) && result.artifacts.length > 0) {
    parts.push(`artifacts written before failure:\n${result.artifacts.map((a) => `  ${a}`).join('\n')}`)
  }
  return parts.join('\n\n')
}

async function invoke(config, argv, checks) {
  const result = await runHf(config, argv)
  if (checks !== undefined) checks(result)
  if (!result.ok) throw new Error(failure(result))
  return result
}

function tool({ toolName, description, parameters, execute }) {
  return {
    name: toolName,
    description,
    parameters,
    output: { schema: RESULT_SCHEMA, render: (_args, value) => renderResult(value) },
    async execute(args, exec) {
      if (exec?.signal?.aborted) throw new Error('cancelled before dispatch')
      return execute(args ?? {}, exec)
    },
  }
}

const PART_PARAMETER = {
  type: 'string',
  description: 'Part directory name under parts/ (a plain name, no path separators).',
}

export function buildHarnessTools(config) {
  return [
    tool({
      toolName: 'hf_probe',
      description:
        'Check the Fusion link and list open documents through the harness CLI (hf probe). Use it before a ' +
        'modelling step when you are unsure Fusion is reachable or what is open.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      execute: async () => invoke(config, ['probe']),
    }),
    tool({
      toolName: 'hf_build',
      description:
        'Send parts/<part>/build.py into Fusion and return what Fusion reported (hf build). This is the only ' +
        'supported way to change geometry: build.py owns the parameters and the feature history.',
      parameters: {
        type: 'object',
        properties: { part: PART_PARAMETER },
        required: ['part'],
        additionalProperties: false,
      },
      execute: async (args) => {
        assertPlainName('part', args.part)
        return invoke(config, ['build', args.part], (result) => assertNotShipped(result.artifacts))
      },
    }),
    tool({
      toolName: 'hf_run',
      description:
        'Run one of scripts/<script>.py inside Fusion (hf run). Use it for inspection scripts such as check or ' +
        'clean; changes that belong to a part still go through hf_build.',
      parameters: {
        type: 'object',
        properties: {
          script: { type: 'string', description: 'Script name under scripts/ (without .py is fine).' },
          part: { type: 'string', description: 'Optional part context passed to the script.' },
          view: { type: 'string', description: 'Optional view name passed to the script.' },
        },
        required: ['script'],
        additionalProperties: false,
      },
      execute: async (args) => {
        assertPlainName('script', args.script)
        if (args.part !== undefined) assertPlainName('part', args.part)
        const argv = ['run', args.script]
        if (args.part !== undefined) argv.push('--part', args.part)
        if (args.view !== undefined) argv.push('--view', args.view)
        return invoke(config, argv, (result) => assertNotShipped(result.artifacts))
      },
    }),
    tool({
      toolName: 'hf_flat',
      description:
        'Regenerate the flat pattern (DXF/SVG) for a part on the host side, without Fusion (hf flat). Writes ' +
        'under build/ by default; deliver:true writes deliveries/<type>/dxf|drawings and never the shipped set.',
      parameters: {
        type: 'object',
        properties: {
          part: PART_PARAMETER,
          deliver: { type: 'boolean', description: 'Write into deliveries/<type>/dxf|drawings instead of build/.' },
        },
        required: ['part'],
        additionalProperties: false,
      },
      execute: async (args) => {
        assertPlainName('part', args.part)
        const argv = ['flat', args.part]
        if (args.deliver === true) argv.push('--deliver')
        return invoke(config, argv, (result) => assertNotShipped(result.artifacts))
      },
    }),
    tool({
      toolName: 'hf_verify',
      description:
        'Compare a part against its expected.json and the shipped DXF byte-for-byte (hf verify). This is the ' +
        'acceptance check: PASS means geometry and delivered files agree.',
      parameters: {
        type: 'object',
        properties: {
          part: PART_PARAMETER,
          noBytes: { type: 'boolean', description: 'Skip the byte-for-byte DXF comparison.' },
        },
        required: ['part'],
        additionalProperties: false,
      },
      execute: async (args) => {
        assertPlainName('part', args.part)
        const argv = ['verify', args.part]
        if (args.noBytes === true) argv.push('--no-bytes')
        return invoke(config, argv)
      },
    }),
    tool({
      toolName: 'hf_new',
      description:
        'Scaffold a new part directory from templates/part (hf new). Fill in build.py parameters afterwards, ' +
        'then run hf_verify.',
      parameters: {
        type: 'object',
        properties: {
          part: PART_PARAMETER,
          sku: { type: 'string', description: 'SKU written into the scaffold.' },
          delivery: { type: 'string', description: 'Delivery directory name written into expected.json.' },
        },
        required: ['part'],
        additionalProperties: false,
      },
      execute: async (args) => {
        assertPlainName('part', args.part)
        if (args.delivery !== undefined) assertPlainName('delivery', args.delivery)
        const argv = ['new', args.part]
        if (args.sku !== undefined) argv.push('--sku', args.sku)
        if (args.delivery !== undefined) argv.push('--delivery', args.delivery)
        return invoke(config, argv, (result) => assertNotShipped(result.artifacts))
      },
    }),
  ]
}
