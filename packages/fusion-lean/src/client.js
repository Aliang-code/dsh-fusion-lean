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
    const module = { exports: {} }
    const React = require('react')

    const ROW_KEY = '@local/dsh-fusion-lean#fusion-lean'
    const ROUTE = '/fusion-lean/config'
    const NS = 'fusion-lean'
    const inject = ['slots', 'locale']

    const fields = [
      { key: 'host', label: 'host', kind: 'text', hint: '127.0.0.1' },
      { key: 'port', label: 'port', kind: 'number', hint: '27182' },
      { key: 'path', label: 'path', kind: 'text', hint: '/mcp' },
      { key: 'url', label: 'url', kind: 'text', hint: '（可选，填了覆盖上面三项）' },
      { key: 'toolCallTimeoutMs', label: 'timeout (ms)', kind: 'number', hint: '120000' },
    ]

    const dictionaries = {
      zh: {
        'config.title': 'Fusion MCP 端点',
        'config.help': '端口/主机/路径改动会立即写回 profile 并重载本行；URL 非空时覆盖前三项。',
        'config.endpoint': '当前端点',
        'config.save': '保存',
        'config.saving': '保存中…',
        'config.saved': '已保存，正在重载',
        'config.loading': '读取中…',
        'config.error': '无法读取或保存配置',
      },
      en: {
        'config.title': 'Fusion MCP endpoint',
        'config.help': 'Host, port and path are written back to the profile and the row reloads. A non-empty URL wins over them.',
        'config.endpoint': 'Current endpoint',
        'config.save': 'Save',
        'config.saving': 'Saving…',
        'config.saved': 'Saved, reloading',
        'config.loading': 'Loading…',
        'config.error': 'Could not read or save the configuration',
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

    function EndpointRow(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => key
      const [state, setState] = React.useState({ status: 'loading', endpoint: '', error: '' })
      const [draft, setDraft] = React.useState({})
      const [busy, setBusy] = React.useState(false)
      const [notice, setNotice] = React.useState('')

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
            body: JSON.stringify(draft),
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
              ...fields.flatMap((field) => [
                React.createElement('label', { key: `${field.key}-label`, style: labelStyle, htmlFor: `fusion-lean-${field.key}` }, field.label),
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
          notice === '' ? null : React.createElement('span', { style: labelStyle }, notice),
          state.endpoint === '' ? null : React.createElement('code', { style: codeStyle }, `${t('config.endpoint')}: ${state.endpoint}`),
        ),
        state.error === ''
          ? null
          : React.createElement('p', { style: help }, `${t('config.error')}: ${state.error}`),
      )
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, dictionaries), 'fusion-lean: settings dictionaries')
      ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
        name: 'plugins.row.config',
        key: ROW_KEY,
        locale: NS,
      }, EndpointRow))
    }

    module.exports.apply = apply
    module.exports.inject = inject
    return module.exports
  },
})
