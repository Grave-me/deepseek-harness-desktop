import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const source = join(root, 'sidecar')
const target = join(root, 'build', 'runtime', 'sidecar')
const packageRoot = join(source, 'node_modules', '@deepseek-ai', 'dsh')
const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
const binEntry = manifest.bin?.dsh
if (typeof binEntry !== 'string' || binEntry.length === 0) {
  throw new Error('@deepseek-ai/dsh package.json does not define bin.dsh')
}
const resolvedEntry = resolve(packageRoot, binEntry)
if (!resolvedEntry.startsWith(`${resolve(packageRoot)}\\`) && resolvedEntry !== resolve(packageRoot)) {
  throw new Error('DSH bin entry escapes its package directory')
}

await rm(target, { recursive: true, force: true })
await mkdir(join(target, 'app'), { recursive: true })
await cp(join(source, 'node_modules'), join(target, 'app', 'node_modules'), {
  recursive: true,
  filter: path => !path.includes(`${join(source, 'node_modules', '.cache')}`),
})
await cp(join(source, 'package.json'), join(target, 'package.json'))
await cp(join(source, 'package-lock.json'), join(target, 'package-lock.json'))
await writeFile(join(target, 'runtime-manifest.json'), JSON.stringify({
  dshVersion: manifest.version,
  binRelativePath: join('app', 'node_modules', '@deepseek-ai', 'dsh', binEntry).replaceAll('\\', '/'),
}, null, 2) + '\n')
console.log(`Prepared @deepseek-ai/dsh ${manifest.version}; bin.dsh=${binEntry}`)
