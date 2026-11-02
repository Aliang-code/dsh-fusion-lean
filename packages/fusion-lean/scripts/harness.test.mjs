/**
 * Tool-layer checks that need no DSH host: spawn, structured result, failure
 * pass-through, shipped-set protection, missing interpreter.
 *
 *   node scripts/harness.test.mjs [harnessRoot]
 */

import { buildHarnessTools } from '../src/harness/tools.js'

const harnessRoot = process.argv[2] ?? 'D:\\Users\\Aliang\\Desktop\\装修\\接单\\fusion-harness'
const config = { harnessRoot, python: 'python', timeoutMs: 300000 }

const tools = new Map(buildHarnessTools(config).map((tool) => [tool.name, tool]))
const call = async (name, args = {}) => {
  const tool = tools.get(name)
  if (tool === undefined) throw new Error(`no such tool ${name}`)
  return tool.execute(args, { signal: new AbortController().signal })
}

let failures = 0
const check = (label, ok, detail) => {
  if (ok) {
    console.log(`ok   ${label}`)
    return
  }
  failures += 1
  console.error(`FAIL ${label}${detail === undefined ? '' : `: ${detail}`}`)
}

// 1. A structured success.
const probe = await call('hf_probe')
check('hf_probe returns a structured result', probe.command === 'probe' && probe.ok === true && probe.exitCode === 0)
check('hf_probe output mentions the server', /MCP Server Adapter/.test(probe.stdout), probe.stdout.slice(0, 80))

// 2. Acceptance check runs and reports a verdict.
const verify = await call('hf_verify', { part: 'rack_shelf_1u' })
check('hf_verify passes on an existing part', verify.ok === true && /PASS/.test(verify.stdout))

// 3. Traversal into a shipped set is refused before anything runs.
let refused = false
try {
  await call('hf_flat', { part: '../deliveries/450/send' })
} catch (error) {
  refused = /plain name|refused|AUTHORITY/.test(String(error.message))
}
check('path traversal is refused before spawn', refused)

// 4. A non-zero exit becomes a tool failure carrying the code and diagnostics.
let failed = null
try {
  await call('hf_build', { part: 'no_such_part' })
} catch (error) {
  failed = String(error.message)
}
check('unknown part fails the tool call', failed !== null && /exit code 1/.test(failed), failed ?? 'no error')
check('failure carries the CLI diagnosis', failed !== null && /no such part/.test(failed), failed ?? 'no error')

// 5. A missing interpreter is reported as such, not as a generic failure.
const brokenConfig = { ...config, python: 'definitely-not-python-xyz' }
const brokenTool = buildHarnessTools(brokenConfig).find((tool) => tool.name === 'hf_probe')
let missing = null
try {
  await brokenTool.execute({}, { signal: new AbortController().signal })
} catch (error) {
  missing = String(error.message)
}
check('missing interpreter is explained', missing !== null && /No usable Python interpreter/.test(missing), missing ?? 'no error')

// 6. Non-ASCII plus a space must survive argv and the JSON result unchanged.
let chinese = null
try {
  await call('hf_build', { part: '中文零件 带空格' })
} catch (error) {
  chinese = String(error.message)
}
check(
  'non-ASCII argv survives the whole chain',
  chinese !== null && chinese.includes('中文零件 带空格'),
  chinese ?? 'no error',
)

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nall tool-layer checks pass')
