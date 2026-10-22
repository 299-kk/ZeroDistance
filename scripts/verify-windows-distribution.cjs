const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict'), { execFileSync } = require('node:child_process'), Zip = require('adm-zip')
const root = path.resolve(__dirname, '..'), { version } = require('../package.json')
const output = path.join(root, '.qa/windows-distribution', crypto.randomUUID())
const unpacked = path.join(output, 'zip'), installed = path.join(output, 'installed')
fs.mkdirSync(output, { recursive: true })
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const realData = path.join(process.env.APPDATA, 'ZeroDistance')
const realSnapshot = () => Object.fromEntries(['consent.json', 'accounts.json', 'settings.json'].map(name => {
  const file = path.join(realData, name)
  return [name, fs.existsSync(file) ? hash(file) : null]
}))
const originalData = realSnapshot()
const report = { version, ok: false, zip: {}, installer: {} }
const powershell = mode => JSON.parse(execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'verify-installer.ps1'), '-Mode', mode, '-TestRoot', installed], { cwd: root, windowsHide: true, encoding: 'utf8', timeout: 90000 }).trim())
const check = (script, executable) => {
  const env = { ...process.env, ZERO_DISTANCE_EXECUTABLE: executable }; delete env.ELECTRON_RUN_AS_NODE
  const result = execFileSync(process.execPath, [path.join(__dirname, script)], { cwd: root, env, windowsHide: true, encoding: 'utf8', timeout: 120000 })
  console.log(result.trim())
}
let needsUninstall = false
try {
  const zipFile = path.join(root, 'release', `ZeroDistance-${version}-windows-x64.zip`), zip = new Zip(zipFile)
  const names = zip.getEntries().map(entry => entry.entryName)
  for (const name of ['ZeroDistance.exe', 'resources/app.asar', 'README.txt', '使用声明.txt', 'LICENSE', 'LICENSE.electron.txt', 'LICENSES.chromium.html', 'THIRD_PARTY_NOTICES.md']) assert(names.includes(name), 'ZIP missing: ' + name)
  assert(!names.some(name => name.split(/[\\/]/).includes('..') || name.endsWith('-Setup.exe')), 'ZIP must be a direct-extraction application')
  assert(path.resolve(unpacked).startsWith(path.join(root, '.qa') + path.sep))
  zip.extractAllTo(unpacked, false)
  const expectedAsar = hash(path.join(root, 'release/win-unpacked/resources/app.asar'))
  assert.equal(hash(path.join(unpacked, 'resources/app.asar')), expectedAsar)
  check('verify-consent.cjs', path.join(unpacked, 'ZeroDistance.exe'))
  report.zip = { bytes: fs.statSync(zipFile).size, extractedLaunchAndConsent: true, asarSHA256: expectedAsar }
  report.installer = powershell('Install')
  if (!report.installer.skipped) {
    needsUninstall = true
    assert.equal(hash(path.join(installed, 'resources/app.asar')), expectedAsar)
    check('verify-zero-distance.cjs', path.join(installed, 'ZeroDistance.exe'))
    report.installer.launchAndBackend = true
    report.installer.uninstall = powershell('Uninstall'); needsUninstall = false
  }
  assert.deepEqual(realSnapshot(), originalData, 'Real user agreement, accounts and settings must remain untouched')
  report.realUserConsentUntouched = true
  report.ok = true
} finally {
  if (needsUninstall) { try { report.installer.cleanup = powershell('Uninstall') } catch (error) { report.installer.cleanupError = String(error) } }
  fs.writeFileSync(path.join(root, '.qa/distribution-result-' + version + '.json'), JSON.stringify(report, null, 2))
}
console.log(JSON.stringify(report, null, 2))
