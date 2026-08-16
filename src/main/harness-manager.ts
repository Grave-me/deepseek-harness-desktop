import { spawn, type ChildProcessByStdio } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { EventEmitter } from 'node:events'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import type { Readable } from 'node:stream'
import type { HarnessStatus } from '../shared/contracts.js'
import type { Logger } from './logger.js'
import { safeError } from './redaction.js'
import { inspectTcpListeners, isStrictIpv4Loopback, isTcpPortOpen, type TcpListener } from './network.js'
import { probeHarness, type HarnessProbe } from './harness-probe.js'

const HOST = '127.0.0.1'
const PORT = 3080
const URL = `http://${HOST}:${PORT}/`

interface RuntimeManifest {
  dshVersion: string
  binRelativePath: string
}

interface OwnedProcess {
  child: SidecarProcess
  pid: number
  instanceId: string
  launchedAt: number
  executablePath: string
}

type SidecarProcess = ChildProcessByStdio<null, Readable, Readable>

export interface HarnessDependencies {
  probe?: (url: string, timeoutMs?: number) => Promise<HarnessProbe>
  portOpen?: (host: string, port: number) => Promise<boolean>
  listeners?: (port: number) => Promise<TcpListener[]>
  spawnProcess?: typeof spawn
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  dshHome?: string
}

export class HarnessManager extends EventEmitter {
  private status: HarnessStatus = { phase: 'idle', message: 'Harness 尚未启动', ownership: 'none' }
  private owned: OwnedProcess | undefined
  private operation: Promise<void> | undefined
  private intentionalStop = false
  private readonly probe: NonNullable<HarnessDependencies['probe']>
  private readonly portOpen: NonNullable<HarnessDependencies['portOpen']>
  private readonly inspectListeners: NonNullable<HarnessDependencies['listeners']>
  private readonly spawnProcess: typeof spawn
  private readonly now: () => number
  private readonly sleep: (ms: number) => Promise<void>
  private readonly dshHome: string

  constructor(
    private readonly nodeExecutable: string,
    private readonly sidecarRoot: string,
    private readonly logger: Logger,
    dependencies: HarnessDependencies = {},
  ) {
    super()
    this.probe = dependencies.probe ?? probeHarness
    this.portOpen = dependencies.portOpen ?? isTcpPortOpen
    this.inspectListeners = dependencies.listeners ?? inspectTcpListeners
    this.spawnProcess = dependencies.spawnProcess ?? spawn
    this.now = dependencies.now ?? Date.now
    this.sleep = dependencies.sleep ?? (ms => new Promise(resolvePromise => setTimeout(resolvePromise, ms)))
    this.dshHome = dependencies.dshHome ?? join(process.env.USERPROFILE ?? homedir(), '.dsh')
  }

  getStatus(): HarnessStatus { return structuredClone(this.status) }

  async start(): Promise<void> {
    if (this.operation !== undefined) return await this.operation
    this.operation = this.startInternal().finally(() => { this.operation = undefined })
    return await this.operation
  }

  async restart(): Promise<void> {
    if (this.status.ownership === 'external') {
      this.setStatus({ phase: 'running', message: '当前连接由外部进程提供；桌面应用不会重启或停止它', url: URL, ownership: 'external' })
      return
    }
    await this.stop()
    await this.start()
  }

  async stop(): Promise<void> {
    const processRecord = this.owned
    if (processRecord === undefined) return
    this.intentionalStop = true
    this.setStatus({ phase: 'stopping', message: '正在停止 Harness…', ownership: 'owned' })
    const child = processRecord.child
    if (child.exitCode === null && child.pid === processRecord.pid && this.owned === processRecord) {
      const exitPromise = this.waitForExit(child, 5_000)
      child.kill('SIGTERM')
      const exited = await exitPromise
      if (!exited && child.exitCode === null && child.pid === processRecord.pid && this.owned === processRecord) {
        this.logger.warn(`Harness PID ${processRecord.pid} did not exit in 5000ms; terminating its verified process tree`)
        await this.forceKillTree(processRecord)
      }
    }
    if (this.owned === processRecord) this.owned = undefined
    this.intentionalStop = false
    this.setStatus({ phase: 'idle', message: 'Harness 已停止', ownership: 'none' })
  }

