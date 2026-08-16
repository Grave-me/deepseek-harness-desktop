import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { ConfigStore, DEFAULT_CONFIG } from '../src/main/app-config.js'

test('configuration is local, atomic, and defaults missing fields', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-desktop-config-'))
  try {
    const store = new ConfigStore(directory)
    assert.deepEqual(await store.load(), DEFAULT_CONFIG)
    await writeFile(store.path, JSON.stringify({ minimizeToTray: false, window: { width: 900 } }))
    const loaded = await store.load()
    assert.equal(loaded.minimizeToTray, false)
    assert.equal(loaded.window.width, 900)
    assert.equal(loaded.window.height, DEFAULT_CONFIG.window.height)
    await store.save(loaded)
    assert.equal(JSON.parse(await readFile(store.path, 'utf8')).window.width, 900)
    await Promise.all(Array.from({ length: 20 }, async (_value, index) => {
      await store.save({ ...loaded, window: { ...loaded.window, width: 1000 + index } })
    }))
    assert.equal(JSON.parse(await readFile(store.path, 'utf8')).window.width, 1019)
  } finally { await rm(directory, { recursive: true, force: true }) }
})
