/**
 * The six `hf` tools.
 *
 * Each one is a thin adapter over the CLI: no geometry logic lives here, so the
 * harness stays the single source of truth. What this layer adds is the boundary
 * — plain-name arguments, a structured result, and a failure that is impossible
 * to mistake for success.
 */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

import { assertNotShipped, assertPlainName, runHf } from './hf.js'

const requirePeer = createRequire(import.meta.url)

/**
 * `@deepseek-ai/dsh-mcp-client` is a peer: the host always has it, a bare checkout
 * and CI do not. Loading it lazily keeps the suite runnable without the host while
 * still using its canonical shape — the only path that stores images durably.
 */
function loadMcpClient() {
  try {
    return requirePeer('@deepseek-ai/dsh-mcp-client')
  } catch {
    return undefined
  }
}

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
  description: '产品目录名 under 产品/ (a plain name, no path separators).',
}

/** The PNG a run just wrote, as an absolute path (hf records it relative to the workspace). */
function artifactImage(config, result) {
  const png = (result.artifacts ?? []).find((path) => /\.png$/i.test(path))
  if (png === undefined) return undefined
  return join(config.harnessRoot, png)
}

/** Image + caption blocks, or a text block when the file cannot be read. */
function imageBlocks(path, caption) {
  try {
    return [
      { type: 'image', data: readFileSync(path).toString('base64'), mimeType: 'image/png' },
      { type: 'text', text: caption },
    ]
  } catch (error) {
    return [{ type: 'text', text: `${caption}\n(cannot read the screenshot: ${error.message})` }]
  }
}

/**
 * A tool that returns image content goes through the MCP client's canonical shape,
 * which is the only path that stores an image durably. Without a host context
 * (unit tests) it degrades to the plain text tool.
 */
function canonicalTool(config, ctx, spec) {
  const client = ctx !== undefined && ctx !== null && typeof ctx === 'object' ? loadMcpClient() : undefined
  if (client !== undefined && typeof client.createMcpToolDefinition === 'function') {
    return client.createMcpToolDefinition(ctx, spec)
  }
  return tool({
    toolName: spec.name,
    description: spec.description,
    parameters: spec.inputSchema,
    execute: async (args) => {
      const result = await spec.call(args ?? {}, {})
      const text = (result.content ?? [])
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
      return { command: spec.name, ok: true, exitCode: 0, stdout: text, stderr: '', artifacts: [] }
    },
  })
}

/**
 * Build, and by default look at the result: the shot is taken before the document
 * closes, so the model never has to guess what the geometry became.
 */
function buildTool(config, ctx) {
  return canonicalTool(config, ctx, {
    name: 'hf_build',
    rawName: 'hf_build',
    description:
      'Build 产品/<产品>/代码/build.py inside Fusion (hf build). One call does the whole cycle: it closes stale ' +
      'harness documents, opens a clean one, runs build.py, exports 模型.f3d and 外形.stl, then — unless shot:false ' +
      '— renders an iso screenshot and returns it as an image before closing the document again. Numbers come from ' +
      'the script, the picture comes from Fusion; use both.',
    inputSchema: {
      type: 'object',
      properties: {
        part: PART_PARAMETER,
        keepOpen: { type: 'boolean', description: 'Leave the Fusion document open (needed before hf_shot / hf_run).' },
        noArtifacts: { type: 'boolean', description: 'Skip exporting 模型.f3d / 外形.stl.' },
        shot: { type: 'boolean', description: 'Render an iso screenshot and return it as an image (default true).' },
      },
      required: ['part'],
      additionalProperties: false,
    },
    call: async (args) => {
      assertPlainName('part', args.part)
      const wantShot = args.shot !== false
      const argv = ['build', args.part]
      if (args.keepOpen === true || wantShot) argv.push('--keep-open')
      if (args.noArtifacts === true) argv.push('--no-artifacts')

      const built = await runHf(config, argv)
      if (!built.ok) throw new Error(failure(built))

      const blocks = []
      if (wantShot) {
        const shot = await runHf(config, [
          'shot', `build_${args.part}`, '--part', args.part, '--view', 'iso',
          '--width', '1100', '--height', '740',
        ])
        if (shot.ok) {
          const file = artifactImage(config, shot)
          if (file !== undefined) blocks.push(...imageBlocks(file, `截图（iso）：${file}`))
        } else {
          blocks.push({ type: 'text', text: `截图失败：${(shot.stderr || shot.stdout || '').slice(0, 400)}` })
        }
        if (args.keepOpen !== true) await runHf(config, ['close', args.part])
      }

      blocks.push({ type: 'text', text: renderResult(built).map((part) => part.text).join('\n') })
      return { content: blocks }
    },
  })
}

