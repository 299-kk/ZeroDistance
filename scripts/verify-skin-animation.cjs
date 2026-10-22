const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict'), sharp = require('sharp')
let playwright
try { playwright = require('playwright') } catch { playwright = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')) }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function run() {
  const root = path.resolve(__dirname, '..'), output = path.join(root, '.qa/skin-animation', crypto.randomUUID())
  fs.mkdirSync(output, { recursive: true })
  const env = { ...process.env, ZERO_DISTANCE_DATA_DIR: path.join(output, 'user'), ZERO_DISTANCE_DISCOVERY_ROOTS: '[]' }
  delete env.ELECTRON_RUN_AS_NODE
  const skin = Buffer.alloc(64 * 64 * 4)
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const i = (y * 64 + x) * 4
    skin[i] = x < 32 ? 185 : 40; skin[i + 1] = y < 32 ? 115 : 75; skin[i + 2] = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? 185 : 55; skin[i + 3] = 255
  }
  const png = await sharp(skin, { raw: { width: 64, height: 64, channels: 4 } }).png().toBuffer()
  const app = await playwright._electron.launch({ executablePath: require('electron'), args: [root], cwd: root, env, timeout: 30000 })
  await require('./electron-consent.cjs')(app)
  const report = { baseline: process.argv.includes('--baseline'), output, cases: [], errors: [] }
  try {
    let page
    for (let n = 0; n < 200; n++) { page = app.windows().find(p => p.url().includes('/index.html')); if (page) break; await delay(100) }
    assert(page); await page.locator('.zd-hero').waitFor({ timeout: 30000 })
    await app.evaluate(({ ipcMain }, dataUrl) => {
      const account = { id: 'preview-fixture', type: 'microsoft', username: 'Animation Preview', uuid: '00000000000000000000000000000001' }
      for (const [channel, handler] of [
        ['accounts:list', () => [account]], ['accounts:selected', () => account],
        ['skin:profile', () => ({ uuid: account.uuid, name: account.username, skins: [{ id: 'fixture', dataUrl, variant: 'classic' }], capes: [] })], ['skin:history', () => []]
      ]) { ipcMain.removeHandler(channel); ipcMain.handle(channel, handler) }
    }, 'data:image/png;base64,' + png.toString('base64'))
    await page.reload(); await page.locator('.zd-hero').waitFor()
    page.on('pageerror', error => report.errors.push(error.message))
    await page.locator('[data-nav="resources"]').click()
    await page.locator('[data-nav="skins"]').click()
    const canvas = page.locator('.pane-preview .viewer3d canvas')
    await canvas.waitFor(); await delay(600)
    await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('/index.html')); window.show(); window.focus() })
    await page.waitForFunction(async () => await window.kamucl.invoke('window:visibility') === true)
    report.environment = await page.evaluate(async () => ({ systemReduced: matchMedia('(prefers-reduced-motion: reduce)').matches, documentHidden: document.hidden, nativeVisible: await window.kamucl.invoke('window:visibility'), datasetMotion: document.documentElement.dataset.motion }))
    const measure = async (name, wait = 500, target = canvas) => {
      const buffers = []
      for (let i = 0; i < 3; i++) { buffers.push(await target.screenshot()); await delay(wait) }
      const raw = await Promise.all(buffers.map(buffer => sharp(buffer).ensureAlpha().raw().toBuffer()))
      const changed = raw.slice(1).map(frame => { let n = 0; for (let i = 0; i < frame.length; i += 4) if (Math.abs(frame[i] - raw[0][i]) + Math.abs(frame[i + 1] - raw[0][i + 1]) + Math.abs(frame[i + 2] - raw[0][i + 2]) > 12) n++; return n })
      for (let i = 0; i < buffers.length; i++) fs.writeFileSync(path.join(output, `${name}-${i}.png`), buffers[i])
      const item = { name, changedPixels: changed }; report.cases.push(item); return item
    }
    if (report.baseline) {
      await measure('natural-walk')
      await page.locator('[data-seg="idle"]').click(); await delay(1200); await measure('natural-idle')
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      await page.locator('[data-seg="walk"]').click(); await delay(500); await measure('normal-walk')
      await page.locator('[data-seg="idle"]').click(); await delay(1500); await measure('normal-idle')
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.locator('[data-seg="walk"]').click(); await delay(600); await measure('reduced-walk')
    } else {
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      await page.locator('[data-seg="walk"]').click(); await delay(500)
      assert((await measure('walk')).changedPixels.some(n => n > 200))
      await page.locator('[data-seg="idle"]').click(); await delay(1200)
      assert((await measure('idle')).changedPixels.some(n => n > 50))
      await page.getByRole('button', { name: '暂停预览动画', exact: true }).click(); await delay(150)
      assert((await measure('paused')).changedPixels.every(n => n === 0))
      await page.getByRole('button', { name: '播放预览动画', exact: true }).click()
      assert((await measure('resumed')).changedPixels.some(n => n > 50))
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.locator('[data-nav="home"]').click(); await page.locator('.zd-hero').waitFor()
      await page.locator('[data-nav="skins"]').click(); await canvas.waitFor(); await delay(350)
      await page.getByRole('button', { name: '播放预览动画', exact: true }).waitFor()
      assert((await measure('reduced-auto')).changedPixels.every(n => n === 0))
      // The already-selected mode must also start playback after automatic motion reduction.
      await page.locator('[data-seg="walk"]').click(); await delay(500)
      assert((await measure('reduced-explicit-walk')).changedPixels.some(n => n > 200))
      await page.locator('[data-seg="idle"]').click(); await delay(1200)
      assert((await measure('reduced-explicit-idle')).changedPixels.some(n => n > 50))
      assert.equal(await page.evaluate(async () => (await window.kamucl.invoke('settings:get')).reduceMotion), false)
      await page.evaluate(() => {
        const gl = document.querySelector('.pane-preview canvas').getContext('webgl2')
        window.__skinDrawCount = 0
        for (const name of ['drawElements', 'drawArrays']) { const original = gl[name]; gl[name] = function (...args) { window.__skinDrawCount++; return original.apply(this, args) } }
      })
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('/index.html')).hide())
      await delay(200)
      const hiddenDraws = await page.evaluate(() => window.__skinDrawCount)
      await delay(500)
      assert.equal(await page.evaluate(() => window.__skinDrawCount), hiddenDraws)
      await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('/index.html')); w.show(); w.focus() })
      await page.waitForFunction(() => window.__skinDrawCount > 0)
      assert((await measure('after-restore')).changedPixels.some(n => n > 50))
      await page.getByRole('button', { name: '绘制皮肤', exact: true }).click()
      const editorCanvas = page.locator('.skin-editor .viewer3d canvas')
      await editorCanvas.waitFor(); await delay(350)
      assert((await measure('editor-static', 300, editorCanvas)).changedPixels.every(n => n === 0))
      await page.keyboard.press('Escape'); await page.locator('.skin-editor').waitFor({ state: 'detached' })
      await page.screenshot({ path: path.join(root, '.qa/skin-animation-preview.png') })
    }
    assert.deepEqual(report.errors, [])
  } finally {
    fs.writeFileSync(path.join(root, '.qa', report.baseline ? 'skin-animation-baseline.json' : 'skin-animation-result.json'), JSON.stringify(report, null, 2))
    await app.close()
  }
  console.log(JSON.stringify(report, null, 2))
}
run().catch(error => { console.error(error); process.exitCode = 1 })
