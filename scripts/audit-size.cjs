// Read-only size inventory. No pruning of runtime files or user data.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), asar = require('asar'), Zip = require('adm-zip')
const root = path.resolve(__dirname, '..'), version = require('../package.json').version
const directory = path.join(root, 'release/win-unpacked'), archive = path.join(directory, 'resources/app.asar')
assert(fs.existsSync(archive), 'Build the Windows package before running this audit')
function filesIn(folder) {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    if (entry.isSymbolicLink()) return []
    const file = path.join(folder, entry.name)
    return entry.isDirectory() ? filesIn(file) : [{ name: path.relative(folder, file), file, bytes: fs.statSync(file).size }]
  })
}
function totals(rows, classify) {
  const result = {}
  for (const row of rows) { const category = classify(row); result[category] = (result[category] || 0) + row.bytes }
  return Object.entries(result).map(([category, bytes]) => ({ category, bytes })).sort((a, b) => b.bytes - a.bytes)
}
const packaged = filesIn(directory).map(row => ({ ...row, name: path.relative(directory, row.file).replaceAll('\\', '/') }))
const bundled = asar.listPackage(archive).flatMap(name => { const normalized = name.replaceAll('\\', '/').replace(/^\//, ''); const stat = asar.statFile(archive, normalized.split('/').join(path.sep)); return stat.files ? [] : [{ name: normalized, bytes: stat.size, unpacked: !!stat.unpacked }] })
const source = filesIn(path.join(root, 'src')).filter(row => /\.(ts|vue|css)$/.test(row.file)).map(row => { const text = fs.readFileSync(row.file, 'utf8'); return { name: path.relative(root, row.file).replaceAll('\\', '/'), bytes: row.bytes, lines: text.split(/\r?\n/).length, electronImport: /from ['"]electron['"]/.test(text), ipcHandlers: (text.match(/ipcMain\.(handle|on)\s*\(/g) || []).length } })
const zipFile = path.join(root, 'release', `ZeroDistance-${version}-windows-x64.zip`)
const zip = fs.existsSync(zipFile) ? new Zip(zipFile) : null
const report = {
  version, measuredAt: new Date().toISOString(), units: 'bytes; decimal MB = bytes / 1,000,000',
  installedBytes: packaged.reduce((sum, row) => sum + row.bytes, 0),
  installedGroups: totals(packaged, row => /^(resources\/app\.asar|resources\/app\.asar\.unpacked\/)/.test(row.name) ? 'Application + dependencies + assets' : /^(LICENSE|THIRD_PARTY|licenses\/|docs\/|README|使用声明)/.test(row.name) ? 'Notices + documentation' : 'Electron runtime'),
  largestInstalled: packaged.sort((a, b) => b.bytes - a.bytes).slice(0, 14).map(({ name, bytes }) => ({ name, bytes })),
  asarBytes: fs.statSync(archive).size,
  bundledGroups: totals(bundled, row => row.name.startsWith('node_modules/') ? row.name.split('/').slice(0, row.name.split('/')[1].startsWith('@') ? 3 : 2).join('/') : /\.webp$/.test(row.name) ? 'Photographs' : /\.(png|svg|jpg|ico)$/.test(row.name) ? 'Icons + other images' : row.name.startsWith('out/') ? row.name.split('/').slice(0, 2).join('/') : 'Notices + configuration'),
  largestBundled: [...bundled].sort((a, b) => b.bytes - a.bytes).slice(0, 15),
  zip: zip ? { bytes: fs.statSync(zipFile).size, largestCompressed: zip.getEntries().filter(row => !row.isDirectory).sort((a, b) => b.header.compressedSize - a.header.compressedSize).slice(0, 12).map(row => ({ name: row.entryName, compressed: row.header.compressedSize, uncompressed: row.header.size, method: row.header.method })) } : null,
  source: { files: source.length, lines: source.reduce((sum, row) => sum + row.lines, 0), mainFiles: source.filter(row => row.name.startsWith('src/main/')).length, mainLines: source.filter(row => row.name.startsWith('src/main/')).reduce((sum, row) => sum + row.lines, 0), electronImports: source.filter(row => row.electronImport).length, ipcHandlers: source.reduce((sum, row) => sum + row.ipcHandlers, 0) }
}
const output = path.join(root, '.qa/size-audit'); fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(path.join(output, 'inventory-' + version + '.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
