const fs = require('node:fs')
const path = require('node:path')
const { version } = require('../package.json')
const file = path.resolve(__dirname, '..', 'release', `ZeroDistance-${version}.exe`)
const bytes = fs.statSync(file).size
const limit = 100000000
if (bytes > limit) throw new Error(`Portable EXE exceeds 100 MB: ${bytes} bytes`)
console.log(`Portable EXE: ${(bytes / 1000000).toFixed(2)} MB / 100 MB (${bytes} bytes)`)
