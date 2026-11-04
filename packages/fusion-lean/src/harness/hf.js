/**
 * One `hf` invocation, spawned without a shell and with a fixed UTF-8
 * environment.
 *
 * Three rules this module exists to enforce:
 *
 *   * never a shell — argv is an array, so spaces, quotes and Chinese in a part
 *     name are never re-split by cmd.exe or PowerShell;
 *   * `PYTHONUTF8=1` / `PYTHONIOENCODING=utf-8` — without them Python on Windows
 *     decodes stdout *and argv* through the ANSI code page and silently replaces
 *     characters with U+FFFD;
 *   * `--json` — the CLI answers with one ASCII-escaped object, so nothing has to
 *     parse human text and no console code page can corrupt the result.
 */

import { spawn } from 'node:child_process'
import { isAbsolute } from 'node:path'

const AUTHORITY = 'fusion-harness/AUTHORITY.md §4/§5'
const PROTECTED_PATH = /(^|[\\/])send([\\/]|$)/i

/** Arguments that must stay inside the workspace: never a path, never a parent hop. */
export function assertPlainName(label, value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} is required`)
  }
  if (isAbsolute(value) || value.includes('..') || /[\\/]/.test(value)) {
    throw new Error(
      `${label} must be a plain name inside the workspace, got ${JSON.stringify(value)}. ` +
        `Paths that could reach a shipped set are refused before anything runs — see ${AUTHORITY}.`,
    )
  }
}

/** The delivered-to-factory set is read-only; nothing may write into it. */
export function assertNotShipped(artifacts) {
  for (const artifact of artifacts) {
    if (PROTECTED_PATH.test(artifact)) {
      throw new Error(
        `refused: this run would write ${artifact}, which sits in a shipped set (产品/<产品>/交付/send/). ` +
          `That authority belongs to a human update, not a tool call — see ${AUTHORITY}.`,
      )
    }
  }
}

function executableAndPrefix(python) {
  if (Array.isArray(python) && python.length > 0) return { exe: python[0], prefix: python.slice(1) }
  if (typeof python === 'string' && python.length > 0) return { exe: python, prefix: [] }
  throw new Error('configuration "python" must be an executable path or an argv array')
}

function parseResult(stdout) {
  const text = stdout.trim()
  if (text.length === 0) return null
  try {
    const value = JSON.parse(text)
    if (value !== null && typeof value === 'object' && typeof value.command === 'string') return value
  } catch {
    // not JSON: the CLI died before it could answer, or an interpreter banner leaked
  }
  return null
}

/**
 * Run `hf <argv> --json` and resolve with the structured result.
 * Never rejects for a non-zero exit: the caller decides what failure means.
 */
export function runHf(config, argv, options = {}) {
  const { exe, prefix } = executableAndPrefix(config.python ?? 'python')
  const env = {
    ...process.env,
    PYTHONUTF8: '1',
    PYTHONIOENCODING: 'utf-8',
    PYTHONLEGACYWINDOWSSTDIO: '0',
  }
  delete env.PYTHONHOME

  const args = [...prefix, 'tools/hf.py', ...argv, '--json']
  const timeoutMs = options.timeoutMs ?? config.timeoutMs ?? 300000

  return new Promise((resolve) => {
    let settled = false
    let stdout = ''
    let stderr = ''
    let timedOut = false

    const child = spawn(exe, args, {
      cwd: config.harnessRoot,
      env,
      shell: false,
      windowsHide: true,
    })

    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, timeoutMs)

    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr?.on('data', (chunk) => {
      stderr += chunk
    })

    const finish = (exitCode, spawnError) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      const parsed = parseResult(stdout)
      const result = {
        command: parsed?.command ?? argv[0] ?? 'hf',
        ok: parsed?.ok ?? (spawnError === undefined && exitCode === 0),
        exitCode: parsed?.exitCode ?? (typeof exitCode === 'number' ? exitCode : 1),
        stdout: parsed?.stdout ?? stdout,
        stderr: parsed?.stderr ?? stderr,
        artifacts: Array.isArray(parsed?.artifacts) ? parsed.artifacts : [],
        root: parsed?.root ?? config.harnessRoot,
        timedOut,
        ...(spawnError === undefined ? {} : { spawnError }),
      }
      resolve(result)
    }

    child.on('error', (error) => finish(1, error instanceof Error ? error.message : String(error)))
    child.on('close', (code) => finish(code ?? 1))
  })
}