  private async startInternal(): Promise<void> {
    if (this.owned !== undefined && this.owned.child.exitCode === null) return
    this.setStatus({ phase: 'probing', message: '正在检查本地 Harness…', ownership: 'none' })
    const alreadyOpen = await this.portOpen(HOST, PORT)
    if (alreadyOpen) {
      const existing = await this.probe(URL)
      if (!existing.compatible) {
        this.fail('PORT_CONFLICT', `端口 ${PORT} 已被其他程序占用（${existing.reason}）`)
        return
      }
      const listeners = await this.inspectListeners(PORT)
      if (!isStrictIpv4Loopback(listeners)) {
        this.securityFail('EXTERNAL_NON_LOOPBACK', '已有 Harness 并非仅监听 127.0.0.1，已拒绝连接')
        return
      }
      this.logger.info(`Connected to compatible pre-existing DSH at ${URL}; ownership=external`)
      this.setStatus({ phase: 'running', message: '已连接启动前存在的 Harness', url: URL, ownership: 'external' })
      return
    }

    try {
      const { entry, version } = await this.resolveRuntime()
      const instanceId = randomUUID()
      const launchedAt = this.now()
      this.logger.info(`Starting bundled DSH ${version} on ${HOST}:${PORT}`)
      const child = this.spawnProcess(this.nodeExecutable, [entry, 'web', '--host', HOST, '--port', String(PORT)], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DSH_HOME: this.dshHome,
          DSH_DESKTOP_INSTANCE_ID: instanceId,
        },
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      if (child.pid === undefined) throw new Error('sidecar did not provide a PID')
      const owned: OwnedProcess = { child, pid: child.pid, instanceId, launchedAt, executablePath: this.nodeExecutable }
      this.owned = owned
      this.intentionalStop = false
      this.captureOutput(child)
      child.once('error', error => {
        if (this.owned === owned) this.fail('SPAWN_ERROR', `Harness 启动失败：${safeError(error)}`)
      })
      child.once('exit', (code, signal) => {
        if (this.owned !== owned) return
        this.owned = undefined
        if (!this.intentionalStop && this.status.phase !== 'security-error') {
          this.fail('UNEXPECTED_EXIT', `Harness 异常退出（code=${String(code)}, signal=${String(signal)}）`)
        }
      })
      this.setStatus({ phase: 'starting', message: '正在等待 Harness 就绪…', ownership: 'owned' })
      const deadline = this.now() + 30_000
      while (this.now() < deadline) {
        if (child.exitCode !== null || this.owned !== owned) return
        const result = await this.probe(URL, 1_000)
        if (result.compatible) {
          const listeners = await this.inspectListeners(PORT)
          const ownedListeners = listeners.filter(item => item.pid === owned.pid)
          if (!isStrictIpv4Loopback(listeners) || ownedListeners.length === 0) {
            this.securityFail('NON_LOOPBACK_LISTENER', '自建 Harness 的监听地址或 PID 不符合安全要求，已停止')
            await this.stopOwnedForSecurity(owned)
            return
          }
          this.setStatus({ phase: 'running', message: 'Harness 已就绪', url: URL, ownership: 'owned' })
          return
        }
        await this.sleep(250)
      }
      await this.stop()
      this.fail('START_TIMEOUT', 'Harness 在 30 秒内未就绪')
    } catch (error) {
      await this.stop().catch(() => undefined)
      this.fail('START_FAILED', `Harness 启动失败：${safeError(error)}`)
    }
  }

  private async resolveRuntime(): Promise<{ entry: string; version: string }> {
    const manifestPath = join(this.sidecarRoot, 'runtime-manifest.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as RuntimeManifest
    if (manifest.dshVersion !== '0.1.0-rc.6') throw new Error(`unexpected DSH version ${manifest.dshVersion}`)
    if (typeof manifest.binRelativePath !== 'string' || isAbsolute(manifest.binRelativePath)) throw new Error('invalid DSH bin path')
    const entry = resolve(this.sidecarRoot, manifest.binRelativePath)
    if (!entry.startsWith(`${resolve(this.sidecarRoot)}\\`)) throw new Error('DSH bin path escapes sidecar root')
    return { entry, version: manifest.dshVersion }
  }

  private captureOutput(child: SidecarProcess): void {
    for (const [name, stream] of [['stdout', child.stdout], ['stderr', child.stderr]] as const) {
      stream.setEncoding('utf8')
      let pending = ''
      stream.on('data', chunk => {
        pending += chunk
        const lines = pending.split(/\r?\n/u)
        pending = lines.pop() ?? ''
        for (const line of lines) if (line.trim() !== '') this.logger.info(`dsh ${name}: ${line}`)
      })
    }
  }

  private async stopOwnedForSecurity(owned: OwnedProcess): Promise<void> {
    if (this.owned !== owned) return
    this.intentionalStop = true
    owned.child.kill('SIGTERM')
    await this.sleep(250)
    if (owned.child.exitCode === null && this.owned === owned) await this.forceKillTree(owned)
    if (this.owned === owned) this.owned = undefined
    this.intentionalStop = false
  }

  private async forceKillTree(owned: OwnedProcess): Promise<void> {
    if (this.owned !== owned || owned.child.exitCode !== null || owned.child.pid !== owned.pid) return
    const systemRoot = process.env.SystemRoot ?? 'C:\\Windows'
    await new Promise<void>((resolvePromise, reject) => {
      const killer = this.spawnProcess(join(systemRoot, 'System32', 'taskkill.exe'), ['/PID', String(owned.pid), '/T', '/F'], {
        shell: false, windowsHide: true, stdio: 'ignore',
      })
      killer.once('error', reject)
      killer.once('exit', () => { resolvePromise() })
    })
  }

  private async waitForExit(child: SidecarProcess, timeoutMs: number): Promise<boolean> {
    if (child.exitCode !== null) return true
    return await new Promise(resolvePromise => {
      const onExit = (): void => { clearTimeout(timer); resolvePromise(true) }
      const timer = setTimeout(() => { child.removeListener('exit', onExit); resolvePromise(false) }, timeoutMs)
      child.once('exit', onExit)
    })
  }

  private setStatus(status: HarnessStatus): void {
    this.status = status
    this.logger.info(`state=${status.phase} ownership=${status.ownership} message=${status.message}`)
    this.emit('status', this.getStatus())
  }

  private fail(errorCode: string, message: string): void {
    this.setStatus({ phase: 'error', message, ownership: 'none', errorCode })
  }

  private securityFail(errorCode: string, message: string): void {
    this.setStatus({ phase: 'security-error', message, ownership: this.owned === undefined ? 'none' : 'owned', errorCode })
  }
}
