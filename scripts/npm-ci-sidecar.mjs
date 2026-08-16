import { spawn } from 'node:child_process'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const npmCli = process.env.npm_execpath

if (typeof npmCli !== 'string' || npmCli.length === 0) {
  throw new Error('npm_execpath is unavailable; run this script through npm')
}

const child = spawn(process.execPath, [npmCli, 'ci', '--prefix', join(root, 'sidecar')], {
  cwd: root,
  shell: false,
  windowsHide: true,
  stdio: 'inherit',
})

const code = await new Promise((resolvePromise, reject) => {
  child.once('error', reject)
  child.once('exit', resolvePromise)
})

if (code !== 0) throw new Error(`sidecar npm ci exited with ${code}`)
