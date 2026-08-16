import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

export const ROOT = resolve(import.meta.dirname, '..')
export const HOST = '127.0.0.1'
export const PORT = 3080
export const URL = `http://${HOST}:${PORT}/`

export async function runtimePaths() {
  const sidecar = join(ROOT, 'build', 'runtime', 'sidecar')
  const manifest = JSON.parse(await readFile(join(sidecar, 'runtime-manifest.json'), 'utf8'))
  if (manifest.dshVersion !== '0.1.0-rc.6' || typeof manifest.binRelativePath !== 'string') throw new Error('unexpected runtime manifest')
  const entry = resolve(sidecar, manifest.binRelativePath)
  if (!entry.startsWith(`${resolve(sidecar)}\\`)) throw new Error('runtime entry escapes sidecar')
  return { node: join(ROOT, 'build', 'runtime', 'node', 'node.exe'), entry, manifest }
}

export async function createIsolatedProfile() {
  return await mkdtemp(join(tmpdir(), 'dsh-desktop-smoke-'))
}

export function startSidecar(paths, profile) {
  return spawn(paths.node, [paths.entry, 'web', '--host', HOST, '--port', String(PORT)], {
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'ignore'],
    env: {
      ...process.env,
      USERPROFILE: profile,
      HOME: profile,
      HOMEDRIVE: profile.slice(0, 2),
      HOMEPATH: profile.slice(2),
      DSH_HOME: join(profile, '.dsh'),
      PATH: `${process.env.SystemRoot ?? 'C:\\Windows'}\\System32`,
    },
  })
}

export async function waitUntilReady(child, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`DSH exited before readiness with code ${child.exitCode}`)
    try {
      const response = await fetch(URL, { redirect: 'manual', signal: AbortSignal.timeout(1_000) })
      const body = await response.text()
      if (response.status === 200 && body.includes('window.__DSH_BOOT__')) return
    } catch { /* readiness polling */ }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 250))
  }
  throw new Error('DSH did not become ready within 30 seconds')
}

export async function verifyOwnedLoopback(child) {
  const listeners = await tcpListeners()
  if (listeners.length === 0 || listeners.some(item => item.address !== HOST || item.pid !== child.pid)) {
    throw new Error(`unsafe or unowned listeners detected on ${PORT}`)
  }
}

export async function tcpListeners() {
  const output = await new Promise((resolvePromise, reject) => {
    const netstat = spawn(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'netstat.exe'), ['-a', '-n', '-o', '-p', 'tcp'], { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    netstat.stdout.setEncoding('utf8')
    netstat.stdout.on('data', chunk => { stdout += chunk })
    netstat.once('error', reject)
    netstat.once('exit', code => code === 0 ? resolvePromise(stdout) : reject(new Error(`netstat exited ${code}`)))
  })
  const listeners = []
  for (const line of output.split(/\r?\n/u)) {
    const columns = line.trim().split(/\s+/u)
    if (columns[0]?.toUpperCase() !== 'TCP') continue
    const match = /^(.*):(\d+)$/u.exec(columns[1] ?? '')
    const remote = /:(\d+)$/u.exec(columns[2] ?? '')
    if (match === null || Number(match[2]) !== PORT || Number(remote?.[1]) !== 0) continue
    listeners.push({ address: match[1].replace(/^\[|\]$/gu, ''), pid: Number(columns.at(-1)) })
  }
  return listeners
}

export async function stopSidecar(child) {
  if (child.exitCode !== null) return
  const exited = new Promise(resolvePromise => {
    const onExit = () => { clearTimeout(timer); resolvePromise(true) }
    const timer = setTimeout(() => { child.removeListener('exit', onExit); resolvePromise(false) }, 5_000)
    child.once('exit', onExit)
  })
  child.kill('SIGTERM')
  const result = await exited
  if (!result && child.pid !== undefined) {
    const killer = spawn(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { shell: false, windowsHide: true, stdio: 'ignore' })
    await new Promise((resolvePromise, reject) => { killer.once('error', reject); killer.once('exit', resolvePromise) })
  }
}

export async function removeProfile(profile) {
  const parent = resolve(tmpdir())
  const target = resolve(profile)
  if (!target.startsWith(`${parent}\\dsh-desktop-smoke-`)) throw new Error('refusing to remove unexpected smoke profile')
  await rm(target, { recursive: true, force: true, maxRetries: 12, retryDelay: 250 })
}
