/**
 * One-shot confirmation in front of the only irreversible or billable calls in
 * the Fusion surface.
 *
 * DSH's permission presets cover the sandboxed file/shell tools; MCP tools never
 * reach the approval seam on their own. Meanwhile the upstream tool asks the
 * model to set `userConfirmedCloseWithoutSave` / `userConfirmedOpenPurchaseManager`
 * — booleans the model fills in itself and nothing can verify. This gate moves
 * that confirmation to an actual decision.
 *
 * Scope is deliberately narrow: `document.close` and `purchase`, nothing else.
 * A modelling session hits those zero or one time, so there is no policy switch
 * to configure.
 */

/** The tool whose arguments carry the irreversible actions. */
export const GATED_TOOL = 'fusion_execute'

/**
 * Decide whether one call needs a human decision first.
 *
 * @param {unknown} args parsed tool arguments.
 * @returns {undefined | { reason: string, displayReason: { en: string, zh: string } }}
 */
export function decideDestructive(args) {
  if (args === null || typeof args !== 'object') return undefined
  const featureType = typeof args.featureType === 'string' ? args.featureType : ''
  const object = args.object !== null && typeof args.object === 'object' ? args.object : {}

  if (featureType === 'purchase') {
    const interest = typeof object.purchaseInterest === 'string' ? object.purchaseInterest : 'a commercial option'
    return {
      reason: `opens the in-app Purchase Manager (${interest})`,
      displayReason: {
        en: `Open the in-app Purchase Manager (${interest})? Nothing is bought by opening it, but it is a commercial surface the user should see first.`,
        zh: `要打开内置购买管理器（${interest}）吗？打开本身不会成交，但这是应当先由用户知情的商业入口。`,
      },
    }
  }

  if (featureType === 'document' && object.operation === 'close') {
    const saves = object.userConfirmedSaveAndClose === true
    return {
      reason: saves ? 'closes the active document after saving it' : 'closes the active document without saving',
      displayReason: {
        en: saves
          ? 'Save and close the active document? This overwrites the document on disk.'
          : 'Close the active document without saving? Unsaved changes will be lost and cannot be undone.',
        zh: saves
          ? '保存并关闭当前文档？这会覆盖磁盘上的文档。'
          : '不保存就关闭当前文档？未保存的修改会丢失，且无法撤销。',
      },
    }
  }

  return undefined
}

/**
 * Register the gate. Listeners that are not ours pass straight through with
 * `next()`, and the registry turns a missing approval answerer into a denial,
 * which is the behaviour we want.
 */
export function registerGuard(ctx) {
  return ctx.on('tools/pre-execute', async (exec, next) => {
    if (exec?.name !== GATED_TOOL) return next()
    const verdict = decideDestructive(exec.arguments)
    if (verdict === undefined) return next()
    return { kind: 'ask', reason: verdict.reason, displayReason: verdict.displayReason }
  })
}
