/**
 * Tool-layer checks that need no DSH host: spawn, structured result, failure
 * pass-through, shipped-set protection, missing interpreter.
 *
 *   node scripts/harness.test.mjs [harnessRoot]
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { buildHarnessTools } from '../src/harness/tools.js'

const harnessRoot = process.argv[2] ?? process.env.FUSION_HARNESS_ROOT ?? ''
if (harnessRoot === '' || !existsSync(join(harnessRoot, 'tools', 'hf.py'))) {
  console.log('skip: no fusion-harness workspace (pass it as the first argument or set FUSION_HARNESS_ROOT)')
  process.exit(0)
}
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

// 3. Traversal into a shipped set is refused before anything runs. The guard
// matches any path segment named `send`, so it covers both the old layout
// (deliveries/<type>/send) and the product layout (产品/<产品>/交付/send).
for (const probe of ['../deliveries/450/send', '../产品/rack_shelf_650/交付/send']) {
  let refused = false
  try {
    await call('hf_flat', { part: probe })
  } catch (error) {
    refused = /plain name|refused|AUTHORITY/.test(String(error.message))
  }
  check(`path traversal is refused before spawn: ${probe}`, refused)
}

// 3b. The three file-facing tools exist and hf_doc rewrites the product readme.
const names = [...tools.keys()]
for (const name of ['hf_model', 'hf_stl', 'hf_doc', 'hf_shot', 'hf_pack']) {
  check(`the tool set includes ${name}`, names.includes(name), names.join(','))
}
const doc = await call('hf_doc', { part: 'rack_shelf_1u' })
check('hf_doc rewrites 说明.md', doc.ok === true && /说明\.md/.test(doc.stdout), doc.stdout.slice(0, 120))

// 4. A non-zero exit becomes a tool failure carrying the code and diagnostics.
let failed = null
try {
  await call('hf_build', { part: 'no_such_part' })
} catch (error) {
  failed = String(error.message)
}
check('unknown part fails the tool call', failed !== null && /exit code 1/.test(failed), failed ?? 'no error')
check('failure carries the CLI diagnosis', failed !== null && /no such (part|product)/.test(failed), failed ?? 'no error')

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
