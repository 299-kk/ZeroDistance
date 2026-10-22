const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const sharp = require('sharp')

async function run() {
  const root = path.resolve(__dirname, '..')
  const sourceDir = path.resolve(process.argv[2] || path.join(root, '素材'))
  const outputDir = path.join(root, 'src/renderer/src/assets/launch')
  const manifestFile = path.join(root, 'src/shared/landscape-images.json')
  if (!fs.existsSync(sourceDir)) throw new Error('素材目录不存在：' + sourceDir)
  let credits = {}
  const creditsFile = path.join(sourceDir, 'credits.json')
  if (fs.existsSync(creditsFile)) credits = JSON.parse(fs.readFileSync(creditsFile, 'utf8'))
  const files = []
  function scan(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) scan(file)
      else if (/\.(jpe?g|png|webp|avif|tiff?|arw)$/i.test(entry.name)) files.push(file)
    }
  }
  scan(sourceDir)
  const metadataFor = file => credits[path.relative(sourceDir, file).split(path.sep).join('/')] || credits[path.basename(file)] || {}
  files.sort((a, b) => (metadataFor(a).order ?? 999) - (metadataFor(b).order ?? 999) || a.localeCompare(b, 'zh-CN'))
  if (!files.length) { console.log('暂无照片。请先将素材放入 ' + sourceDir + '；现有图库不会被修改。'); return }
  if (files.length > 20) throw new Error('最多导入 20 张默认照片，请先选取要使用的图片。')
  const prepared = [], seen = new Set()
  for (const file of files) {
    const input = fs.readFileSync(file)
    const id = crypto.createHash('sha256').update(input).digest('hex').slice(0, 20)
    if (seen.has(id)) continue
    seen.add(id)
    const relative = path.relative(sourceDir, file).split(path.sep).join('/')
    const info = credits[relative] || credits[path.basename(file)] || {}
    let decoded = input, derivation = '原图等比压缩'
    if (/\.arw$/i.test(file)) {
      let best, pixels = 0
      for (let start = input.indexOf(Buffer.from([255, 216, 255])); start >= 0; start = input.indexOf(Buffer.from([255, 216, 255]), start + 3)) {
        const end = input.indexOf(Buffer.from([255, 217]), start + 3)
        if (end < 0) continue
        try {
          const jpeg = input.subarray(start, end + 2)
          const metadata = await sharp(jpeg).metadata()
          if (metadata.width * metadata.height > pixels) { best = jpeg; pixels = metadata.width * metadata.height }
        } catch { /* RAW bytes may contain false JPEG signatures. */ }
      }
      if (!best) throw new Error('ARW 中没有可用的内嵌 JPEG 预览：' + relative)
      decoded = best; derivation = '使用 ARW 内嵌高分辨率 JPEG 预览，原片保留'
    }
    const buffer = await sharp(decoded).rotate().resize({ width: 2400, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85, effort: 6 }).toBuffer()
    let sourceUrl = ''
    if (info.sourceUrl) {
      const url = new URL(info.sourceUrl)
      if (url.protocol !== 'https:') throw new Error('来源页应使用 HTTPS：' + relative)
      sourceUrl = url.href
    }
    const item = {
      key: `builtin:landscape-${id}`, title: String(info.title || path.basename(file, path.extname(file))),
      file: `landscape-${id}.webp`, author: String(info.author || ''),
      optional: true,
      derivation,
      position: /^center (?:100|[0-9]{1,2})%$/.test(info.position || '') ? info.position : 'center 50%',
      source: String(info.source || '用户提供'), sourceUrl, license: String(info.license || '以随附的素材许可说明为准'),
      sha256: crypto.createHash('sha256').update(buffer).digest('hex')
    }
    prepared.push({ item, buffer })
  }
  // All files decode successfully before the existing manifest is replaced.
  fs.mkdirSync(outputDir, { recursive: true })
  for (const { item, buffer } of prepared) fs.writeFileSync(path.join(outputDir, item.file), buffer)
  const temp = manifestFile + '.tmp'
  fs.writeFileSync(temp, JSON.stringify(prepared.map(({ item }) => item), null, 2) + '\n')
  fs.renameSync(temp, manifestFile)
  const retained = new Set(prepared.map(({ item }) => item.file))
  for (const file of fs.readdirSync(outputDir)) {
    if (!/^landscape-[a-f0-9]{20}\.webp$/.test(file) || retained.has(file)) continue
    const absolute = path.resolve(outputDir, file)
    if (!absolute.startsWith(outputDir + path.sep)) throw new Error('无效的输出路径')
    fs.unlinkSync(absolute)
  }
  console.log(`已导入 ${prepared.length} 张照片，原文件保留。来源信息记录在 src/shared/landscape-images.json。`)
}
run().catch(error => { console.error(error.message); process.exitCode = 1 })
