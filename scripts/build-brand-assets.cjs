const path = require('node:path')
const sharp = require('sharp')
const root = path.resolve(__dirname, '..')
const source = path.join(root, 'src/renderer/src/assets/zero-mark.svg')
Promise.all([
  sharp(source, { density: 768 }).resize(1024, 1024).png({ compressionLevel: 9 }).toFile(path.join(root, 'src/renderer/src/assets/zero-splash.png')),
  sharp(source, { density: 768 }).resize(1024, 1024).png({ compressionLevel: 9 }).toFile(path.join(root, 'build/icon.png')),
  sharp(source, { density: 384 }).resize(512, 512).png({ compressionLevel: 9 }).toFile(path.join(root, 'build/icon-512.png'))
]).then(() => console.log('Brand assets generated from SVG: 1024px startup / 1024px Windows / 512px macOS.')).catch(error => { console.error(error); process.exitCode = 1 })
