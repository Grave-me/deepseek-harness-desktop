import { createIsolatedProfile, removeProfile, runtimePaths, startSidecar, stopSidecar, verifyOwnedLoopback, waitUntilReady } from './smoke-lib.mjs'

const paths = await runtimePaths()
const profile = await createIsolatedProfile()
try {
  for (let cycle = 1; cycle <= 20; cycle += 1) {
    const child = startSidecar(paths, profile)
    try { await waitUntilReady(child); await verifyOwnedLoopback(child) } finally { await stopSidecar(child) }
    console.log(`Cycle ${cycle}/20 passed`)
  }
} finally { await removeProfile(profile) }
