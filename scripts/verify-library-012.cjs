const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const assert = require('node:assert/strict')
let playwright
try { playwright = require('playwright') } catch {
  playwright = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function run() {
  const root = path.resolve(__dirname, '..'), data = path.join(root, '.qa/library-012', crypto.randomUUID())
  const search = path.join(data, 'search')
  const write = (relative, bytes) => {
    const dest = path.join(data, relative)
    fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, bytes)
    return dest
  }
  const png = fs.readFileSync(path.join(root, 'build/icon-512.png'))
  const records = [
    ['MC/.minecraft', 'PCL 整合包', '', 'PCL/Logo.png'],
    ['Games/minecraft', '自定义图标', 'file:custom.png', ''],
    ['Games/我的世界/.minecraft', '缺失图片回退', 'mob:does_not_exist', '']
  ]
  const files = []
  for (const [folder, id, icon, local] of records) {
    const base = `search/${folder}/versions/${id}`
    files.push(write(`${base}/${id}.json`, JSON.stringify({ id, _mcVersion: '1.20.1', _loader: 'fabric', _icon: icon, mainClass: 'net.minecraft.client.main.Main', libraries: [], _isolation: true })))
    write(`${base}/${id}.jar`, 'test fixture, never launched')
    if (local) files.push(write(`${base}/${local}`, png))
    if (icon.startsWith('file:')) files.push(write(`search/${folder}/.kamucl/icons/custom.png`, png))
  }
  write('search/Empty/MC/readme.txt', 'not a game')
  write('search/MC/.minecraft/private.png', png)
  const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
  const hashes = files.map(hash)
  const env = { ...process.env, ZERO_DISTANCE_DATA_DIR: path.join(data, 'user'), ZERO_DISTANCE_DISCOVERY_ROOTS: JSON.stringify([search]) }
  delete env.ELECTRON_RUN_AS_NODE
  const app = await playwright._electron.launch({ executablePath: require('electron'), args: [root], cwd: root, env, timeout: 30000 })
  await require('./electron-consent.cjs')(app)
  const passed = [], errors = []
  try {
    let page
    for (let i = 0; i < 200; i++) {
      page = app.windows().find(p => p.url().includes('/index.html'))
      if (page) break
      await delay(100)
    }
    assert(page)
    page.on('pageerror', error => errors.push(error.message))
    await page.locator('.zd-instance').first().waitFor({ timeout: 30000 })
    await page.waitForFunction(() => document.querySelectorAll('.zd-instance').length === 3)
    const settings = await page.evaluate(() => window.kamucl.invoke('settings:get'))
    const defaultFolder = settings.folders.find(f => f.isDefault).path
    assert.equal(defaultFolder, 'D:\\ZeroDistance\\.minecraft')
    assert.equal(settings.folders.length, 4)
    const icons = await page.locator('.zd-instance .instance-avatar').evaluateAll(async elements => {
      await Promise.all(elements.map(el => el.querySelector('img')?.decode().catch(() => undefined)))
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      return elements.map(el => ({ image: !!el.querySelector('img'), width: el.querySelector('img')?.naturalWidth || 0, fallback: !!el.querySelector('svg') }))
    })
    assert.equal(icons.filter(i => i.image && i.width > 0).length, 2)
    assert.equal(icons.filter(i => i.fallback).length, 1)
    assert(icons.every(i => i.width > 0 || i.fallback))
    await page.screenshot({ path: path.join(root, '.qa/library-home-012.png') })
    passed.push('Startup finds three local roots and shows all three instances on the home page; new installs default to D')
    passed.push('PCL and per-folder custom icons decode correctly; a missing mob image falls back to the vector icon')
    await page.locator('.zd-instance-select').filter({ hasText: 'PCL 整合包' }).click()
    await page.waitForFunction(() => document.querySelector('.zd-selected-game strong')?.textContent === 'PCL 整合包')
    const selectedSettings = await page.evaluate(() => window.kamucl.invoke('settings:get'))
    assert.equal(selectedSettings.activeFolder, path.join(search, 'MC/.minecraft'))
    assert.equal(selectedSettings.folders.find(f => f.isDefault).path, defaultFolder)
    const installed = await page.evaluate(() => window.kamucl.invoke('versions:installed', true))
    const pcl = installed.find(v => v.id === 'PCL 整合包')
    assert(pcl.iconPath.endsWith('Logo.png'))
    assert.equal(await page.evaluate(p => new Promise(resolve => {
      const url = new URL('kamucl-asset://local/image'); url.searchParams.set('path', p)
      const image = new Image(); image.onload = () => resolve(false); image.onerror = () => resolve(true); image.src = url.toString()
    }), path.join(search, 'MC/.minecraft/private.png')), true)
    await page.getByRole('button', { name: '我的游戏', exact: true }).click()
    await page.locator('.installed-row').first().waitFor()
    assert.equal(await page.locator('.installed-row').count(), 3)
    await page.getByRole('button', { name: '管理文件夹', exact: false }).click()
    await page.getByRole('button', { name: '查找本机游戏', exact: true }).click()
    await page.waitForFunction(async () => (await window.kamucl.invoke('folders:list')).folders.length === 4)
    passed.push('The game library and manual rescan reuse imported roots without duplicating them')
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await page.locator('.theme-option').first().waitFor()
    await page.evaluate(() => {
      window.__themeChecks = []
      const original = document.startViewTransition.bind(document)
      document.startViewTransition = callback => {
        const item = { start: performance.now(), ready: false, duration: '', end: 0 }
        window.__themeChecks.push(item)
        const transition = original(callback)
        transition.ready.then(() => { item.ready = true; item.duration = getComputedStyle(document.documentElement, '::view-transition-new(root)').animationDuration }).catch(() => {})
        transition.finished.then(() => { item.end = performance.now() }).catch(() => {})
        return transition
      }
    })
    await page.locator('.theme-option').filter({ hasText: '白昼' }).click()
    await page.waitForFunction(() => window.__themeChecks.at(-1)?.ready)
    await page.screenshot({ path: path.join(root, '.qa/theme-switch-012.png') })
    await page.waitForFunction(() => window.__themeChecks.at(-1)?.end > 0)
    let checks = await page.evaluate(() => window.__themeChecks)
    assert.equal(checks[0].duration, '0.5s')
    assert(checks[0].end - checks[0].start >= 450)
    await page.locator('.theme-option').filter({ hasText: '落日' }).click()
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'black-orange' && window.__themeChecks.at(-1)?.ready)
    await page.locator('.theme-option').filter({ hasText: '云间' }).evaluate(el => el.click())
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'white-pink' && window.__themeChecks.at(-1)?.end > 0)
    passed.push('Theme changes animate for 500 ms and rapid choices settle on the last theme')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const before = (await page.evaluate(() => window.__themeChecks)).length
    await page.locator('.theme-option').filter({ hasText: '远山' }).click()
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'transparent')
    checks = await page.evaluate(() => window.__themeChecks)
    assert.equal(checks.length, before)
    passed.push('Reduced-motion preference switches the theme directly without animation')
    const remove = path.join(search, records[1][0])
    await page.evaluate(p => window.kamucl.invoke('folders:remove', p), remove)
    const rescan = await page.evaluate(() => window.kamucl.invoke('folders:discover'))
    assert.equal(rescan.added.length, 0)
    assert.equal(rescan.folders.length, 3)
    assert(fs.existsSync(path.join(remove, 'versions', records[1][1])))
    assert.deepEqual(files.map(hash), hashes)
    assert.deepEqual(errors, [])
    passed.push('Unregistered roots stay excluded on rescan; imports leave all original fixture files unchanged')
    const report = { ok: true, passed, defaultFolder, icons, themeChecks: checks, rendererErrors: errors }
    fs.writeFileSync(path.join(root, '.qa/library-result-012.json'), JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report, null, 2))
  } finally { await app.close() }
}
run().catch(error => { console.error(error); process.exitCode = 1 })
