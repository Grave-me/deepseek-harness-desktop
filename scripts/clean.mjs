import { rm } from 'node:fs/promises'

for (const path of ['out']) {
  await rm(new URL(`../${path}`, import.meta.url), { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
}
