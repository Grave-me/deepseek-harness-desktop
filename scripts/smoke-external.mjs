import { HarnessManager } from '../out/src/main/harness-manager.js'
import { MemoryLogger } from '../out/src/main/logger.js'
import { createIsolatedProfile, removeProfile, runtimePaths, startSidecar, stopSidecar, waitUntilReady } from './smoke-lib.mjs'

const paths = await runtimePaths()
const profile = await createIsolatedProfile()
const external = startSidecar(paths, profile)
try {
  await waitUntilReady(external)
  const manager = new HarnessManager(paths.node, 'unused', new MemoryLogger())
  await manager.start()
  if (manager.getStatus().ownership !== 'external') throw new Error('manager did not classify pre-existing DSH as external')
  await manager.restart()
  await manager.stop()
  if (external.exitCode !== null) throw new Error('desktop manager terminated an external DSH')
  await waitUntilReady(external, 2_000)
  console.log('Pre-existing DSH ownership and no-stop behavior passed')
} finally {
  await stopSidecar(external)
  await removeProfile(profile)
}
