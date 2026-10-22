const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const root = path.resolve(__dirname, '..'), { version } = require('../package.json')
for (const name of [`ZeroDistance-${version}-Setup.exe`, `ZeroDistance-${version}-windows-x64.zip`]) {
  const file = path.join(root, 'release', name), bytes = fs.statSync(file).size
  assert(bytes > 1_000_000, 'Invalid/empty deliverable: ' + name)
  if (name.endsWith('.exe')) assert(bytes < 100_000_000, 'Installer exceeds 100 MB: ' + bytes)
  console.log(`${name}: ${(bytes / 1e6).toFixed(2)} MB (${bytes} bytes)`)
}
