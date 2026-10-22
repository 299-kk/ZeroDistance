import fs from 'node:fs/promises'
import path from 'node:path'

export interface InstanceSize { bytes: number; partial: boolean; files: number; checkedAt: number }
/** Count physical instance files without following junctions or counting shared libraries twice. */
export async function measureInstance(directory: string, limits = { files: 150_000, milliseconds: 20_000 }): Promise<InstanceSize> {
  const started = Date.now(), queue = [path.resolve(directory)]
  let bytes = 0, files = 0, partial = false
  while (queue.length) {
    if (files >= limits.files || Date.now() - started > limits.milliseconds) { partial = true; break }
    const current = queue.pop()!
    try {
      const info = await fs.lstat(current)
      if (info.isSymbolicLink()) continue
      if (info.isFile()) { bytes += info.size; files++; continue }
      if (!info.isDirectory()) continue
      const entries = await fs.readdir(current, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isSymbolicLink()) continue
        if (entry.isDirectory() || entry.isFile()) queue.push(path.join(current, entry.name))
      }
    } catch { partial = true }
  }
  return { bytes, files, partial, checkedAt: Date.now() }
}
