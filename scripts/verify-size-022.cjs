const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict')
require('tsx/cjs')
const { tag, writeTypedNbt, readTypedNbt } = require('../src/main/core/typedNbt.ts')
let playwright
try { playwright = require('playwright') } catch { playwright = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')) }
async function run() {
  const root = path.resolve(__dirname, '..'), output = path.join(root, '.qa/size-022', crypto.randomUUID()), user = path.join(output, 'user'), game = path.join(output, 'game'), schematics = path.join(game, 'schematics')
  fs.mkdirSync(schematics, { recursive: true }); fs.mkdirSync(user, { recursive: true })
  fs.writeFileSync(path.join(user, 'settings.json'), JSON.stringify({ configVersion: 1, gameFolderPolicyVersion: 1, gameDir: game, activeFolder: game, folders: [{ name: 'QA', path: game, isDefault: true }], autoUpdate: false }))
  const intList = values => tag(9, values.map(value => tag(3, value)), 3)
  for (const [version, dataVersion] of [['1.20.1', 3465], ['26.3', 5023]]) fs.writeFileSync(path.join(schematics, version + '.nbt'), writeTypedNbt(tag(10, { DataVersion: tag(3, dataVersion), size: intList([1, 1, 1]), palette: tag(9, [tag(10, { Name: tag(8, 'minecraft:stone') })], 10), blocks: tag(9, [tag(10, { pos: intList([0, 0, 0]), state: tag(3, 0) })], 10), entities: tag(9, [], 10) })))
  fs.writeFileSync(path.join(schematics, 'legacy.schematic'), writeTypedNbt(tag(10, { Width: tag(2, 1), Height: tag(2, 1), Length: tag(2, 1), Blocks: tag(7, Buffer.from([1])), Data: tag(7, Buffer.from([0])), Entities: tag(9, [], 10), TileEntities: tag(9, [], 10) })))
  const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
  const hashes = Object.fromEntries(fs.readdirSync(schematics).map(name => [name, digest(path.join(schematics, name))]))
  const env = { ...process.env, ZERO_DISTANCE_DATA_DIR: user, ZERO_DISTANCE_DISCOVERY_ROOTS: '[]' }; delete env.ELECTRON_RUN_AS_NODE
  const executablePath = process.env.ZERO_DISTANCE_EXECUTABLE || require('electron')
  const args = [...(process.env.ZERO_DISTANCE_EXECUTABLE ? ['--user-data-dir=' + user, '--no-auto-discovery'] : [root]), '--disable-features=CalculateNativeWinOcclusion', '--disable-renderer-backgrounding']
  const app = await playwright._electron.launch({ executablePath, args, cwd: root, env, timeout: 60000 })
  const report = { ok: false, packaged: !!process.env.ZERO_DISTANCE_EXECUTABLE, passed: [], errors: [] }
  try {
    await require('./electron-consent.cjs')(app)
    let page
    for (let n = 0; n < 200; n++) { page = app.windows().find(p => p.url().includes('/index.html')); if (page) break; await new Promise(resolve => setTimeout(resolve, 100)) }
    assert(page); page.on('pageerror', error => report.errors.push(error.message)); await page.locator('.zd-hero').waitFor({ timeout: 30000 })
    const versions = await page.evaluate(() => window.kamucl.invoke('projections:versions'))
    const original = require('../src/main/core/projectionRegistries.json')
    assert.deepEqual(versions.map(v => [v.version, v.dataVersion]), original.supported.map(v => [v.version, v.dataVersion]))
    report.passed.push('Actual Electron main process loads every supported version from the shared compressed registry')
    const catalog = await page.evaluate(() => window.kamucl.invoke('projections:list'))
    assert.equal(catalog.entries.length, 3); assert.deepEqual(catalog.warnings, [])
    for (const entry of catalog.entries) { assert.equal(entry.blocks, 1, entry.name); assert.equal(entry.error, undefined, entry.name) }
    assert.equal(catalog.entries.find(e => e.name === '1.20.1.nbt').gameVersion, '1.20.1')
    const selected = catalog.entries.find(e => e.name === '26.3.nbt'); assert.equal(selected.gameVersion, '26.3')
    assert.equal(catalog.entries.find(e => e.name === 'legacy.schematic').dataVersion, 1343)
    report.passed.push('Real worker reads modern 1.20.1 and 26.3 structures plus legacy numeric block mappings')
    const analysis = await page.evaluate(id => window.kamucl.invoke('projections:analyze', id, 'schem', '26.3'), selected.id)
    assert.equal(analysis.unsupported, undefined); assert.deepEqual(analysis.differences, [])
    const result = await page.evaluate(id => window.kamucl.invoke('projections:convert', id, {}), analysis.id)
    assert(path.resolve(result.path).startsWith(path.resolve(schematics) + path.sep))
    const converted = readTypedNbt(fs.readFileSync(result.path)).root.value.Schematic.value
    assert.equal(converted.DataVersion.value, 5023); assert(Object.hasOwn(converted.Blocks.value.Palette.value, 'minecraft:stone'))
    for (const [name, hash] of Object.entries(hashes)) assert.equal(digest(path.join(schematics, name)), hash)
    report.passed.push('Packaged worker analyzes and converts a 26.3 structure into Sponge format while preserving source hashes')
    assert.deepEqual(report.errors, []); report.ok = true
  } finally { await app.close(); fs.writeFileSync(path.join(root, '.qa/size-result-022.json'), JSON.stringify(report, null, 2)) }
  console.log(JSON.stringify(report, null, 2))
}
run().catch(error => { console.error(error); process.exitCode = 1 })
