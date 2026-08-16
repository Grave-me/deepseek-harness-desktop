import { createHash } from 'node:crypto'
import { access, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { join, resolve } from 'node:path'

const VERSION = '24.18.0'
const ARCHIVE = `node-v${VERSION}-win-x64.zip`
const EXPECTED_SHA256 = '0ae68406b42d7725661da979b1403ec9926da205c6770827f33aac9d8f26e821'
const root = resolve(import.meta.dirname, '..')
const cacheDir = join(root, 'build', 'cache')
const archivePath = join(cacheDir, ARCHIVE)
const extractDir = join(cacheDir, `node-v${VERSION}-win-x64`)
const runtimeDir = join(root, 'build', 'runtime', 'node')

async function exists(path) {
  try { await access(path); return true } catch { return false }
}

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex')
}

async function run(file, args) {
  await new Promise((resolvePromise, reject) => {
    const child = spawn(file, args, { shell: false, stdio: 'inherit', windowsHide: true })
    child.once('error', reject)
    child.once('exit', code => code === 0 ? resolvePromise() : reject(new Error(`${file} exited with ${code}`)))
  })
}

await mkdir(cacheDir, { recursive: true })
if (!await exists(archivePath) || await sha256(archivePath) !== EXPECTED_SHA256) {
  const response = await fetch(`https://nodejs.org/dist/v${VERSION}/${ARCHIVE}`)
  if (!response.ok) throw new Error(`Node download failed: HTTP ${response.status}`)
  await writeFile(archivePath, Buffer.from(await response.arrayBuffer()))
}
const actual = await sha256(archivePath)
if (actual !== EXPECTED_SHA256) throw new Error(`Node archive hash mismatch: ${actual}`)

if (!await exists(join(extractDir, 'node.exe'))) {
  await rm(extractDir, { recursive: true, force: true })
  await run('tar.exe', ['-xf', archivePath, '-C', cacheDir])
}
await rm(runtimeDir, { recursive: true, force: true })
await mkdir(runtimeDir, { recursive: true })
await cp(join(extractDir, 'node.exe'), join(runtimeDir, 'node.exe'))
await cp(join(extractDir, 'LICENSE'), join(runtimeDir, 'LICENSE.node.txt'))
await writeFile(join(runtimeDir, 'VERSION'), `${VERSION}\n`)
console.log(`Prepared Node ${VERSION} (${actual})`)
