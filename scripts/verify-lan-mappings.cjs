// Read-only compatibility probe against official 1.20.1 mappings and an existing local client.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict'), Zip = require('adm-zip')
require('tsx/cjs')
const { authenticationGetter, mojangLanSymbols, intermediaryLanSymbols, forgeLanSymbols } = require('../src/main/core/lanClass.ts')
async function run() {
  const directory = path.resolve(__dirname, '../.qa/lan-mapping-probe'); fs.mkdirSync(directory, { recursive: true })
  async function download(url, name) { const file = path.join(directory, name); if (fs.existsSync(file)) return fs.readFileSync(file); const response = await fetch(url, { signal: AbortSignal.timeout(45000) }); assert(response.ok, url + ': ' + response.status); const bytes = Buffer.from(await response.arrayBuffer()); fs.writeFileSync(file, bytes); return bytes }
  const catalog = JSON.parse(await download('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json', 'catalog.json'))
  const metadata = JSON.parse(await download(catalog.versions.find(v => v.id === '1.20.1').url, '1.20.1.json'))
  const mapping = await download(metadata.downloads.client_mappings.url, '1.20.1-client.txt')
  assert.equal(crypto.createHash('sha1').update(mapping).digest('hex'), metadata.downloads.client_mappings.sha1)
  const original = mojangLanSymbols(mapping.toString())
  const fabric = new Zip(await download('https://maven.fabricmc.net/net/fabricmc/intermediary/1.20.1/intermediary-1.20.1-v2.jar', 'fabric.jar'))
  const intermediary = intermediaryLanSymbols(fabric.readAsText('mappings/mappings.tiny'), original)
  const xml = (await download('https://maven.minecraftforge.net/de/oceanlabs/mcp/mcp_config/maven-metadata.xml', 'mcp-metadata.xml')).toString()
  const version = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map(m => m[1]).filter(id => /^1\.20\.1-\d{8}\.\d{6}$/.test(id)).sort().at(-1)
  assert(version)
  const mcp = new Zip(await download(`https://maven.minecraftforge.net/de/oceanlabs/mcp/mcp_config/${version}/mcp_config-${version}.zip`, 'forge-' + version + '.zip'))
  const forge = forgeLanSymbols(mcp.readAsText('config/joined.tsrg'), original)
  const client = 'D:/MC/.minecraft/versions/乌托邦探险之旅3.5.2/乌托邦探险之旅3.5.2.jar'
  const digest = () => crypto.createHash('sha256').update(fs.readFileSync(client)).digest('hex'), before = digest(), zip = new Zip(client)
  assert(authenticationGetter(zip.readFile(original.server + '.class'), original.getter)); assert(zip.getEntry(original.integrated + '.class'))
  assert.equal(intermediary.getter, 'method_3828'); assert.equal(forge.getter, 'm_129797_'); assert.equal(digest(), before)
  const report = { ok: true, minecraft: '1.20.1', original, fabric: intermediary, forge, mcpVersion: version, gameJarUnchanged: true, gameJarSha256: before }
  fs.writeFileSync(path.resolve(__dirname, '../.qa/lan-mapping-result.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2))
}
run().catch(error => { console.error(error); process.exitCode = 1 })
