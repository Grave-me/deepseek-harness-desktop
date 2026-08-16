import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const target = process.argv[2]
if (!['dir', 'nsis'].includes(target)) throw new Error('usage: node scripts/build-windows.mjs <dir|nsis>')
const root = resolve(import.meta.dirname, '..')
const cache = join(root, 'build', 'cache', 'electron-builder')
const output = process.env.DSH_BUILD_OUTPUT_DIR
await mkdir(cache, { recursive: true })
const cli = join(root, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js')
const args = [cli, '--win', target, '--x64']
if (output) args.push(`--config.directories.output=${resolve(root, output)}`)
if (process.env.DSH_TEST_VERSION) args.push(`--config.extraMetadata.version=${process.env.DSH_TEST_VERSION}`)
const child = spawn(process.execPath, args, {
  cwd: root,
  env: { ...process.env, ELECTRON_BUILDER_CACHE: cache },
  shell: false,
  windowsHide: true,
  stdio: 'inherit',
})
const code = await new Promise((resolvePromise, reject) => {
  child.once('error', reject)
  child.once('exit', resolvePromise)
})
if (code !== 0) throw new Error(`electron-builder exited with ${code}`)
