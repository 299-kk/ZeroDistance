const path = require('node:path'), assert = require('node:assert/strict')
/** Exercise real consent UI only inside this workspace's isolated QA profile. */
module.exports = async function acceptIsolatedConsent(app) {
  const actual = await app.evaluate(({ app }) => app.getPath('userData'))
  const allowed = path.resolve(__dirname, '../.qa') + path.sep
  assert(path.resolve(actual).toLowerCase().startsWith(allowed.toLowerCase()), 'Never consent on behalf of the real user profile')
  for (let n = 0; n < 300; n++) {
    const gate = app.windows().find(page => page.url().includes('/consent.html'))
    if (gate) {
      const button = gate.getByRole('button', { name: '同意并继续', exact: true })
      await button.waitFor({ timeout: 15000 })
      await button.click()
      return
    }
    if (app.windows().some(page => page.url().includes('/index.html'))) return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error('Neither consent nor main window appeared')
}
