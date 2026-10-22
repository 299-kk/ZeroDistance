// Standard Deflate ZIP of the complete runtime; no installer or self-extracting wrapper inside.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto'), Zip = require('adm-zip')
const { execFile } = require('node:child_process'), { promisify } = require('node:util')
const { getPath7za } = require('app-builder-lib/out/toolsets/7zip')
async function run() {
  const root = path.resolve(__dirname, '..'), { version } = require('../package.json')
  const source = path.join(root, 'release/win-unpacked')
  assert(fs.existsSync(path.join(source, 'ZeroDistance.exe')))
  assert(fs.existsSync(path.join(source, 'resources/app.asar')))
  const target = path.join(root, 'release', `ZeroDistance-${version}-windows-x64.zip`)
  const files = []
  const add = folder => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(folder, entry.name)
      assert(!entry.isSymbolicLink(), 'Unexpected link in the Windows runtime')
      if (entry.isDirectory()) add(file)
      else files.push(path.relative(source, file).split(path.sep).join('/'))
    }
  }
  add(source)
  const scratch = path.join(root, '.qa/zip-build'); fs.mkdirSync(scratch, { recursive: true })
  const temporary = path.join(scratch, crypto.randomUUID() + '.zip')
  try {
    // Three Deflate passes reduce download size without the long build time of
    // the builder's 15-pass preset. Method 8 remains compatible with Explorer.
    await promisify(execFile)(await getPath7za(), ['a', '-tzip', '-mx=9', '-mm=Deflate', '-mfb=258', '-mpass=3', '-mmt=2', '-mcu=on', '-mtc=off', '-y', '-bb0', temporary, '.'], { cwd: source, windowsHide: true, timeout: 300000 })
    const archive = new Zip(temporary), entries = archive.getEntries().filter(entry => !entry.isDirectory)
    assert.deepEqual(entries.map(entry => entry.entryName).sort(), [...files].sort(), 'ZIP must contain the complete runtime at its root')
    assert(entries.every(entry => entry.header.method === 8 || entry.header.method === 0), 'ZIP must use standard Deflate or Store')
    fs.renameSync(temporary, target)
  } finally { fs.rmSync(temporary, { force: true }) }
  console.log(JSON.stringify({ target, files: files.length, bytes: fs.statSync(target).size, compression: 'Deflate, 3 passes' }))
}
run().catch(error => { console.error(error); process.exitCode = 1 })
