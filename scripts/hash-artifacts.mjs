import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const dist = resolve(import.meta.dirname, '..', process.env.DSH_BUILD_OUTPUT_DIR ?? 'artifacts')
for (const name of await readdir(dist)) {
  if (!name.endsWith('.exe')) continue
  const hash = createHash('sha256').update(await readFile(join(dist, name))).digest('hex')
  await writeFile(join(dist, `${name}.sha256`), `${hash}  ${name}\n`)
  console.log(`${hash}  ${name}`)
}
