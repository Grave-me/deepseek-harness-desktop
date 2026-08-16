import { cp, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
await mkdir(resolve(root, 'out', 'src', 'renderer'), { recursive: true })
await cp(resolve(root, 'src', 'renderer'), resolve(root, 'out', 'src', 'renderer'), { recursive: true })
