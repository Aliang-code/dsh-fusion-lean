/**
 * Web half: the plugin's settings rows.
 *
 * The harness shows no form for a plugin Config on its own, so this module fills
 * two seats in `settings.general.item`: the endpoint (a port, with two rare
 * overrides behind 高级) and the workspace directory (with the host's own
 * directory picker). Both talk to the loopback routes under `/fusion-lean/`,
 * which persist through `configEditor`.
 */

window.__ModuleLoader__.load({
  id: '@local/dsh-fusion-lean',
  factory: (require) => {
    const React = require('react')

    const ENDPOINT_ROW_ID = 'fusion-lean-endpoint'
    const WORKSPACE_ROW_ID = 'fusion-harness-workspace'
    const ROUTE = '/fusion-lean/config'
    const WORKSPACE_ROUTE = '/fusion-lean/workspace'
    const STATUS_ROUTE = '/fusion-lean/client-status'
    const PICK_ROUTE = '/fusion-lean/pick'
    const NS = 'fusion-lean'
    const inject = ['slots', 'locale', 'uiWorkspace']

    // The slot renderer hands components no plugin context, so the one service a
    // component calls directly is captured when `apply` runs.
    let services = null

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

    const dictionaries = {
      zh: {
        'endpoint.title': 'Fusion MCP 端点',
        'endpoint.port': '端口',
        'endpoint.url': '完整 URL',
        'endpoint.timeout': '超时（毫秒）',
        'endpoint.advanced': '高级',
        'endpoint.current': '当前',
        'workspace.title': 'Fusion 工作区',
        'workspace.path': '目录',
        'workspace.browse': '浏览…',
        'workspace.unset': '未配置：仅 MCP 工具可用',
        'workspace.ok': '已找到 tools/hf.py',
        'workspace.missing': '没有 tools/hf.py',
        'workspace.pickFailed': '无法打开目录选择器',
        save: '保存',
        saving: '保存中…',
        saved: '已保存（重启 DSH 后生效）',
        savedEmpty: '已建目录（重启 DSH 后生效）',
        warningNoScript: '没找到 tools/hf.py，hf_* 会失败',
        willCreate: '目录不存在',
        create: '新建',
        loading: '读取中…',
        failed: '失败',
      },
      en: {
        'endpoint.title': 'Fusion MCP endpoint',
        'endpoint.port': 'Port',
        'endpoint.url': 'Full URL',
        'endpoint.timeout': 'Timeout (ms)',
        'endpoint.advanced': 'Advanced',
        'endpoint.current': 'Current',
        'workspace.title': 'Fusion workspace',
        'workspace.path': 'Directory',
        'workspace.browse': 'Browse…',
        'workspace.unset': 'Not configured: MCP tools only',
        'workspace.ok': 'tools/hf.py found',
        'workspace.missing': 'no tools/hf.py',
        'workspace.pickFailed': 'Could not open the directory picker',
        save: 'Save',
        saving: 'Saving…',
        saved: 'Saved — restart DSH to apply',
        savedEmpty: 'Directory created — restart DSH to apply',
        warningNoScript: 'no tools/hf.py there, hf_* will fail',
        willCreate: 'Directory does not exist',
        create: 'Create',
        loading: 'Loading…',
        failed: 'failed',
      },
    }

    const section = { display: 'flex', flexDirection: 'column', gap: '6px', padding: '14px 0' }
    const sectionTitle = { color: 'var(--dsw-alias-label-primary)', fontSize: '13px', lineHeight: '20px', fontWeight: 500 }
    const control = { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }
    const fieldLabel = { color: 'var(--dsw-alias-label-tertiary)', fontSize: '12px', minWidth: '56px' }
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
    const caption = { color: 'var(--dsw-alias-label-tertiary)', fontSize: '12px', lineHeight: '18px', margin: 0 }
    const buttonStyle = {
      height: '30px',
      padding: '0 14px',
      border: 'none',
      borderRadius: '15px',
      background: 'var(--dsw-alias-bg-module-platform)',
      color: 'var(--dsw-alias-label-primary)',
      font: 'inherit',
      fontSize: '12px',
      cursor: 'pointer',
      flex: 'none',
    }
    const linkStyle = {
      height: '24px',
      padding: '0 2px',
      border: 'none',
      background: 'transparent',
      color: 'var(--dsw-alias-label-tertiary)',
      font: 'inherit',
      fontSize: '12px',
      cursor: 'pointer',
    }

    function EndpointRow(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => key
      const [draft, setDraft] = React.useState({ port: '', url: '', toolCallTimeoutMs: '' })
      const [status, setStatus] = React.useState({ phase: 'loading', endpoint: '', message: '', error: '' })
      const [busy, setBusy] = React.useState(false)
      const [advanced, setAdvanced] = React.useState(false)

      const load = React.useCallback(async () => {
        try {
          const response = await fetch(ROUTE, { headers: { accept: 'application/json' } })
          const body = await response.json()
          if (!response.ok || body.ok !== true) throw new Error(body.error ?? `HTTP ${response.status}`)
          setDraft({
            port: body.config.port ?? '',
            url: body.config.url ?? '',
            toolCallTimeoutMs: body.config.toolCallTimeoutMs ?? '',
          })
          setStatus({ phase: 'ready', endpoint: body.endpoint, message: '', error: '' })
        } catch (error) {
          setStatus({ phase: 'error', endpoint: '', message: '', error: error instanceof Error ? error.message : String(error) })
        }
      }, [])

      React.useEffect(() => {
        void load()
      }, [load])

      const save = React.useCallback(async () => {
        setBusy(true)
        try {
          const response = await fetch(ROUTE, {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify(draft),
          })
          const body = await response.json()
          if (!response.ok || body.ok !== true) throw new Error(body.error ?? `HTTP ${response.status}`)
          setStatus({ phase: 'ready', endpoint: body.endpoint, message: t('saved'), error: '' })
        } catch (error) {
          setStatus((current) => ({ ...current, phase: 'error', error: error instanceof Error ? error.message : String(error) }))
        } finally {
          setBusy(false)
        }
      }, [draft, t])

      const change = (key) => (event) => {
        const value = event.currentTarget.value
        setDraft((current) => ({ ...current, [key]: value }))
      }

      const rows = [
        React.createElement(
          'div',
          { key: 'port', style: control },
          React.createElement('span', { style: fieldLabel }, t('endpoint.port')),
          React.createElement('input', {
            style: { ...inputStyle, width: '110px' },
            type: 'number',
            value: draft.port,
            onChange: change('port'),
            disabled: busy || status.phase === 'loading',
          }),
          React.createElement('button', {
            type: 'button',
            style: buttonStyle,
            onClick: () => { void save() },
            disabled: busy || status.phase === 'loading',
          }, busy ? t('saving') : t('save')),
          React.createElement('button', {
            type: 'button',
            style: linkStyle,
            onClick: () => setAdvanced((current) => !current),
            'aria-expanded': advanced,
          }, `${advanced ? '▾' : '▸'} ${t('endpoint.advanced')}`),
        ),
      ]

      if (advanced) {
        rows.push(
          React.createElement(
            'div',
            { key: 'url', style: control },
            React.createElement('span', { style: fieldLabel }, t('endpoint.url')),
            React.createElement('input', {
              style: { ...inputStyle, flex: '1', minWidth: '260px' },
              type: 'text',
              placeholder: 'http://127.0.0.1:27182/mcp',
              value: draft.url,
              onChange: change('url'),
              disabled: busy,
            }),
          ),
          React.createElement(
            'div',
            { key: 'timeout', style: control },
            React.createElement('span', { style: fieldLabel }, t('endpoint.timeout')),
            React.createElement('input', {
              style: { ...inputStyle, width: '110px' },
              type: 'number',
              value: draft.toolCallTimeoutMs,
              onChange: change('toolCallTimeoutMs'),
              disabled: busy,
            }),
          ),
        )
      }

      const lines = []
      if (status.phase === 'loading') lines.push(t('loading'))
      if (status.endpoint !== '') lines.push(`${t('endpoint.current')} ${status.endpoint}`)
      if (status.message !== '') lines.push(status.message)
      if (status.error !== '') lines.push(`${t('failed')}: ${status.error}`)

      return React.createElement(
        'div',
        { style: section },
        React.createElement('div', { style: sectionTitle }, t('endpoint.title')),
        ...rows,
        lines.length === 0 ? null : React.createElement('p', { style: caption }, lines.join(' · ')),
      )
    }

    function WorkspaceRow(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => key
      const [draft, setDraft] = React.useState('')
      const [status, setStatus] = React.useState({ phase: 'loading', checks: null, message: '', error: '' })
      const [busy, setBusy] = React.useState(false)
      const [canCreate, setCanCreate] = React.useState(false)
      const [pickError, setPickError] = React.useState('')

      const load = React.useCallback(async () => {
        try {
          const response = await fetch(WORKSPACE_ROUTE, { headers: { accept: 'application/json' } })
          const body = await response.json()
          if (!response.ok || body.ok !== true) throw new Error(body.error ?? `HTTP ${response.status}`)
          setDraft(body.config.harnessRoot ?? '')
          setStatus({ phase: 'ready', checks: body.checks, message: '', error: '' })
        } catch (error) {
          setStatus({ phase: 'error', checks: null, message: '', error: error instanceof Error ? error.message : String(error) })
        }
      }, [])

      React.useEffect(() => {
        void load()
      }, [load])

      const save = React.useCallback(async (create = false) => {
        setBusy(true)
        setCanCreate(false)
        setPickError('')
        try {
          const response = await fetch(WORKSPACE_ROUTE, {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ harnessRoot: draft, create }),
          })
          const body = await response.json()
          if (!response.ok || body.ok !== true) {
            if (body?.code === 'not-found') {
              setCanCreate(true)
              setStatus((current) => ({ ...current, phase: 'ready', message: t('willCreate'), error: '' }))
              return
            }
            throw new Error(body.error ?? `HTTP ${response.status}`)
          }
          const message = body.created === true ? t('savedEmpty') : typeof body.warning === 'string' ? t('warningNoScript') : t('saved')
          setStatus({ phase: 'ready', checks: body.checks, message, error: '' })
        } catch (error) {
          setStatus((current) => ({ ...current, phase: 'error', error: error instanceof Error ? error.message : String(error) }))
        } finally {
          setBusy(false)
        }
      }, [draft, t])

      const browse = React.useCallback(async () => {
        setPickError('')
        // The host owns the native dialog; the browser backend answers
        // "unsupported" and the client-side picker takes over.
        try {
          const response = await fetch(PICK_ROUTE, { method: 'POST', headers: { accept: 'application/json' } })
          const body = await response.json().catch(() => ({}))
          if (response.ok && body?.ok === true) {
            if (body.cancelled !== true && typeof body.path === 'string' && body.path !== '') setDraft(body.path)
            return
          }
          if (body?.code !== 'unsupported') throw new Error(body?.error ?? `HTTP ${response.status}`)
        } catch (error) {
          if (!(error instanceof TypeError)) {
            setPickError(`${t('workspace.pickFailed')}: ${error instanceof Error ? error.message : String(error)}`)
            return
          }
        }
        try {
          const picked = await services?.uiWorkspace?.pickDirectory?.()
          if (typeof picked === 'string' && picked.length > 0) setDraft(picked)
        } catch (error) {
          setPickError(`${t('workspace.pickFailed')}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }, [t])

      const checks = status.checks
      const lines = []
      if (status.phase === 'loading') lines.push(t('loading'))
      if (checks !== null && checks !== undefined) {
        lines.push(
          checks.configured === true
            ? checks.hasScript === true
              ? t('workspace.ok')
              : t('workspace.missing')
            : t('workspace.unset'),
        )
      }
      if (status.message !== '') lines.push(status.message)
      if (pickError !== '') lines.push(pickError)
      if (status.error !== '') lines.push(`${t('failed')}: ${status.error}`)

      return React.createElement(
        'div',
        { style: section },
        React.createElement('div', { style: sectionTitle }, t('workspace.title')),
        React.createElement(
          'div',
          { style: control },
          React.createElement('span', { style: fieldLabel }, t('workspace.path')),
          React.createElement('input', {
            style: { ...inputStyle, flex: '1', minWidth: '240px' },
            type: 'text',
            value: draft,
            onChange: (event) => setDraft(event.currentTarget.value),
            disabled: busy || status.phase === 'loading',
          }),
          React.createElement('button', {
            type: 'button',
            style: buttonStyle,
            onClick: () => { void browse() },
            disabled: busy || status.phase === 'loading',
          }, t('workspace.browse')),
          React.createElement('button', {
            type: 'button',
            style: buttonStyle,
            onClick: () => { void save(false) },
            disabled: busy || status.phase === 'loading',
          }, busy ? t('saving') : t('save')),
          canCreate
            ? React.createElement('button', {
                type: 'button',
                style: buttonStyle,
                onClick: () => { void save(true) },
                disabled: busy,
              }, t('create'))
            : null,
        ),
        lines.length === 0 ? null : React.createElement('p', { style: caption }, lines.join(' · ')),
      )
    }

    function apply(ctx) {
      try {
        services = ctx
        ctx.effect(() => ctx.locale.register(NS, dictionaries), 'fusion-lean: settings dictionaries')
        ctx.slots.inject('settings.general.item', () => ctx.slots.register({
          name: 'settings.general.item',
          id: ENDPOINT_ROW_ID,
          order: 110,
          locale: NS,
        }, EndpointRow))
        ctx.slots.inject('settings.general.item', () => ctx.slots.register({
          name: 'settings.general.item',
          id: WORKSPACE_ROW_ID,
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
