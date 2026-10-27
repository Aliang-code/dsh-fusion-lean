/**
 * The model-visible tool surface.
 *
 * Four upstream tools keep their identity and their exact schemas; only their
 * always-on descriptions shrink. Everything a call needs to be shaped correctly
 * stays in the description or the schema — the exhaustive upstream prose is
 * fetched by `fusion_help` when it is actually needed.
 */

import { escapeForTransport, restoreToolResult } from './codec.js'

/** Upstream tool name -> the public name the model sees. */
export const PUBLIC_NAMES = {
  fusion_mcp_read: 'fusion_read',
  fusion_mcp_execute: 'fusion_execute',
  fusion_mcp_update: 'fusion_update',
  fusion_mcp_electronics_read: 'fusion_electronics_read',
}

export const PUBLIC_TO_RAW = new Map(Object.entries(PUBLIC_NAMES).map(([raw, pub]) => [pub, raw]))
export const PUBLIC_TOOLS = [...PUBLIC_TO_RAW.keys()]

/**
 * Always-on descriptions: routing facts only. Keep them short — every byte here
 * is paid on every request, which is the whole point of this bundle.
 */
export const SHORT = {
  fusion_read:
    'Read the active Fusion design. `entity_type` returns rows of one class ' +
    '(Board, Package, Part, Element, Net, Signal, Pin, Smd, Via, ...); `queryType` selects a ' +
    'different query instead - apiDocumentation, licensing, screenshot (PNG of the graphics ' +
    'view), document (search/open/recent), projects, activeCommand. `object` holds ' +
    'fields/filters/pagination; omit it for every row and column. Per-class property lists, ' +
    'filter operators and worked examples: fusion_help({tool:"fusion_read"}).',
  fusion_execute:
    'Act on the active Fusion design. featureType "script" runs a Python body defining ' +
    '`run(_context)` inside Fusion (pass readOnly:true only when it changes nothing); ' +
    '"document" opens/closes/saves the active document; "purchase" opens the in-app purchase ' +
    'manager; "editImage" renders a model screenshot into a described scene; ' +
    '"generatePowerpoint" builds a .pptx from a slide schema. Each featureType has required ' +
    'fields and preconditions: read fusion_help({tool:"fusion_execute"}) before the first call ' +
    'of a feature type not yet used in this session. Closing a document and opening the ' +
    'purchase manager each require one confirmation.',
  fusion_update:
    'Undo or redo the most recent committed operation in the active document: ' +
    'featureType "undo" or "redo". Fails while an interactive command dialog is open.',
  fusion_electronics_read:
    'Read Electronics design data by entity class (schematic, board, library, packages, pads, ' +
    'signals ...). `entity_type` selects the class, optional `object` supplies ' +
    'fields/filters/pagination, and per-class schema resources are documented upstream. ' +
    'Requires an active Electronics document. Full class list and examples: ' +
    'fusion_help({tool:"fusion_electronics_read"}).',
}

const HELP_DESCRIPTION =
  'Return the verbatim upstream documentation and input schema of one Fusion tool. The Fusion ' +
  'tools carry several pages of parameter and precondition text that is only needed the first ' +
  'time a capability is used, so it is loaded on demand instead of sitting in every request. ' +
  'Call this before a feature type whose arguments you are unsure about.'

const STATUS_DESCRIPTION =
  'Report the Fusion MCP connection: endpoint, reachability, upstream server identity, tool ' +
  'counts, call and redial counters, the last transport error, and whether the upstream tool ' +
  'schemas still match the bundled snapshot. Use it when a Fusion call fails, after Fusion was ' +
  'restarted, or before planning a modelling step.'

/** Normalise a snapshot asset to `{ capturedAt, serverInfo, tools[] }`. */
export function normalizeSnapshot(asset) {
  if (Array.isArray(asset)) return { capturedAt: null, serverInfo: null, tools: asset }
  if (asset !== null && typeof asset === 'object' && Array.isArray(asset.tools)) return asset
  throw new Error('fusion-lean: assets/fusion-tools.json is neither a tool array nor a snapshot object')
}

