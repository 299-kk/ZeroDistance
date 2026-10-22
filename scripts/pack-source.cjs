const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const Zip = require('adm-zip')
const root = path.resolve(__dirname, '..')
const { version } = require('../package.json')
const excluded = new Set(['.git', 'node_modules', 'out', 'release', '.qa', '素材'])
const zip = new Zip()
function add(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (excluded.has(item.name) || item.name.endsWith('.log') || item.name.endsWith('.part')) continue
    const file = path.join(dir, item.name)
    if (item.isSymbolicLink()) continue
    if (item.isDirectory()) add(file)
    else zip.addFile(path.relative(root, file).split(path.sep).join('/'), fs.readFileSync(file))
  }
}
add(root)
fs.mkdirSync(path.join(root, 'release'), { recursive: true })
const output = path.join(root, 'release', `ZeroDistance-${version}-source.zip`)
zip.writeZip(output)
const files = fs.readdirSync(path.join(root, 'release')).filter(name => /\.(exe|zip)$/.test(name)).sort()
const sums = files.map(name => `${crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'release', name))).digest('hex')}  ${name}`)
fs.writeFileSync(path.join(root, 'release/SHA256SUMS.txt'), sums.join('\n') + '\n')
console.log(`Source archive and SHA256SUMS.txt ready (${files.length} artifacts).`)
