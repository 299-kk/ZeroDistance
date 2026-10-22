const path = require('node:path')
const fs = require('node:fs')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
let playwright
try { playwright = require('playwright') } catch {
  playwright = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))
}
async function run() {
  const root = path.resolve(__dirname, '..')
  const executablePath = process.env.ZERO_DISTANCE_EXECUTABLE || path.join(root, 'release/win-unpacked/ZeroDistance.exe')
  const env = { ...process.env }
  const profile = path.join(root, '.qa/packaged-' + require('../package.json').version, crypto.randomUUID())
  fs.mkdirSync(profile, { recursive: true })
  const gameDir = path.join(profile, 'game')
  fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ configVersion: 1, gameFolderPolicyVersion: 1, gameDir, activeFolder: gameDir, folders: [{ name: 'QA', path: gameDir, isDefault: true }], autoUpdate: false }))
  delete env.ELECTRON_RUN_AS_NODE
  const app = await playwright._electron.launch({ executablePath, args: ['--user-data-dir=' + profile, '--no-auto-discovery', '--disable-features=CalculateNativeWinOcclusion', '--disable-renderer-backgrounding'], cwd: root, env, timeout: 60000 })
  await require('./electron-consent.cjs')(app)
  try {
    let page
    for (let attempt = 0; attempt < 200; attempt++) {
      page = app.windows().find(p => p.url().includes('/index.html'))
      if (page) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert(page, 'Packaged main window did not load')
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.locator('.zd-hero').waitFor({ timeout: 30000 })
    const identity = await app.evaluate(({ app }) => ({ name: app.getName(), version: app.getVersion(), packaged: app.isPackaged, userData: app.getPath('userData') }))
    assert.equal(identity.name, 'ZeroDistance')
    assert.equal(identity.version, require('../package.json').version)
    assert.equal(identity.packaged, true)
    await page.screenshot({ path: path.join(root, '.qa/packaged-home.png') })
    // Read-only requests through the exact IPC path used by the application.
    const services = await page.evaluate(async () => {
      const probe = async (channel, arg, summarize) => {
        try { const value = await window.kamucl.invoke(channel, arg); return { ok: true, ...summarize(value) } }
        catch (e) { return { ok: false, error: String(e).replace(/https?:\/\/\S+/g, '[endpoint]') } }
      }
      const [versions, mods, modpacks, java] = await Promise.all([
        probe('versions:manifest', false, v => ({ count: v.length, latest: v.find(item => item.type === 'release')?.id })),
        probe('community:search', { keyword: 'Sodium', source: 'modrinth', kind: 'mod', offset: 0, limit: 3 }, v => ({ count: v.items.length, total: v.total, title: v.items[0]?.title })),
        probe('community:search', { keyword: '', source: 'modrinth', kind: 'modpack', offset: 0, limit: 3 }, v => ({ count: v.items.length, total: v.total, title: v.items[0]?.title })),
        probe('java:list', undefined, v => ({ count: v.length, versions: v.map(j => j.major).filter(Boolean) }))
      ])
      const recommendations = await Promise.all([
        ['idMHQ4n2', '1.20.1', 'fabric']
      ].map(async ([project, mcVersion, loader]) => {
        try {
          const files = await window.kamucl.invoke('community:files', 'modrinth', project, { kind: 'mod', mcVersion, loader })
          return { project, mcVersion, loader, ok: files.length > 0 && files.every(f => f.size > 0 && f.gameVersions.includes(mcVersion) && f.loaders.includes(loader)), files: files.length, bytes: files[0]?.size }
        } catch (e) { return { project, ok: false, error: String(e) } }
      }))
      return { versions, mods, modpacks, java, recommendations }
    })
    assert.deepEqual(errors, [])
    const report = { executable: path.basename(executablePath), identity, rendererErrors: errors, services }
    fs.writeFileSync(path.join(root, '.qa', path.basename(executablePath).startsWith('ZeroDistance-') ? 'portable-result.json' : 'packaged-result.json'), JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report, null, 2))
  } finally { await app.close() }
}
run().catch(e => { console.error(e); process.exitCode = 1 })
