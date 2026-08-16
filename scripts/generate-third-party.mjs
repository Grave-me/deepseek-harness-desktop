import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const lock = JSON.parse(await readFile(join(root, 'sidecar', 'package-lock.json'), 'utf8'))
const packagesByIdentity = new Map()
const installScriptPackages = []
for (const [path, value] of Object.entries(lock.packages ?? {})) {
  if (!path.startsWith('node_modules/') || typeof value !== 'object' || value === null) continue
  const name = path.split('node_modules/').at(-1)
  if (!name) continue
  const item = { name, version: value.version ?? 'unknown', license: value.license ?? 'UNKNOWN' }
  packagesByIdentity.set(`${item.name}@${item.version}`, item)
  if (value.hasInstallScript === true) installScriptPackages.push(`${item.name}@${item.version}`)
}
const packages = [...packagesByIdentity.values()]
packages.sort((a, b) => a.name.localeCompare(b.name))
installScriptPackages.sort()

async function findNativeFiles(directory, prefix = '') {
  const found = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    if (entry.isDirectory()) found.push(...await findNativeFiles(join(directory, entry.name), relative))
    else if (entry.isFile() && entry.name.endsWith('.node')) found.push(relative)
  }
  return found
}
const nativeModules = (await findNativeFiles(join(root, 'build', 'runtime', 'sidecar', 'app', 'node_modules'))).sort()
const sourceDateEpoch = process.env.SOURCE_DATE_EPOCH
const epochSeconds = sourceDateEpoch === undefined ? undefined : Number(sourceDateEpoch)
if (epochSeconds !== undefined && !Number.isFinite(epochSeconds)) throw new Error('SOURCE_DATE_EPOCH must be a Unix timestamp')
const created = epochSeconds === undefined ? new Date().toISOString() : new Date(epochSeconds * 1_000).toISOString()
const versions = {
  desktop: '0.1.0', electron: '43.2.0', node: '24.18.0', dsh: '0.1.0-rc.6',
  generatedAt: created, installScriptPackages, nativeModules, packages,
}
await writeFile(join(root, 'VERSIONS.json'), JSON.stringify(versions, null, 2) + '\n')
const rows = packages.map(item => `| \`${item.name}\` | \`${item.version}\` | ${item.license} |`).join('\n')
await writeFile(join(root, 'THIRD_PARTY_NOTICES.md'), `# Third-party notices\n\nGenerated from the locked, installed DSH sidecar closure. Package license texts remain in the packaged node_modules directories.\n\nThe application redistributes Node.js 24.18.0; its complete license file is shipped as \`runtime/node/LICENSE.node.txt\`. Electron's distribution includes its own LICENSE and Chromium notices. DeepSeek Harness is MIT licensed and its package LICENSE remains in the sidecar.\n\n| Package | Version | Declared license |\n|---|---:|---|\n${rows}\n`)

const sbomComponents = [
  { name: 'deepseek-harness-desktop', version: '0.1.0', license: 'MIT' },
  { name: 'electron', version: '43.2.0', license: 'MIT' },
  { name: 'node', version: '24.18.0', license: 'MIT' },
  ...packages,
]
const spdxPackages = sbomComponents.map((item, index) => ({
  SPDXID: `SPDXRef-Package-${index + 1}`,
  name: item.name,
  versionInfo: item.version,
  downloadLocation: 'NOASSERTION',
  filesAnalyzed: false,
  licenseConcluded: 'NOASSERTION',
  licenseDeclared: item.license,
  copyrightText: 'NOASSERTION',
}))
await writeFile(join(root, 'SBOM.spdx.json'), JSON.stringify({
  spdxVersion: 'SPDX-2.3',
  dataLicense: 'CC0-1.0',
  SPDXID: 'SPDXRef-DOCUMENT',
  name: 'DeepSeek-Harness-Desktop-0.1.0',
  documentNamespace: `https://local.invalid/spdx/deepseek-harness-desktop/0.1.0/${created}`,
  creationInfo: { created, creators: ['Tool: DeepSeek-Harness-Desktop generate-third-party.mjs'] },
  packages: spdxPackages,
  relationships: spdxPackages.map(item => ({ spdxElementId: 'SPDXRef-DOCUMENT', relationshipType: 'DESCRIBES', relatedSpdxElement: item.SPDXID })),
}, null, 2) + '\n')
