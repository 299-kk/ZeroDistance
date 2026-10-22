import fs from 'node:fs/promises'
import path from 'node:path'
import { pathIdentity, resolveMinecraftRoot } from './folderPaths'

const GAME_NAME = /^(?:\.?minecraft|mc|我的世界)$/i
const SKIP = /^(?:windows|program files(?: \(x86\))?|programdata|users|appdata|\$.*|system volume information|node_modules|\.git|versions|libraries|assets|runtimes?|mods|saves|resourcepacks|shaderpacks|logs|cache|release|out)$/i

/** Bounded, read-only search. Recognizable names alone never create/register empty folders. */
export async function discoverMinecraftRoots(seeds: string[], options: { maxDepth?: number; maxDirectories?: number; maxDurationMs?: number } = {}): Promise<string[]> {
  const maxDepth = options.maxDepth ?? 4
  const maxDirectories = options.maxDirectories ?? 3000
  const deadline = Date.now() + (options.maxDurationMs ?? 2500)
  const queue = seeds.map(directory => ({ directory, depth: 0 }))
  const visited = new Set<string>(), found = new Map<string, string>()
  let inspected = 0
  while (queue.length && inspected < maxDirectories && Date.now() < deadline) {
    const { directory, depth } = queue.shift()!
    try {
      const stat = await fs.lstat(directory)
      if (!stat.isDirectory() || stat.isSymbolicLink()) continue
      const identity = pathIdentity(directory)
      if (visited.has(identity)) continue
      visited.add(identity)
      inspected++
      if (GAME_NAME.test(path.basename(directory))) {
        const nested = await fs.lstat(path.join(directory, '.minecraft')).catch(() => undefined)
        if (nested?.isSymbolicLink()) continue
        const root = resolveMinecraftRoot(directory).path
        const versions = await fs.readdir(path.join(root, 'versions'), { withFileTypes: true }).catch(() => [])
        let valid = false
        for (const entry of versions) {
          if (!entry.isDirectory() || entry.isSymbolicLink()) continue
          const json = path.join(root, 'versions', entry.name, `${entry.name}.json`)
          try {
            const info = await fs.lstat(json)
            if (!info.isFile() || info.isSymbolicLink() || info.size > 4 * 1024 * 1024) continue
            const metadata = JSON.parse((await fs.readFile(json, 'utf8')).replace(/^\uFEFF/, ''))
            if (metadata && typeof metadata.id === 'string' && metadata.id) { valid = true; break }
          } catch { /* Broken versions are left to the explicit folder scanner. */ }
          if (Date.now() >= deadline) break
        }
        if (valid) { found.set(pathIdentity(root), root); continue }
      }
      if (depth >= maxDepth) continue
      const children = await fs.readdir(directory, { withFileTypes: true })
      const next = children.filter(entry => entry.isDirectory() && !entry.isSymbolicLink() && !SKIP.test(entry.name) && (!entry.name.startsWith('.') || GAME_NAME.test(entry.name)))
      // Prioritize named game containers before unrelated folders on large disks.
      for (const entry of next.filter(entry => GAME_NAME.test(entry.name)).reverse()) queue.unshift({ directory: path.join(directory, entry.name), depth: depth + 1 })
      for (const entry of next.filter(entry => !GAME_NAME.test(entry.name))) queue.push({ directory: path.join(directory, entry.name), depth: depth + 1 })
    } catch { /* Disconnected/denied folders are skipped; the remaining scan continues. */ }
  }
  return [...found.values()]
}
