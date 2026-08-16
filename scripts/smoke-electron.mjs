import { spawn } from 'node:child_process'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createIsolatedProfile, removeProfile, ROOT, tcpListeners, URL } from './smoke-lib.mjs'

const profile = await createIsolatedProfile()
const dshHome = join(profile, '.dsh')
const existingDsh = process.argv.includes('--existing-dsh')
const sentinel = join(dshHome, 'release-acceptance-sentinel.txt')
const sentinelValue = 'preserve-existing-dsh-data\n'
if (existingDsh) {
  await mkdir(dshHome, { recursive: true })
  await writeFile(sentinel, sentinelValue)
}
await mkdir(join(profile, 'AppData', 'Roaming'), { recursive: true })
await mkdir(join(profile, 'AppData', 'Local'), { recursive: true })
const packaged = process.argv.includes('--packaged')
const electron = packaged
  ? process.env.DSH_PACKAGED_EXE ?? join(ROOT, 'release', 'win-unpacked', 'DeepSeek Harness Desktop.exe')
  : join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const baseEnvironment = {
  ...process.env,
  ...(packaged ? {
    USERPROFILE: profile,
    HOME: profile,
    HOMEDRIVE: profile.slice(0, 2),
    HOMEPATH: profile.slice(2),
    APPDATA: join(profile, 'AppData', 'Roaming'),
    LOCALAPPDATA: join(profile, 'AppData', 'Local'),
    PATH: `${process.env.SystemRoot ?? 'C:\\Windows'}\\System32`,
  } : { DSH_DESKTOP_TEST_PROFILE_ROOT: profile }),
}
const desktopLog = packaged
  ? join(profile, 'AppData', 'Local', 'DeepSeek Harness Desktop', 'logs', 'desktop.log')
  : join(profile, 'LocalAppData', 'DeepSeek Harness Desktop', 'logs', 'desktop.log')

async function logTail() {
  try {
    const value = await readFile(desktopLog, 'utf8')
    return value.slice(-8192).replace(/(authorization|cookie|token|api[_-]?key)\s*[:=]\s*\S+/giu, '$1=[REDACTED]')
  } catch { return '(desktop log unavailable)' }
}

function launch(extraEnvironment = {}) {
  const args = [`--user-data-dir=${join(profile, 'Chromium')}`, '--enable-logging=stderr', ...(packaged ? [] : ['.'])]
  const child = spawn(electron, args, {
    cwd: ROOT, shell: false, windowsHide: true,
    env: { ...baseEnvironment, ELECTRON_ENABLE_LOGGING: '1', ...extraEnvironment },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stderr = ''
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-4096) })
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-4096) })
  return { child, stderr: () => stderr.replace(/(authorization|cookie|token|api[_-]?key)\s*[:=]\s*\S+/giu, '$1=[REDACTED]') }
}

async function waitForReady(child, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Electron exited before readiness (${child.exitCode})`)
    try { if ((await fetch(URL, { signal: AbortSignal.timeout(750) })).status === 200) return } catch { /* polling */ }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 250))
  }
  throw new Error('Electron-managed DSH did not become ready')
}

async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) return true
  return await new Promise(resolvePromise => {
    const onExit = () => { clearTimeout(timer); resolvePromise(true) }
    const timer = setTimeout(() => { child.removeListener('exit', onExit); resolvePromise(false) }, timeoutMs)
    child.once('exit', onExit)
  })
}

const first = launch({ DSH_DESKTOP_SMOKE_QUIT_AFTER_MS: '20000' })
try {
  await waitForReady(first.child, 30_000)
  const before = await tcpListeners()
  if (before.length !== 1 || before[0].address !== '127.0.0.1') throw new Error('first Electron instance has an unsafe listener set')

  const second = launch()
  if (!await waitForExit(second.child, 10_000)) throw new Error('second Electron instance did not exit')
  if (second.child.exitCode !== 0) throw new Error(`second Electron exit code ${second.child.exitCode}: ${second.stderr()}`)
  const afterSecond = await tcpListeners()
  if (afterSecond.length !== 1 || afterSecond[0].pid !== before[0].pid) throw new Error('second instance changed the DSH listener')

  if (!await waitForExit(first.child, 30_000)) throw new Error('first Electron instance did not quit through app lifecycle')
  await new Promise(resolvePromise => setTimeout(resolvePromise, 500))
  if ((await tcpListeners()).length !== 0) throw new Error('Electron quit left a DSH listener behind')
  await access(dshHome)
  if (existingDsh && await readFile(sentinel, 'utf8') !== sentinelValue) throw new Error('existing .dsh sentinel was modified')
  console.log(`${packaged ? 'Packaged' : 'Development'} Electron lifecycle, single-instance, owned-sidecar cleanup, and ${existingDsh ? 'existing' : 'new'} .dsh profile passed`)
} catch (error) {
  throw new Error(`${error instanceof Error ? error.message : String(error)}\nElectron stderr: ${first.stderr()}\nDesktop log: ${await logTail()}`)
} finally {
  if (first.child.exitCode === null) first.child.kill('SIGTERM')
  await removeProfile(profile)
}
