import fs from 'node:fs/promises'
import path from 'node:path'
import * as yauzl from 'yauzl'
import * as TOML from '@iarna/toml'

function minimumJava(value: unknown): number {
  if (Array.isArray(value)) return value.length ? Math.min(...value.map(minimumJava)) : 8
  if (typeof value !== 'string') return 8
  const options = value.split(/\s*\|\|\s*/).map(part => {
    const match = /(?:^\s*(?:\^|~|>=|=)?\s*|\[\s*)(\d+)(?:\.|\b)/.exec(part)
    const n = Number(match?.[1]); return n >= 8 && n <= 30 ? n : 8
  })
  return Math.min(...options)
}

/** Read only small mixin declarations; never inflate an entire mod or load its classes. */
async function mixinJavaLevel(file: string): Promise<number> {
  return new Promise(resolve => {
    yauzl.open(file, { lazyEntries: true, autoClose: true }, (error, zip) => {
      if (error || !zip) return resolve(8)
      let level = 8, settled = false, entries = 0
      const finish = () => { if (!settled) { settled = true; resolve(level) } }
      zip.on('error', finish)
      zip.on('end', finish)
      zip.on('close', finish)
      zip.on('entry', entry => {
        if (++entries > 100000) { zip.close(); return }
        const mixin = /mixin.*\.json$/i.test(entry.fileName)
        const fabric = entry.fileName === 'fabric.mod.json'
        const forge = entry.fileName === 'META-INF/mods.toml' || entry.fileName === 'META-INF/neoforge.mods.toml'
        if ((!mixin && !fabric && !forge) || entry.uncompressedSize > 256 * 1024) { zip.readEntry(); return }
        zip.openReadStream(entry, (err, stream) => {
          if (err || !stream) { zip.readEntry(); return }
          const chunks: Buffer[] = []; let length = 0
          stream.on('data', (chunk: Buffer) => { length += chunk.length; if (length <= 256 * 1024) chunks.push(chunk); else stream.destroy() })
          stream.on('error', () => zip.readEntry())
          stream.on('end', () => {
            try {
              const text = Buffer.concat(chunks).toString('utf8')
              if (forge) {
                const config = TOML.parse(text) as any
                for (const dependencies of Object.values(config.dependencies ?? {})) {
                  if (Array.isArray(dependencies)) for (const dep of dependencies) if (dep?.modId === 'java' && dep.mandatory !== false) level = Math.max(level, minimumJava(dep.versionRange))
                }
              } else {
                const config = JSON.parse(text)
                if (fabric) level = Math.max(level, minimumJava(config.depends?.java))
                if (mixin) { const match = /^JAVA_(\d+)$/.exec(config.compatibilityLevel); if (match && Number(match[1]) <= 30) level = Math.max(level, Number(match[1])) }
              }
            } catch { /* invalid config is diagnosed by the game */ }
            zip.readEntry()
          })
        })
      })
      zip.readEntry()
    })
  })
}

/** Mod mixin declarations can require Java 11 even when Minecraft declares Java 8. */
export async function modpackJavaMajor(gameDir: string, minimum: number): Promise<number> {
  let level = minimum
  // PCL's source-machine path is not portable. Use only its recorded version.
  try {
    const ini = await fs.readFile(path.join(gameDir, 'PCL', 'Setup.ini'), 'utf8')
    const mode = /^VersionArgumentJavaV2\s*:\s*(\d+)\s*$/im.exec(ini)?.[1]
    const value = /^VersionArgumentJavaSelect\s*:\s*(\{[^\r\n]*\})\s*$/im.exec(ini)?.[1]
    if (mode === '3' && value) {
      const selected = JSON.parse(value), match = /^(?:1\.)?(\d+)(?:\.|$)/.exec(String(selected.VersionString ?? ''))
      const declared = Number(match?.[1]); if (declared >= 8 && declared <= 30) level = Math.max(level, declared)
    }
  } catch { /* No usable PCL preference. */ }
  const folder = path.join(gameDir, 'mods')
  let files: string[]
  try { files = (await fs.readdir(folder, { withFileTypes: true })).filter(e => e.isFile() && /\.jar$/i.test(e.name)).map(e => path.join(folder, e.name)) }
  catch { return level }
  let index = 0
  await Promise.all(Array.from({ length: Math.min(4, files.length) }, async () => {
    while (index < files.length) { const found = await mixinJavaLevel(files[index++]); level = Math.max(level, found) }
  }))
  return level === 9 || level === 10 ? 11 : level
}
