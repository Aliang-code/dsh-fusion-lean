/**
 * Canonical schema digests.
 *
 * Two JSON spellings of the same schema must hash the same: the endpoint's
 * property order is not a contract, and the SDK's parse and a fresh `fetch` can
 * disagree on it. So keys are sorted recursively before hashing.
 */

import { createHash } from 'node:crypto'

/** Deterministic JSON: object keys sorted, arrays kept in order. */
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null)
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`
  const keys = Object.keys(value).sort()
  const members = keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
  return `{${members.join(',')}}`
}

/** SHA-256 over the canonical form of one tool input schema. */
export function schemaDigest(schema) {
  return createHash('sha256').update(canonicalJson(schema ?? null)).digest('hex')
}
