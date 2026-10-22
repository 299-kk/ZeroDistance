// Fail before compression if platform file globs accidentally include the workspace.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto')
const asar = require('asar')
function verifyWindowsRuntime(appOutDir) {
  const archive = path.join(appOutDir, 'resources/app.asar')
  const names = asar.listPackage(archive).map(n => n.replaceAll('\\', '/').replace(/^\//, ''))
  // Verify the current photo manifest, and reject the removed upstream artwork.
  // Keep the existing 16 MiB code/dependency budget separate from photograph bytes.
  const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
  const registry = asar.extractFile(archive, ['out', 'main', 'projection-registries.json.br'].join(path.sep))
  assert.equal(digest(require('node:zlib').brotliDecompressSync(registry)), digest(fs.readFileSync(path.resolve(__dirname, '../src/main/core/projectionRegistries.json'))), 'Lossless shared registry must preserve every supported block state')
  const agentEntry = 'out/main/zero-distance-lan-agent.jar'
  assert.equal(asar.statFile(archive, agentEntry.split('/').join(path.sep)).unpacked, true, 'LAN Java agent must be a real unpacked file for the JVM')
  assert.equal(digest(fs.readFileSync(path.join(appOutDir, 'resources/app.asar.unpacked', agentEntry))), digest(fs.readFileSync(path.resolve(__dirname, '../out/main/zero-distance-lan-agent.jar'))), 'LAN Java agent must match the current build')
  let illustrationBytes = 0
  const photographs = require('../src/shared/landscape-images.json')
  assert(!names.some(name => /^out\/renderer\/assets\/(?:piston|brewer|cannon|cactus|farmer|camp|sunset|zero-world)-/.test(name)), 'Removed artwork leaked into the package')
  for (const photograph of photographs) {
    const id = path.basename(photograph.file, '.webp')
    const matches = names.filter(name => new RegExp('^out/renderer/assets/' + id + '-[^/]+\\.webp$').test(name))
    assert.equal(matches.length, 1, 'Exactly one approved photograph: ' + id)
    const bytes = asar.extractFile(archive, matches[0].split('/').join(path.sep))
    const source = fs.readFileSync(path.resolve(__dirname, '../src/renderer/src/assets/launch', photograph.file))
    assert.equal(digest(bytes), digest(source), 'Bundled photograph changed: ' + id)
    assert.equal(digest(bytes), photograph.sha256, 'Photograph manifest hash mismatch: ' + id)
    illustrationBytes += bytes.length
  }
  assert(illustrationBytes < 8 * 1024 * 1024, 'Photographs exceed the 8 MiB budget')
  assert(fs.statSync(archive).size - illustrationBytes < 16 * 1024 * 1024, 'Application code/dependencies exceed 16 MiB: review payload growth before release')
  for (const name of names) {
    const entry = asar.statFile(archive, name.split('/').join(path.sep))
    if (entry.files) continue
    assert(/^(node_modules\/|out\/(main|preload|renderer)\/|licenses\/|LICENSE$|THIRD_PARTY_NOTICES\.md$|package\.json$|docs\/CORRESPONDING_SOURCE\.md$)/.test(name), 'Unexpected packaged file: ' + name)
    assert(!/^node_modules\/koffi\/(doc|lib|vendor)(\/|$)/.test(name), 'Development-only Koffi files included')
    assert(!/^node_modules\/undici\/docs(\/|$)/.test(name), 'Development-only Undici docs included')
  }
  console.log(`Verified Windows ASAR: ${fs.statSync(archive).size} bytes, ${names.length} entries`)
}
module.exports = context => {
  if (context.electronPlatformName === 'win32') {
    verifyWindowsRuntime(context.appOutDir)
    require('./prune-windows-runtime.cjs').pruneWindowsRuntime(context)
  }
}
module.exports.verifyWindowsRuntime = verifyWindowsRuntime
