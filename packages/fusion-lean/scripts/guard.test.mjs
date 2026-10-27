/**
 * Decision table for the irreversible-action gate.
 *
 *   node scripts/guard.test.mjs
 *
 * Exits non-zero when any case disagrees with the spec: only `document.close`
 * and `purchase` may ask; everything else passes straight through.
 */

import { decideDestructive } from '../src/guard.js'

const cases = [
  ['script run', { featureType: 'script', object: { script: 'pass', readOnly: false } }, false],
  ['script read-only', { featureType: 'script', object: { script: 'pass', readOnly: true } }, false],
  ['document open', { featureType: 'document', object: { operation: 'open', fileId: 'f1' } }, false],
  ['document save', { featureType: 'document', object: { operation: 'save' } }, false],
  ['document close', { featureType: 'document', object: { operation: 'close' } }, true],
  ['document close with save', { featureType: 'document', object: { operation: 'close', userConfirmedSaveAndClose: true } }, true],
  ['document close discard', { featureType: 'document', object: { operation: 'close', userConfirmedCloseWithoutSave: true } }, true],
  ['purchase', { featureType: 'purchase', object: { purchaseInterest: 'flex', userConfirmedOpenPurchaseManager: true } }, true],
  ['editImage', { featureType: 'editImage', object: { prompt: 'make it wood' } }, false],
  ['generatePowerpoint', { featureType: 'generatePowerpoint', object: { slides_json: '[]' } }, false],
  ['previewImage', { featureType: 'previewImage', object: { action: 'preview' } }, false],
  ['no arguments', undefined, false],
  ['unknown featureType', { featureType: 'something-new', object: {} }, false],
]

let failures = 0

for (const [label, args, expectsAsk] of cases) {
  const verdict = decideDestructive(args)
  const asks = verdict !== undefined
  if (asks !== expectsAsk) {
    console.error(`FAIL ${label}: expected ${expectsAsk ? 'ask' : 'allow'}, got ${asks ? 'ask' : 'allow'}`)
    failures += 1
    continue
  }
  if (asks) {
    const hasCopy = typeof verdict.reason === 'string' && verdict.reason.length > 0 &&
      typeof verdict.displayReason?.en === 'string' && typeof verdict.displayReason?.zh === 'string'
    if (!hasCopy) {
      console.error(`FAIL ${label}: ask is missing reason/displayReason copy`)
      failures += 1
      continue
    }
    console.log(`ok   ${label}: ask — ${verdict.reason}`)
    continue
  }
  console.log(`ok   ${label}: allow`)
}

if (failures > 0) {
  console.error(`\n${failures} case(s) failed`)
  process.exit(1)
}
console.log('\nall gate cases pass')
