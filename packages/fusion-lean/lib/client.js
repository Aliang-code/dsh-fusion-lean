/**
 * Web half: the row's settings page.
 *
 * The harness shows no form for a plugin Config on its own, so this module fills
 * the `plugins.row.config` seat the plugin manager reserves for the row
 * `@local/dsh-fusion-lean#fusion-lean`. It talks to the host route
 * `/fusion-lean/config`, which persists through `configEditor` and reloads the
 * row, so editing the port here is the same as editing `cordis.patch.yml`.
 */

window.__ModuleLoader__.load({
  id: '@local/dsh-fusion-lean',
  factory: (require) => {
    const React = require('react')

    const ROW_ID = 'fusion-lean-endpoint'
    const ROUTE = '/fusion-lean/config'
    const STATUS_ROUTE = '/fusion-lean/client-status'
    const WORKSPACE_ROUTE = '/fusion-lean/workspace'
    const NS = 'fusion-lean'
    const inject = ['slots', 'locale']

    // The browser console is not reachable from the host, so the module reports
    // its own boot state to a loopback-only route. Without this, "no row" cannot
    // be told apart from "module never loaded".
    const beacon = (stage, message) => {
      if (typeof fetch !== 'function') return
      try {
        fetch(STATUS_ROUTE, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ stage, ...(message === undefined ? {} : { message }) }),
        }).catch(() => {})
      } catch {
        // reporting must never break the page
      }
    }
    beacon('loaded')

    // For essentially everyone the endpoint is 127.0.0.1:<port>/mcp, so the form
    // asks for the port and keeps the two rare overrides behind 高级. `host` and
    // `path` stay configurable in `cordis.patch.yml`, they just don't earn a field.
    const primaryFields = [{ key: 'port', labelKey: 'config.port', kind: 'number', hint: '27182' }]
    const advancedFields = [
      { key: 'url', labelKey: 'config.url', kind: 'text', hint: 'http://127.0.0.1:27182/mcp' },
      { key: 'toolCallTimeoutMs', labelKey: 'config.timeout', kind: 'number', hint: '120000' },
    ]

    const dictionaries = {
      zh: {
        'config.title': 'Fusion MCP 端点',
        'config.help': '只改端口就行。host 与 path 默认 127.0.0.1 与 /mcp，需要时在 cordis.patch.yml 里改。保存后需重启 DSH 生效。',
        'config.port': '端口',
        'config.url': '完整 URL',
        'config.timeout': '超时（毫秒）',
        'config.advanced': '高级设置',
        'config.endpoint': '当前端点',
        'config.save': '保存',
        'config.saving': '保存中…',
        'config.saved': '已保存（重启 DSH 后生效）',
        'config.loading': '读取中…',
        'config.error': '无法读取或保存配置',
        'workspace.title': 'Fusion 工作区',
        'workspace.help': 'hf_* 工具（probe / build / flat / verify）需要 fusion-harness 工作区的根目录。留空则只启用 MCP 工具面。',
        'workspace.placeholder': 'D:\\work\\fusion-harness',
        'workspace.save': '保存',
        'workspace.saving': '保存中…',
        'workspace.saved': '已保存（重启 DSH 后生效）',
        'workspace.unset': '未配置：仅 MCP 工具可用',
        'workspace.ok': '已找到 tools/hf.py',
        'workspace.missing': '该目录下没有 tools/hf.py',
        'workspace.error': '无法读取或保存工作区',
        'workspace.warnNoScript': '已保存，但没找到 tools/hf.py（hf_* 会失败）',
      },
      en: {
        'config.title': 'Fusion MCP endpoint',
        'config.help': 'The port is all you normally need; host and path default to 127.0.0.1 and /mcp and can be set in cordis.patch.yml. Restart DSH to apply.',
        'config.port': 'Port',
        'config.url': 'Full URL',
        'config.timeout': 'Timeout (ms)',
        'config.advanced': 'Advanced',
        'config.endpoint': 'Current endpoint',
        'config.save': 'Save',
        'config.saving': 'Saving…',
        'config.saved': 'Saved — restart DSH to apply',
        'config.loading': 'Loading…',
        'config.error': 'Could not read or save the configuration',
        'workspace.title': 'Fusion workspace',
        'workspace.help': 'The hf_* tools (probe / build / flat / verify) need the root of a fusion-harness workspace. Leave it empty to enable the MCP tools only.',
        'workspace.placeholder': '/home/you/fusion-harness',
        'workspace.save': 'Save',
        'workspace.saving': 'Saving…',
        'workspace.saved': 'Saved — restart DSH to apply',
        'workspace.unset': 'Not configured: MCP tools only',
        'workspace.ok': 'tools/hf.py found',
        'workspace.missing': 'no tools/hf.py under that path',
        'workspace.error': 'Could not read or save the workspace',
        'workspace.warnNoScript': 'Saved, but no tools/hf.py was found (hf_* will fail)',
      },
    }

    const box = { display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px 0' }
    const title = { color: 'var(--dsw-alias-label-primary)', fontSize: '14px', lineHeight: '22px' }
    const help = { color: 'var(--dsw-alias-label-tertiary)', fontSize: '12px', lineHeight: '18px' }
    const grid = { display: 'grid', gridTemplateColumns: '140px 1fr', gap: '8px', alignItems: 'center' }
    const labelStyle = { color: 'var(--dsw-alias-label-secondary)', fontSize: '12px' }
    const inputStyle = {
      padding: '6px 10px',
      borderRadius: '10px',
      border: '1px solid var(--dsw-alias-border-l2)',
      background: 'var(--dsw-alias-bg-module-platform)',
      color: 'var(--dsw-alias-label-primary)',
      font: 'inherit',
      fontSize: '12px',
      minWidth: 0,
    }
    const rowStyle = { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }
    const codeStyle = { color: 'var(--dsw-alias-label-tertiary)', fontSize: '12px', userSelect: 'all' }
    const buttonStyle = {
      height: '32px',
      padding: '0 14px',
      border: 'none',
      borderRadius: '16px',
      background: 'var(--dsw-alias-bg-module-platform)',
      color: 'var(--dsw-alias-label-primary)',
      font: 'inherit',
      fontSize: '12px',
      cursor: 'pointer',
    }
    const linkButtonStyle = {
      height: '24px',
      padding: '0 4px',
      border: 'none',
      background: 'transparent',
      color: 'var(--dsw-alias-label-tertiary)',
      font: 'inherit',
      fontSize: '12px',
      cursor: 'pointer',
    }

    function EndpointRow(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => key
      const [state, setState] = React.useState({ status: 'loading', endpoint: '', error: '' })
      const [draft, setDraft] = React.useState({})
      const [busy, setBusy] = React.useState(false)
      const [notice, setNotice] = React.useState('')
      const [advanced, setAdvanced] = React.useState(false)

      const load = React.useCallback(async () => {
        try {
          const response = await fetch(ROUTE, { headers: { accept: 'application/json' } })
          const body = await response.json()
          if (!response.ok || body.ok !== true) throw new Error(body.error ?? `HTTP ${response.status}`)
          setDraft({
            host: body.config.host ?? '',
            port: body.config.port ?? '',
            path: body.config.path ?? '',
            url: body.config.url ?? '',
            toolCallTimeoutMs: body.config.toolCallTimeoutMs ?? '',
          })
          setState({ status: 'ready', endpoint: body.endpoint, error: '' })
        } catch (error) {
          setState({ status: 'error', endpoint: '', error: error instanceof Error ? error.message : String(error) })
        }
      }, [])

      React.useEffect(() => {
        void load()
      }, [load])

      const save = React.useCallback(async () => {
        setBusy(true)
        setNotice('')
        try {
          const response = await fetch(ROUTE, {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            // Only the fields this form owns; host/path keep whatever the patch has.
            body: JSON.stringify({
              port: draft.port,
              url: draft.url ?? '',
              toolCallTimeoutMs: draft.toolCallTimeoutMs,
            }),
          })
          const body = await response.json()
          if (!response.ok || body.ok !== true) throw new Error(body.error ?? `HTTP ${response.status}`)
          setState({ status: 'ready', endpoint: body.endpoint, error: '' })
          setNotice(t('config.saved'))
        } catch (error) {
          setState((current) => ({ ...current, status: 'error', error: error instanceof Error ? error.message : String(error) }))
        } finally {
          setBusy(false)
        }
      }, [draft, t])

      const onChange = (key) => (event) => {
        const value = event.currentTarget.value
        setDraft((current) => ({ ...current, [key]: value }))
      }

      return React.createElement(
        'div',
        { style: box },
        React.createElement('div', { style: title }, t('config.title')),
        React.createElement('p', { style: help }, t('config.help')),
        state.status === 'loading'
          ? React.createElement('p', { style: help }, t('config.loading'))
          : React.createElement(
              'div',
              { style: grid },
              ...(advanced ? [...primaryFields, ...advancedFields] : primaryFields).flatMap((field) => [
                React.createElement('label', { key: `${field.key}-label`, style: labelStyle, htmlFor: `fusion-lean-${field.key}` }, t(field.labelKey)),
                React.createElement('input', {
                  key: `${field.key}-input`,
                  id: `fusion-lean-${field.key}`,
                  style: inputStyle,
                  type: field.kind,
                  placeholder: field.hint,
                  value: draft[field.key] ?? '',
                  onChange: onChange(field.key),
                  disabled: busy,
                }),
              ]),
            ),
        React.createElement(
          'div',
          { style: rowStyle },
          React.createElement('button', { type: 'button', style: buttonStyle, onClick: () => { void save() }, disabled: busy || state.status === 'loading' }, busy ? t('config.saving') : t('config.save')),
          React.createElement('button', {
            type: 'button',
            style: linkButtonStyle,
            onClick: () => setAdvanced((current) => !current),
            'aria-expanded': advanced,
          }, `${advanced ? '▾' : '▸'} ${t('config.advanced')}`),
          notice === '' ? null : React.createElement('span', { style: labelStyle }, notice),
          state.endpoint === '' ? null : React.createElement('code', { style: codeStyle }, `${t('config.endpoint')}: ${state.endpoint}`),
        ),
        state.error === ''
          ? null
          : React.createElement('p', { style: help }, `${t('config.error')}: ${state.error}`),
      )
    }

    function WorkspaceRow(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => key
      const [draft, setDraft] = React.useState('')
      const [python, setPython] = React.useState('python')
      const [status, setStatus] = React.useState({ status: 'loading', checks: null, error: '' })
      const [busy, setBusy] = React.useState(false)
      const [notice, setNotice] = React.useState('')

      const load = React.useCallback(async () => {
        try {
          const response = await fetch(WORKSPACE_ROUTE, { headers: { accept: 'application/json' } })
          const body = await response.json()
          if (!response.ok || body.ok !== true) throw new Error(body.error ?? `HTTP ${response.status}`)
          setDraft(body.config.harnessRoot ?? '')
          setPython(body.config.python ?? 'python')
          setStatus({ status: 'ready', checks: body.checks, error: '' })
        } catch (error) {
          setStatus({ status: 'error', checks: null, error: error instanceof Error ? error.message : String(error) })
        }
      }, [])

      React.useEffect(() => {
        void load()
      }, [load])

      const save = React.useCallback(async () => {
        setBusy(true)
        setNotice('')
        try {
          const response = await fetch(WORKSPACE_ROUTE, {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ harnessRoot: draft, python }),
          })
          const body = await response.json()
          if (!response.ok || body.ok !== true) throw new Error(body.error ?? `HTTP ${response.status}`)
          setStatus({ status: 'ready', checks: body.checks, error: '' })
          setNotice(typeof body.warning === 'string' ? t('workspace.warnNoScript') : t('workspace.saved'))
        } catch (error) {
          setStatus((current) => ({ ...current, status: 'error', error: error instanceof Error ? error.message : String(error) }))
        } finally {
          setBusy(false)
        }
      }, [draft, python, t])

      const summary = () => {
        const checks = status.checks
        if (checks === null || checks === undefined) return ''
        if (checks.configured !== true) return t('workspace.unset')
        return checks.hasScript === true ? t('workspace.ok') : t('workspace.missing')
      }

      return React.createElement(
        'div',
        { style: box },
        React.createElement('div', { style: title }, t('workspace.title')),
        React.createElement('p', { style: help }, t('workspace.help')),
        React.createElement(
          'div',
          { style: rowStyle },
          React.createElement('input', {
            style: { ...inputStyle, flex: '1', minWidth: '240px' },
            type: 'text',
            placeholder: t('workspace.placeholder'),
            value: draft,
            onChange: (event) => setDraft(event.currentTarget.value),
            disabled: busy || status.status === 'loading',
          }),
          React.createElement('button', { type: 'button', style: buttonStyle, onClick: () => { void save() }, disabled: busy || status.status === 'loading' }, busy ? t('workspace.saving') : t('workspace.save')),
          React.createElement('span', { style: labelStyle }, summary()),
          notice === '' ? null : React.createElement('span', { style: labelStyle }, notice),
        ),
        status.error === ''
          ? null
          : React.createElement('p', { style: help }, `${t('workspace.error')}: ${status.error}`),
      )
    }

    function apply(ctx) {
      try {
        ctx.effect(() => ctx.locale.register(NS, dictionaries), 'fusion-lean: settings dictionaries')
        ctx.slots.inject('settings.general.item', () => ctx.slots.register({
          name: 'settings.general.item',
          id: ROW_ID,
          order: 110,
          locale: NS,
        }, EndpointRow))
        ctx.slots.inject('settings.general.item', () => ctx.slots.register({
          name: 'settings.general.item',
          id: 'fusion-harness-workspace',
          order: 111,
          locale: NS,
        }, WorkspaceRow))
        beacon('applied')
      } catch (error) {
        beacon('error', error instanceof Error ? `${error.name}: ${error.message}` : String(error))
        throw error
      }
    }

    return { inject, apply }
  },
})