function prepareArguments(rawName, args) {
  if (rawName !== 'fusion_mcp_execute') return args
  if (args === null || typeof args !== 'object') return args
  const object = args.object
  if (object === null || typeof object !== 'object' || typeof object.script !== 'string') return args
  const script = escapeForTransport(object.script)
  if (script === object.script) return args
  return { ...args, object: { ...object, script } }
}

/**
 * Forward one upstream tool. `connection.call` owns dialling and retries; this
 * wrapper owns only the transport-encoding boundary in both directions.
 */
function forward(connection, rawName) {
  return async (args, exec) => {
    const result = await connection.call(rawName, prepareArguments(rawName, args), exec)
    return restoreToolResult(result)
  }
}

function textTool({ toolName, description, parameters, execute }) {
  return {
    name: toolName,
    description,
    parameters,
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [
        { type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) },
      ],
    },
    execute,
  }
}

export function buildHelpTool(snapshot) {
  const byRaw = new Map(snapshot.tools.map((tool) => [tool.name, tool]))
  return textTool({
    toolName: 'fusion_help',
    description: HELP_DESCRIPTION,
    parameters: {
      type: 'object',
      properties: {
        tool: {
          type: 'string',
          enum: PUBLIC_TOOLS,
          description: 'The Fusion tool whose upstream documentation should be returned.',
        },
      },
      required: ['tool'],
      additionalProperties: false,
    },
    execute: async (args) => {
      const publicName = args !== null && typeof args === 'object' && typeof args.tool === 'string' ? args.tool : ''
      const rawName = PUBLIC_TO_RAW.get(publicName)
      if (rawName === undefined) return `Unknown tool "${publicName}". Available: ${PUBLIC_TOOLS.join(', ')}.`
      const tool = byRaw.get(rawName)
      if (tool === undefined) return `No bundled documentation for "${publicName}".`
      const blocks = [
        `# ${publicName} (upstream name: ${rawName})`,
        '',
        tool.description ?? '(upstream sent no description)',
        '',
        '## Input schema',
        '```json',
        JSON.stringify(tool.inputSchema ?? {}, null, 2),
        '```',
      ]
      if (tool.outputSchema !== undefined) {
        blocks.push('', '## Output schema', '```json', JSON.stringify(tool.outputSchema, null, 2), '```')
      }
      return blocks.join('\n')
    },
  })
}

export function buildStatusTool(connection, extras) {
  return textTool({
    toolName: 'fusion_status',
    description: STATUS_DESCRIPTION,
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    execute: async () => {
      const extra = typeof extras === 'function' ? extras() : (extras ?? {})
      return JSON.stringify(await connection.statusReport(extra), null, 2)
    },
  })
}

export function buildDoctorTool(problem) {
  return textTool({
    toolName: 'fusion_doctor',
    description:
      'Report why the Fusion tools could not be registered: the missing or incompatible harness ' +
      'adapter, the bundle version, and what to check next.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    execute: async () => JSON.stringify(problem, null, 2),
  })
}

/**
 * Register the four upstream tools through the harness' own MCP adapter, so
 * screenshot images, `isError` handling, cancellation and output-schema
 * validation behave exactly as they do for a plain MCP server.
 */
export function registerUpstreamTools(ctx, adapter, connection, snapshot) {
  const byRaw = new Map(snapshot.tools.map((tool) => [tool.name, tool]))
  const disposers = []
  for (const [rawName, publicName] of Object.entries(PUBLIC_NAMES)) {
    const tool = byRaw.get(rawName)
    if (tool === undefined) {
      ctx.logger?.warn?.(`fusion-lean: snapshot has no "${rawName}"; that tool is not registered`)
      continue
    }
    disposers.push(
      ctx.tools.register(
        adapter.createMcpToolDefinition(ctx, {
          name: publicName,
          rawName,
          description: SHORT[publicName],
          inputSchema: tool.inputSchema,
          outputSchema: tool.outputSchema,
          call: forward(connection, rawName),
        }),
      ),
    )
  }
  return disposers
}
