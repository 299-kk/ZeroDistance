const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
// Prefer a local Playwright installation, then the Codex workspace runtime.
let playwright
try { playwright = require('playwright') } catch {
  playwright = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))
}

async function run() {
  const root = path.resolve(__dirname, '..')
  const output = path.join(root, '.qa')
  fs.mkdirSync(output, { recursive: true })
  const profile = path.join(output, 'smoke', crypto.randomUUID()), game = path.join(profile, 'game')
  fs.mkdirSync(profile, { recursive: true })
  fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ configVersion: 1, gameFolderPolicyVersion: 1, gameDir: game, activeFolder: game, folders: [{ name: 'QA', path: game, isDefault: true }] }))
  const env = { ...process.env, ZERO_DISTANCE_DATA_DIR: profile }
  env.ZERO_DISTANCE_DISCOVERY_ROOTS = '[]'
  delete env.ELECTRON_RUN_AS_NODE
  const app = await playwright._electron.launch({ executablePath: require('electron'), args: [root], cwd: root, env, timeout: 30000 })
  await require('./electron-consent.cjs')(app)
  const failures = []
  try {
    let page
    for (let attempt = 0; attempt < 150; attempt++) {
      page = app.windows().find(p => p.url().includes('/index.html'))
      if (page) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert(page, 'Main window did not load')
    page.on('pageerror', error => failures.push(error.message))
    await page.locator('.zd-hero').waitFor({ timeout: 30000 })
    await page.locator('.zd-home-head h1').waitFor()
    await page.screenshot({ path: path.join(output, 'home.png') })
    const identity = await app.evaluate(({ app }) => ({ name: app.getName(), data: app.getPath('userData') }))
    assert.equal(identity.name, 'ZeroDistance')
    assert.equal(identity.data, profile)
    const settings = await page.evaluate(() => window.kamucl.invoke('settings:get'))
    assert.equal(settings.gameDir, game)
    assert.equal(settings.theme, 'transparent')

    await page.getByRole('button', { name: '账号管理', exact: true }).click()
    await page.getByRole('button', { name: '离线登录', exact: true }).click()
    await page.getByPlaceholder('离线账号用户名（3-16 位字母数字下划线）').fill('ZeroExplorer')
    await page.getByRole('button', { name: '添加离线账号', exact: true }).click()
    await page.locator('.account-name').filter({ hasText: 'ZeroExplorer' }).waitFor()
    await page.screenshot({ path: path.join(output, 'accounts.png') })
    const accounts = await page.evaluate(() => window.kamucl.invoke('accounts:list'))
    assert(accounts.some(a => a.type === 'offline' && a.username === 'ZeroExplorer'))
    assert(accounts.every(a => !a.accessToken && !a.refreshToken))

    await page.getByRole('button', { name: '启动台', exact: true }).click()
    await page.locator('.zd-play-button').click()
    await page.locator('.game-tab[data-tab="download"].active').waitFor({ timeout: 10000 })
    await page.screenshot({ path: path.join(output, 'games.png') })

    await page.getByRole('button', { name: '零距联机', exact: true }).click()
    await page.getByRole('heading', { name: '好友联机', exact: true }).waitFor()
    const offlineNotice = page.locator('.offline-connect-notice')
    if (await offlineNotice.isVisible()) await offlineNotice.getByRole('button', { name: '我知道了' }).click()
    assert.equal(await page.locator('.pick-card').count(), 3)
    await page.screenshot({ path: path.join(output, 'connect.png') })
    await page.locator('.pick-card').filter({ hasText: '虚拟局域网' }).click()
    await page.getByRole('heading', { name: '虚拟局域网', exact: true }).waitFor()
    await page.screenshot({ path: path.join(output, 'lan.png') })
    await page.getByRole('button', { name: '← 更换方式', exact: true }).click()
    await page.locator('.pick-card').filter({ hasText: 'FRP 内网穿透' }).click()
    await page.getByRole('heading', { name: 'FRP 内网穿透', exact: true }).waitFor()
    await page.screenshot({ path: path.join(output, 'frp.png') })
    assert.deepEqual(failures, [])
    fs.writeFileSync(path.join(output, 'smoke-result.json'), JSON.stringify({ ok: true, identity, offlineAccount: true, gameNavigation: true, connectionMethods: 3, rendererErrors: failures }, null, 2))
    console.log('ZeroDistance desktop smoke test passed; screenshots in .qa/')
  } finally { await app.close() }
}
run().catch(error => { console.error(error); process.exitCode = 1 })
