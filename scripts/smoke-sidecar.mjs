import { createIsolatedProfile, removeProfile, runtimePaths, startSidecar, stopSidecar, verifyOwnedLoopback, waitUntilReady } from './smoke-lib.mjs'

const paths = await runtimePaths()
const profile = await createIsolatedProfile()
const child = startSidecar(paths, profile)
try {
  await waitUntilReady(child)
  await verifyOwnedLoopback(child)
  console.log(`Bundled Node ${paths.manifest.dshVersion} sidecar readiness passed with isolated profile and restricted PATH`)
} finally {
  await stopSidecar(child)
  await removeProfile(profile)
}
