/**
 * Codec round-trip vectors.
 *
 *   node scripts/codec.test.mjs
 *
 * Exits non-zero on the first mismatch. The "wire" simulation reproduces what
 * the endpoint actually does: take the UTF-8 bytes of a string and decode them
 * as latin-1.
 */

import { escapeForTransport, restoreFromTransport } from '../src/codec.js'

const mojibake = (text) => Buffer.from(text, 'utf8').toString('latin1')

const vectors = [
  ['pure ascii', 'run(_context): pass'],
  ['pure chinese', '中文测试'],
  ['mixed', 'BODY_W = 428.0  // 外宽，单位毫米'],
  ['surrogate pair', '✅ 完成 🎉'],
  ['already escaped', '\\u4e2d\\u6587'],
]

let failures = 0

for (const [label, text] of vectors) {
  const escaped = escapeForTransport(text)

  if (Buffer.byteLength(escaped, 'ascii') !== escaped.length) {
    console.error(`FAIL ${label}: escape left non-ASCII bytes`)
    failures += 1
    continue
  }

  // ASCII-only input must not be rewritten at all.
  if (/^[\x00-\x7F]*$/.test(text) && escaped !== text) {
    console.error(`FAIL ${label}: escape rewrote pure ASCII`)
    failures += 1
    continue
  }

  const restored = restoreFromTransport(mojibake(text))
  if (restored !== text) {
    console.error(`FAIL ${label}: restore gave ${JSON.stringify(restored)}`)
    failures += 1
    continue
  }

  // Already valid text must survive the reverse direction unchanged.
  if (restoreFromTransport(text) !== text) {
    console.error(`FAIL ${label}: restore rewrote already-correct text`)
    failures += 1
    continue
  }

  console.log(`ok   ${label}: ${JSON.stringify(escaped).slice(0, 64)}${escaped.length > 64 ? '…' : ''}`)
}

// Lossy text (a replacement character) must be left alone rather than mangled twice.
const lossy = '\uFFFD\u4E2D'
if (restoreFromTransport(lossy) !== lossy) {
  console.error('FAIL lossy text: restore should leave unrecoverable text untouched')
  failures += 1
} else {
  console.log('ok   lossy text is left untouched')
}

if (failures > 0) {
  console.error(`\n${failures} vector(s) failed`)
  process.exit(1)
}
console.log('\nall codec vectors pass')