/** Screenshot the document that is open right now, from a chosen view. */
function shotTool(config, ctx) {
  return canonicalTool(config, ctx, {
    name: 'hf_shot',
    rawName: 'hf_shot',
    description:
      'Screenshot the Fusion design that is open right now and return it as an image (hf shot). Needs an open ' +
      'document — run hf_build with keepOpen:true first, or hf_run activate.',
    inputSchema: {
      type: 'object',
      properties: {
        part: PART_PARAMETER,
        view: { type: 'string', description: 'Camera view: iso (default), front, top, left, right…' },
        name: { type: 'string', description: 'File stem under 生成物/ (default view_<part>).' },
        width: { type: 'number', description: 'Pixels, default 1100.' },
        height: { type: 'number', description: 'Pixels, default 740.' },
      },
      required: ['part'],
      additionalProperties: false,
    },
    call: async (args) => {
      assertPlainName('part', args.part)
      const stem = typeof args.name === 'string' && args.name.length > 0 ? args.name : `view_${args.part}`
      const argv = ['shot', stem, '--part', args.part, '--view', typeof args.view === 'string' ? args.view : 'iso']
      if (typeof args.width === 'number') argv.push('--width', String(Math.round(args.width)))
      if (typeof args.height === 'number') argv.push('--height', String(Math.round(args.height)))

      const result = await runHf(config, argv)
      if (!result.ok) throw new Error(failure(result))
      const file = artifactImage(config, result)
      if (file === undefined) return { content: renderResult(result) }
      return { content: imageBlocks(file, `截图（${argv[4] ?? 'iso'}）：${file}`) }
    },
  })
}

export function buildHarnessTools(config, ctx) {
  return [
    tool({
      toolName: 'hf_probe',
      description:
        'Check the Fusion link and list open documents through the harness CLI (hf probe). Use it before a ' +
        'modelling step when you are unsure Fusion is reachable or what is open.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      execute: async () => invoke(config, ['probe']),
    }),
    buildTool(config, ctx),
    shotTool(config, ctx),
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
        'Regenerate the flat pattern (DXF/SVG) for a product on the host side, without Fusion (hf flat). Everything ' +
        'lands in 产品/<产品>/生成物/, which is the single working copy; 交付/ only holds the shipped evidence ' +
        '(send/), the factory drawings and dated packages — use hf_pack to make one.',
      parameters: {
        type: 'object',
        properties: {
          part: PART_PARAMETER,
        },
        required: ['part'],
        additionalProperties: false,
      },
      execute: async (args) => {
        assertPlainName('part', args.part)
        return invoke(config, ['flat', args.part], (result) => assertNotShipped(result.artifacts))
      },
    }),
    tool({
      toolName: 'hf_pack',
      description:
        'Bundle the current 产品/<产品>/生成物/ into a dated delivery package 产品/<产品>/交付/<日期>_<说明>/ plus a ' +
        '.zip (hf pack). Use it when a batch is ready to send; 交付/send itself stays a human decision.',
      parameters: {
        type: 'object',
        properties: {
          part: PART_PARAMETER,
          name: { type: 'string', description: 'Package label, e.g. 450托盘本体. Defaults to 发货.' },
          noZip: { type: 'boolean', description: 'Create the folder only, skip the .zip.' },
        },
        required: ['part'],
        additionalProperties: false,
      },
      execute: async (args) => {
        assertPlainName('part', args.part)
        const argv = ['pack', args.part]
        if (typeof args.name === 'string' && args.name.length > 0) argv.push('--name', args.name)
        if (args.noZip === true) argv.push('--no-zip')
        return invoke(config, argv, (result) => assertNotShipped(result.artifacts))
      },
    }),
    tool({
      toolName: 'hf_verify',
      description:
        'Compare a part against its expected.json and against 产品/<产品>/交付/send (hf verify). Sizes are measured ' +
        'from the generated DXF; the byte comparison ignores DXF timestamps and fingerprint GUIDs, so it says ' +
        'whether the geometry changed. PASS means the current code matches what was actually shipped.',
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
        'Scaffold a new product from templates/product (hf new): 产品/<产品>/代码/{build.py, flat.py, spec.py, ' +
        'expected.json, spec.md, notes.md}. Fill in build.py parameters afterwards, then run hf_verify.',
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
    tool({
      toolName: 'hf_model',
      description:
        'Re-export 产品/<产品>/模型.f3d from the design that is open right now (hf model). hf_build already ' +
        'exports it, so this is for the case where you changed something in Fusion and want the file refreshed: ' +
        'run hf_build with keepOpen first, otherwise there is no document to export.',
      parameters: {
        type: 'object',
        properties: { part: PART_PARAMETER },
        required: ['part'],
        additionalProperties: false,
      },
      execute: async (args) => {
        assertPlainName('part', args.part)
        return invoke(config, ['model', args.part])
      },
    }),
    tool({
      toolName: 'hf_stl',
      description:
        'Re-export 产品/<产品>/外形.stl from the design that is open right now (hf stl), binary and high ' +
        'refinement. hf_build already exports it; use this after a manual change, with hf_build keepOpen first.',
      parameters: {
        type: 'object',
        properties: { part: PART_PARAMETER },
        required: ['part'],
        additionalProperties: false,
      },
      execute: async (args) => {
        assertPlainName('part', args.part)
        return invoke(config, ['stl', args.part])
      },
    }),
    tool({
      toolName: 'hf_doc',
      description:
        'Rewrite the product documentation (hf doc): 产品/<产品>/说明.md for people (a one-paragraph summary, the ' +
        'current numbers, the folder map) and 产品/<产品>/AGENTS.md for agents (what to read, what may be edited, ' +
        'how acceptance is judged, what is off-limits). hf_build and hf_verify already refresh both, so call this ' +
        'after editing 代码/spec.md, 代码/expected.json or 代码/notes.md by hand.',
      parameters: {
        type: 'object',
        properties: { part: PART_PARAMETER },
        required: ['part'],
        additionalProperties: false,
      },
      execute: async (args) => {
        assertPlainName('part', args.part)
        return invoke(config, ['doc', args.part])
      },
    }),
  ]
}
