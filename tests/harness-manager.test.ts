import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import test from 'node:test'
import { HarnessManager } from '../src/main/harness-manager.js'
import { MemoryLogger } from '../src/main/logger.js'

test('compatible pre-existing DSH is external and is never stopped', async () => {
  const logger = new MemoryLogger()
  const manager = new HarnessManager('unused.exe', 'unused', logger, {
    portOpen: async () => true,
    probe: async () => ({ reachable: true, compatible: true, reason: 'ok' }),
    listeners: async () => [{ address: '127.0.0.1', port: 3080, pid: 42 }],
  })
  await manager.start()
  assert.equal(manager.getStatus().ownership, 'external')
  await manager.stop()
  assert.equal(manager.getStatus().ownership, 'external')
  await manager.restart()
  assert.equal(manager.getStatus().ownership, 'external')
})

test('occupied non-DSH port is reported and no process is spawned', async () => {
  let spawnCalled = false
  const manager = new HarnessManager('unused.exe', 'unused', new MemoryLogger(), {
    portOpen: async () => true,
    probe: async () => ({ reachable: true, compatible: false, reason: 'fingerprint missing' }),
    spawnProcess: ((..._arguments: unknown[]) => { spawnCalled = true; throw new Error('must not spawn') }) as never,
  })
  await manager.start()
  assert.equal(manager.getStatus().errorCode, 'PORT_CONFLICT')
  assert.equal(spawnCalled, false)
})

test('pre-existing non-loopback DSH is rejected as a security error', async () => {
  const manager = new HarnessManager('unused.exe', 'unused', new MemoryLogger(), {
    portOpen: async () => true,
    probe: async () => ({ reachable: true, compatible: true, reason: 'ok' }),
    listeners: async () => [{ address: '0.0.0.0', port: 3080, pid: 42 }],
  })
  await manager.start()
  assert.equal(manager.getStatus().phase, 'security-error')
  assert.equal(manager.getStatus().errorCode, 'EXTERNAL_NON_LOOPBACK')
})

class FakeChild extends EventEmitter {
  pid = 2468
  exitCode: number | null = null
  stdout = new PassThrough()
  stderr = new PassThrough()
  kill(): boolean {
    if (this.exitCode !== null) return false
    this.exitCode = 0
    queueMicrotask(() => { this.emit('exit', 0, null) })
    return true
  }
}

async function withRuntime(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-manager-test-'))
  try {
    await mkdir(join(root, 'pkg'), { recursive: true })
    await writeFile(join(root, 'pkg', 'cli.js'), '')
    await writeFile(join(root, 'runtime-manifest.json'), JSON.stringify({ dshVersion: '0.1.0-rc.6', binRelativePath: 'pkg/cli.js' }))
    await run(root)
  } finally { await rm(root, { recursive: true, force: true }) }
}

test('owned launch uses executable plus argument array and verifies listener PID', async () => {
  await withRuntime(async root => {
    const child = new FakeChild()
    let invocation: { executable: string; args: readonly string[]; shell: unknown } | undefined
    const spawnProcess = ((executable: string, args: readonly string[], options: { shell?: unknown }) => {
      invocation = { executable, args, shell: options.shell }
      return child
    }) as unknown as typeof spawn
    const manager = new HarnessManager('C:\\runtime\\node.exe', root, new MemoryLogger(), {
      portOpen: async () => false,
      probe: async () => ({ reachable: true, compatible: true, reason: 'ok' }),
      listeners: async () => [{ address: '127.0.0.1', port: 3080, pid: child.pid }],
      spawnProcess,
    })
    await manager.start()
    assert.equal(manager.getStatus().ownership, 'owned')
    assert.equal(invocation?.executable, 'C:\\runtime\\node.exe')
    assert.deepEqual(invocation?.args.slice(1), ['web', '--host', '127.0.0.1', '--port', '3080'])
    assert.equal(invocation?.shell, false)
    await manager.stop()
    assert.equal(manager.getStatus().phase, 'idle')
  })
})

test('owned launch enforces the 30 second readiness deadline', async () => {
  await withRuntime(async root => {
    const child = new FakeChild()
    let clock = 0
    const manager = new HarnessManager('node.exe', root, new MemoryLogger(), {
      portOpen: async () => false,
      probe: async () => ({ reachable: false, compatible: false, reason: 'not ready' }),
      spawnProcess: (() => child) as unknown as typeof spawn,
      now: () => clock,
      sleep: async milliseconds => { clock += milliseconds },
    })
    await manager.start()
    assert.equal(manager.getStatus().errorCode, 'START_TIMEOUT')
    assert.equal(child.exitCode, 0)
  })
})
