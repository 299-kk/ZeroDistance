const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
let playwright
try { playwright = require('playwright') } catch {
  playwright = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(check, description, timeout = 5000) {
  const end = Date.now() + timeout
  while (Date.now() < end) { if (await check()) return; await delay(100) }
  throw new Error('Timed out: ' + description)
}
async function run() {
  const root = path.resolve(__dirname, '..')
  const bundled = require('../src/shared/landscape-images.json')
  const data = path.join(root, '.qa/gallery-userdata')
  fs.mkdirSync(data, { recursive: true })
  // A fresh settings file is confined to this test's own data directory.
  const settingsFile = path.join(data, 'settings.json')
  if (fs.existsSync(settingsFile)) {
    const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'))
    settings.launchThumbnail = { image: '', images: [], fit: 'crop', intervalSeconds: 6.5 }
    fs.writeFileSync(settingsFile, JSON.stringify(settings))
  }
  const env = { ...process.env, ZERO_DISTANCE_DATA_DIR: data }
  env.ZERO_DISTANCE_DISCOVERY_ROOTS = '[]'
  delete env.ELECTRON_RUN_AS_NODE
  const app = await playwright._electron.launch({ executablePath: require('electron'), args: [root], cwd: root, env, timeout: 30000 })
  await require('./electron-consent.cjs')(app)
  const errors = [], passed = []
  try {
    let page
    for (let attempt = 0; attempt < 150; attempt++) {
      page = app.windows().find(p => p.url().includes('/index.html'))
      if (page) break
      await delay(100)
    }
    assert(page)
    page.on('pageerror', error => errors.push(error.message))
    await page.locator('.zd-hero-art').waitFor({ timeout: 20000 })
    await page.getByRole('button', { name: '暂停图片轮播', exact: true }).click()
    await page.screenshot({ path: path.join(root, '.qa/gallery-home.png') })
    const home = () => page.getByRole('button', { name: '启动台', exact: true }).click()
    const count = () => page.locator('.zd-photo-count').textContent()
    const currentImage = () => page.locator('.zd-hero-art:not(.photo-fade-leave-active)').getAttribute('data-photo-key')
    const gallery = async () => {
      await page.getByRole('button', { name: '设置', exact: true }).click()
      const section = page.locator('details[data-section="thumbnail"]')
      await section.waitFor()
      if (!(await section.evaluate(el => el.open))) await section.locator('summary').first().click()
      return section
    }
    let section = await gallery()
    const rows = section.locator('.carousel-list > li')
    assert.equal(await rows.count(), bundled.length)
    assert.equal(await page.getByText('Minecraft活塞压扁大冒险', { exact: true }).count(), 0)
    assert.equal(await rows.filter({ hasText: '影视飓风' }).count(), bundled.length)
    await section.scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(root, '.qa/gallery-settings.png') })
    passed.push(`The settings gallery contains ${bundled.length} supplied photographs and source labels`)
    await section.locator('#carousel-default-duration').fill('1')
    await section.locator('#carousel-default-duration').press('Tab')
    await until(() => page.evaluate(async () => (await window.kamucl.invoke('settings:get')).launchThumbnail.intervalSeconds === 1), 'settings save')
    await home()
    await page.locator('.zd-photo-count').waitFor()
    const beforeAuto = await count()
    await until(async () => await count() !== beforeAuto, 'automatic photo switch', 3500)
    passed.push('The home carousel uses the dwell time saved in settings')
    await page.getByRole('button', { name: '暂停图片轮播', exact: true }).click()
    const pausedCount = await count()
    await delay(1300)
    assert.equal(await count(), pausedCount)
    await page.getByRole('button', { name: '下一张图片', exact: true }).click()
    const manualCount = await count()
    assert.notEqual(manualCount, pausedCount)
    await delay(1300)
    assert.equal(await count(), manualCount)
    passed.push('Pausing stops automatic playback; manual next still works and remains paused')
    await page.getByRole('button', { name: '播放图片轮播', exact: true }).click()
    await until(async () => await count() !== manualCount, 'resumed playback', 3500)
    passed.push('Resuming restarts automatic playback')
    section = await gallery()
    await section.getByRole('button', { name: '全不选', exact: true }).click()
    await until(() => page.evaluate(async size => (await window.kamucl.invoke('settings:get')).launchThumbnail.disabled.length === size, bundled.length), 'all disabled saved')
    await home()
    await until(async () => await page.locator('.zd-hero-art').count() === 0, 'all disabled home state')
    assert.equal(await page.locator('.zd-gallery-controls').count(), 0)
    assert(await page.locator('.zd-hero').evaluate(el => el.classList.contains('no-photo')))
    passed.push('Turning all photos off removes the artwork and controls without reviving a fallback')
    section = await gallery()
    await section.locator('.carousel-list > li').first().getByRole('checkbox').check()
    await home()
    await page.locator('.zd-hero-art').waitFor()
    assert.equal(await page.locator('.zd-gallery-controls').count(), 0)
    passed.push('A single enabled photo stays visible without carousel controls')
    section = await gallery()
    await section.getByRole('button', { name: '全选', exact: true }).click()
    await section.locator('.carousel-list > li').last().locator('.carousel-drag-handle').press('Home')
    const firstKey = await section.locator('.carousel-list > li').first().getAttribute('data-carousel-key')
    assert.equal(firstKey, bundled.at(-1).key)
    await section.getByRole('button', { name: '适应', exact: true }).click()
    await home()
    await until(() => page.locator('.zd-hero-art:not(.photo-fade-leave-active)').evaluate(el => el.style.objectFit === 'contain'), 'fit setting applies')
    passed.push('Settings reordering and image-fit mode apply to the home carousel')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const reducedImage = await currentImage()
    await delay(1300)
    assert.equal(await currentImage(), reducedImage)
    await page.getByRole('button', { name: '下一张图片', exact: true }).click()
    await until(async () => await currentImage() !== reducedImage, 'manual next with reduced motion')
    passed.push('Reduced motion stops automatic switching and keeps manual controls usable')
    assert.deepEqual(errors, [])
    fs.writeFileSync(path.join(root, '.qa/gallery-result.json'), JSON.stringify({ ok: true, passed, rendererErrors: errors }, null, 2))
    console.log(passed.map(value => 'PASS ' + value).join('\n'))
  } catch (error) {
    const page = app.windows().find(p => p.url().includes('/index.html'))
    if (page) await page.screenshot({ path: path.join(root, '.qa/gallery-error.png') }).catch(() => {})
    throw error
  } finally { await app.close() }
}
run().catch(error => { console.error(error); process.exitCode = 1 })
