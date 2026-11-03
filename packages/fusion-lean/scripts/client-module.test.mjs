/**
 * Drive the client half without a browser.
 *
 *   node scripts/client-module.test.mjs
 *
 * Captures the lazy factory registered on `window.__ModuleLoader__`, runs it with
 * a stub React table, then calls `apply` against a fake client context and checks
 * exactly which slot it occupies. This catches the failure modes a browser
 * console would show: wrong factory shape, a throwing `apply`, a wrong slot or
 * cell key.
 */

const captured = []
globalThis.window = {
  __ModuleLoader__: {
    load: (definition) => {
      captured.push(definition)
    },
  },
}

await import('../lib/client.js')

let failures = 0
const check = (label, ok, detail) => {
  if (ok) {
    console.log(`ok   ${label}`)
    return
  }
  failures += 1
  console.error(`FAIL ${label}${detail === undefined ? '' : `: ${detail}`}`)
}

import { readFileSync } from 'node:fs'

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

check('the module registered one lazy factory', captured.length === 1, String(captured.length))
const definition = captured[0]
check('the factory id is the package name', definition?.id === manifest.name, String(definition?.id))

const React = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: (initial) => [initial, () => {}],
  useCallback: (fn) => fn,
  useEffect: () => {},
}
const require = (name) => {
  if (name === 'react') return React
  throw new Error(`unexpected require(${name})`)
}

let exported
try {
  exported = definition.factory(require)
} catch (error) {
  check('the factory runs', false, error instanceof Error ? error.message : String(error))
}

if (exported !== undefined) {
  check('the factory returns { inject, apply }', typeof exported.apply === 'function' && Array.isArray(exported.inject), JSON.stringify(Object.keys(exported ?? {})))
  check('inject names the slot and locale services', Array.isArray(exported.inject) && exported.inject.includes('slots') && exported.inject.includes('locale'), JSON.stringify(exported.inject))

  const registrations = []
  const effects = []
  const ctx = {
    effect: (factory, label) => {
      effects.push(label)
      const dispose = factory()
      return typeof dispose === 'function' ? dispose : undefined
    },
    locale: { register: (ns, dictionaries) => { registrations.push({ kind: 'locale', ns, keys: Object.keys(dictionaries) }); return () => {} } },
    slots: {
      inject: (slot, factory) => { effects.push(`inject:${slot}`); const dispose = factory(); return typeof dispose === 'function' ? dispose : undefined },
      register: (options, component) => { registrations.push({ kind: 'slot', options, component }); return () => {} },
    },
  }

  try {
    exported.apply(ctx)
    check('apply runs without throwing', true)
  } catch (error) {
    check('apply runs without throwing', false, error instanceof Error ? error.message : String(error))
  }

  const slots = registrations.filter((entry) => entry.kind === 'slot')
  check('apply registers two slot occupants', slots.length === 2, String(slots.length))
  check('both sit in settings.general.item', slots.every((slot) => slot.options?.name === 'settings.general.item'), JSON.stringify(slots.map((slot) => slot.options?.name)))
  check(
    'the endpoint row is registered',
    slots.some((slot) => slot.options?.id === 'fusion-lean-endpoint'),
    JSON.stringify(slots.map((slot) => slot.options?.id)),
  )
  check(
    'the workspace row is registered',
    slots.some((slot) => slot.options?.id === 'fusion-harness-workspace'),
    JSON.stringify(slots.map((slot) => slot.options?.id)),
  )
  check('both occupants are components', slots.every((slot) => typeof slot.component === 'function'))

  const locale = registrations.find((entry) => entry.kind === 'locale')
  check('the dictionaries cover zh and en', locale !== undefined && locale.keys.length === 2, JSON.stringify(locale?.keys))
}

// The client-module scanner reads the manifest through `pkg/package.json`; a
// package whose `exports` hides that subpath is silently classified as "not a
// client package", which is exactly how a UI row disappears with no error.
{
  const { readFileSync } = await import('node:fs')
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  check('exports exposes ./package.json', manifest.exports?.['./package.json'] === './package.json', JSON.stringify(manifest.exports))
  check('exports exposes ./client', typeof manifest.exports?.['./client'] === 'string', JSON.stringify(manifest.exports))
  check('dsh.client targets the web platform', manifest.dsh?.client?.platform === 'web', JSON.stringify(manifest.dsh?.client))
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nall client-module checks pass')
