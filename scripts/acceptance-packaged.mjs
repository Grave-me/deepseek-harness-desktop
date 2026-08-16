import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import {
  createIsolatedProfile,
  HOST,
  PORT,
  removeProfile,
  ROOT,
  runtimePaths,
  startSidecar,
  stopSidecar,
  tcpListeners,
  waitUntilReady,
} from './smoke-lib.mjs'

const mode = process.argv[2]
if (!['other', 'external', 'crash'].includes(mode)) {
  throw new Error('usage: node scripts/acceptance-packaged.mjs <other|external|crash>')
}

const executable = process.env.DSH_PACKAGED_EXE ?? join(ROOT, 'release-candidate', 'win-unpacked', 'DeepSeek Harness Desktop.exe')
const profile = await createIsolatedProfile()
await mkdir(join(profile, 'AppData', 'Roaming'), { recursive: true })
await mkdir(join(profile, 'AppData', 'Local'), { recursive: true })

const environment = {
  ...process.env,
  USERPROFILE: profile,
  HOME: profile,
  HOMEDRIVE: profile.slice(0, 2),
  HOMEPATH: profile.slice(2),
  APPDATA: join(profile, 'AppData', 'Roaming'),
  LOCALAPPDATA: join(profile, 'AppData', 'Local'),
  PATH: `${process.env.SystemRoot ?? 'C:\\Windows'}\\System32`,
}

function launch(quitAfterMs) {
  return spawn(executable, [`--user-data-dir=${join(profile, `Chromium-${Date.now()}`)}`], {
    cwd: ROOT,
    shell: false,
    windowsHide: true,
    stdio: 'ignore',
    env: {
      ...environment,
      ...(quitAfterMs === undefined ? {} : { DSH_DESKTOP_SMOKE_QUIT_AFTER_MS: String(quitAfterMs) }),
    },
  })
}

async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) return true
  return await new Promise(resolvePromise => {
    const onExit = () => { clearTimeout(timer); resolvePromise(true) }
    const timer = setTimeout(() => { child.removeListener('exit', onExit); resolvePromise(false) }, timeoutMs)
    child.once('exit', onExit)
  })
}

async function killPid(pid, tree = false) {
  const args = ['/PID', String(pid), ...(tree ? ['/T'] : []), '/F']
  const killer = spawn(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'), args, {
    shell: false,
    windowsHide: true,
    stdio: 'ignore',
  })
  await new Promise((resolvePromise, reject) => {
    killer.once('error', reject)
    killer.once('exit', code => code === 0 ? resolvePromise() : reject(new Error(`taskkill ${pid} exited ${code}`)))
  })
}

let external
let server
let desktop
try {
  if (mode === 'other') {
    server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/plain' })
      response.end('not a Harness service')
    })
    await new Promise((resolvePromise, reject) => {
      server.once('error', reject)
      server.listen(PORT, HOST, resolvePromise)
    })
    desktop = launch(6_000)
    await new Promise(resolvePromise => setTimeout(resolvePromise, 2_000))
    const listeners = await tcpListeners()
    if (listeners.length !== 1 || listeners[0].pid !== process.pid || listeners[0].address !== HOST) {
      throw new Error(`desktop replaced or supplemented the non-DSH listener: ${JSON.stringify(listeners)}`)
    }
    if (!await waitForExit(desktop, 15_000)) throw new Error('desktop did not exit after reporting port conflict')
    console.log('Non-DSH port conflict was rejected without replacing or terminating the existing listener')
  }

  if (mode === 'external') {
    external = startSidecar(await runtimePaths(), profile)
    await waitUntilReady(external)
    const before = await tcpListeners()
    desktop = launch(7_000)
    if (!await waitForExit(desktop, 15_000)) throw new Error('desktop did not exit after attaching to external DSH')
    const after = await tcpListeners()
    if (external.exitCode !== null || before.length !== 1 || after.length !== 1 || before[0].pid !== after[0].pid) {
      throw new Error('desktop stopped or replaced the pre-existing DSH')
    }
    console.log('Packaged desktop attached to pre-existing DSH and left it running on exit')
  }

  if (mode === 'crash') {
    desktop = launch()
    await waitUntilReady(desktop)
    const before = await tcpListeners()
    if (before.length !== 1 || before[0].address !== HOST) throw new Error('owned DSH listener was not established')
    await killPid(desktop.pid)
    await waitForExit(desktop, 5_000)
    await new Promise(resolvePromise => setTimeout(resolvePromise, 1_000))
    const orphaned = await tcpListeners()
    const orphanRemained = orphaned.length === 1 && orphaned[0].pid === before[0].pid
    const recovery = launch(7_000)
    await waitUntilReady(recovery)
    if (!await waitForExit(recovery, 15_000)) throw new Error('recovery desktop did not exit')
    const afterRecovery = await tcpListeners()
    const recoveryAttached = orphanRemained && afterRecovery.length === 1 && afterRecovery[0].pid === before[0].pid
    const cleanRestart = !orphanRemained && afterRecovery.length === 0
    if (!recoveryAttached && !cleanRestart) throw new Error(`unexpected post-recovery listeners: ${JSON.stringify(afterRecovery)}`)
    console.log(JSON.stringify({ orphanRemained, recoveryAttached, cleanRestart, originalSidecarPid: before[0].pid }))
    if (recoveryAttached) await killPid(before[0].pid, true)
  }
} finally {
  if (desktop?.exitCode === null) desktop.kill('SIGTERM')
  if (external !== undefined) await stopSidecar(external)
  if (server !== undefined) await new Promise(resolvePromise => server.close(resolvePromise))
  await removeProfile(profile)
}
