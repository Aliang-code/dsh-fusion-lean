/**
 * Drift detection: the digest must ignore property order (the endpoint's order is
 * not a contract) and must change when a real schema change happens.
 *
 *   node scripts/drift.test.mjs
 */

import { readFileSync } from 'node:fs'

import { schemaDigest } from '../src/digest.js'

function check(label, ok) {
  if (ok) {
    console.log(`ok   ${label}`)
    return true
  }
  console.error(`FAIL ${label}`)
  return false
}

let passed = 0
let failed = 0
const assert = (label, ok) => {
  if (check(label, ok)) passed += 1
  else failed += 1
}

const schema = {
  type: 'object',
  properties: {
    entity_type: { type: 'string', enum: ['a', 'b', 'c'], description: 'class' },
    object: { type: 'object', properties: { fields: { type: 'array', items: { type: 'string' } } } },
  },
  required: ['entity_type'],
}

// Same structure, different key order — must hash identically.
const reordered = {
  required: ['entity_type'],
  properties: {
    object: { properties: { fields: { items: { type: 'string' }, type: 'array' } }, type: 'object' },
    entity_type: { description: 'class', enum: ['a', 'b', 'c'], type: 'string' },
  },
  type: 'object',
}
assert('key order does not change the digest', schemaDigest(schema) === schemaDigest(reordered))

// A real change must change the digest.
const changedEnum = JSON.parse(JSON.stringify(schema))
changedEnum.properties.entity_type.enum.push('d')
assert('an added enum value changes the digest', schemaDigest(schema) !== schemaDigest(changedEnum))

const changedDescription = JSON.parse(JSON.stringify(schema))
changedDescription.properties.entity_type.description = 'row class'
assert('a changed description changes the digest', schemaDigest(schema) !== schemaDigest(changedDescription))

// The bundled snapshot must agree with its own digests (self-consistency).
const asset = JSON.parse(readFileSync(new URL('../assets/fusion-tools.json', import.meta.url), 'utf8'))
const mismatched = asset.tools.filter((tool) => tool.digest !== schemaDigest(tool.inputSchema))
assert(
  `snapshot digests are self-consistent (${asset.tools.length} tools)`,
  mismatched.length === 0,
)
if (mismatched.length > 0) console.error(`  stale digests: ${mismatched.map((tool) => tool.name).join(', ')}`)

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log(`\nall ${passed} drift checks pass`)
