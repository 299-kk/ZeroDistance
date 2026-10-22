const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict')
let playwright
try { playwright = require('playwright') } catch { playwright = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')) }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function run() {
  const root = path.resolve(__dirname, '..'), data = path.join(root, '.qa/consent', crypto.randomUUID())
  const executablePath = process.env.ZERO_DISTANCE_EXECUTABLE || require('electron')
  const packaged = !!process.env.ZERO_DISTANCE_EXECUTABLE
  const env = { ...process.env, ZERO_DISTANCE_DATA_DIR: data, ZERO_DISTANCE_DISCOVERY_ROOTS: '[]' }; delete env.ELECTRON_RUN_AS_NODE
  const launch = (profile = data) => playwright._electron.launch({ executablePath, args: [...(packaged ? [] : [root]), `--user-data-dir=${profile}`, '--no-auto-discovery', '--disable-features=CalculateNativeWinOcclusion', '--disable-renderer-backgrounding'], cwd: root, env: { ...env, ZERO_DISTANCE_DATA_DIR: profile }, timeout: 30000 })
  const pageFor = async (app, name) => { for (let n = 0; n < 250; n++) { const page = app.windows().find(p => p.url().includes('/' + name + '.html')); if (page) return page; await delay(80) }; throw new Error('Missing ' + name) }
  const report = { packaged, ok: false, passed: [], readingElapsedMs: 0 }
  const file = path.join(data, 'consent.json')
  let app = await launch()
  try {
    let page = await pageFor(app, 'consent')
    await page.getByRole('heading', { name: '使用声明与免责声明', exact: true }).waitFor()
    const start = Date.now()
    assert.equal(app.windows().some(p => p.url().includes('/index.html')), false)
    assert.equal(fs.existsSync(file), false)
    assert.equal(fs.existsSync(path.join(data, 'settings.json')), false)
    const early = await page.evaluate(() => window.kamucl.invoke('consent:accept'))
    assert.equal(early.ok, false)
    assert.equal(await page.evaluate(async () => { try { await window.kamucl.invoke('accounts:list'); return true } catch { return false } }), false)
    report.passed.push('No launcher window, account IPC, settings or consent record before agreement; early IPC acceptance is rejected')
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('/consent.html')).hide())
    const hiddenBefore = await page.evaluate(() => window.kamucl.invoke('consent:ready'))
    await delay(1200)
    const hiddenAfter = await page.evaluate(() => window.kamucl.invoke('consent:ready'))
    assert.equal(hiddenAfter.remainingMs, hiddenBefore.remainingMs)
    await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('/consent.html')); w.show(); w.focus() })
    const button = page.getByRole('button', { name: '同意并继续', exact: true })
    await button.waitFor({ timeout: 10000 })
    report.readingElapsedMs = Date.now() - start
    assert(report.readingElapsedMs >= 3900)
    // Seed an isolated game root after verifying that the gated app created no settings.
    const fixtureGame = path.join(data, 'game')
    fs.writeFileSync(path.join(data, 'settings.json'), JSON.stringify({ configVersion: 1, gameFolderPolicyVersion: 1, gameDir: fixtureGame, activeFolder: fixtureGame, folders: [{ path: fixtureGame, name: 'QA', isDefault: true }] }))
    await button.click()
    page = await pageFor(app, 'index'); await page.locator('.zd-hero').waitFor({ timeout: 30000 })
    assert(fs.existsSync(file))
    const saved = fs.readFileSync(file, 'utf8')
    const record = JSON.parse(saved)
    assert.equal(record.version, require('../src/shared/disclaimer.json').version)
    assert.equal(Object.keys(record).length, 4)
    report.passed.push('Foreground reading requires at least three seconds; hidden time pauses; agreeing persists the current notice and opens the launcher')
    await page.evaluate(() => { void window.kamucl.invoke('legal:review') })
    const review = await pageFor(app, 'consent')
    const close = review.getByRole('button', { name: '关闭', exact: true }); await close.waitFor(); await close.click()
    assert.equal(fs.readFileSync(file, 'utf8'), saved)
    report.passed.push('The usage notice can be reviewed without a new delay or modifying acceptance')
    await app.close(); app = await launch()
    page = await pageFor(app, 'index'); await page.locator('.zd-hero').waitFor({ timeout: 30000 })
    assert.equal(app.windows().some(p => p.url().includes('/consent.html')), false)
    assert.equal(fs.readFileSync(file, 'utf8'), saved)
    report.passed.push('Restart skips the notice only when the saved version and content digest match')
    await app.close()
    fs.writeFileSync(file, JSON.stringify({ ...record, contentHash: 'outdated' }))
    app = await launch(); page = await pageFor(app, 'consent')
    const closed = app.waitForEvent('close')
    await page.getByRole('button', { name: '不同意并退出', exact: true }).click(); await closed
    report.passed.push('A changed content digest reopens the gate, and refusal exits')
    const fresh = path.join(data, 'decline-profile')
    app = await launch(fresh); page = await pageFor(app, 'consent')
    const exited = app.waitForEvent('close')
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('/consent.html')).close()); await exited
    assert.equal(fs.existsSync(path.join(fresh, 'consent.json')), false)
    assert.equal(fs.existsSync(path.join(fresh, 'settings.json')), false)
    report.passed.push('Closing a fresh gate exits without creating agreement or loading the application')
    report.ok = true
  } finally {
    await app.close().catch(() => {})
    fs.writeFileSync(path.join(root, '.qa', packaged ? 'consent-packaged-result.json' : 'consent-result.json'), JSON.stringify(report, null, 2))
  }
  console.log(JSON.stringify(report, null, 2))
}
run().catch(error => { console.error(error); process.exitCode = 1 })
