import fs from 'node:fs'
import path from 'node:path'
import { inspectImageFile } from './imageAssetProcessor'
import { isPathInside } from './imageAssetPolicy'
import { samePath } from './folderPaths'

const LOCAL_ICONS = ['PCL/Logo.png', 'icon.png', 'pack.png', 'instance.png', '.minecraft/icon.png', 'minecraft/icon.png', 'HMCL/icon.png']
const CUSTOM_NAME = /^[\w.-]{1,64}\.(?:png|jpe?g|webp|gif)$/i

function safeIcon(candidate: string, root: string): string {
  try {
    const stat = fs.lstatSync(candidate)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 5 * 1024 * 1024) return ''
    const realRoot = fs.realpathSync(root), realFile = fs.realpathSync(candidate)
    if (!isPathInside(realFile, realRoot)) return ''
    if (path.extname(realFile).toLowerCase() === '.gif') {
      const header = Buffer.alloc(10), fd = fs.openSync(realFile, 'r')
      try { fs.readSync(fd, header, 0, header.length, 0) } finally { fs.closeSync(fd) }
      if (!/^GIF8[79]a$/.test(header.toString('ascii', 0, 6))) return ''
      const width = header.readUInt16LE(6), height = header.readUInt16LE(8)
      return width && height && width * height <= 16_000_000 ? realFile : ''
    }
    const image = inspectImageFile(realFile)
    return image.dimensions.width * image.dimensions.height <= 16_000_000 ? realFile : ''
  } catch { return '' }
}

/** Prefer the user's explicit icon, then pack/PCL images; existing shared caches remain readable. */
export function resolveInstanceIcon(folder: string, id: string, icon?: string, legacyFolders: string[] = []): string {
  if (/^mob:[a-z0-9_]{1,32}$/.test(icon ?? '')) return ''
  if (icon?.startsWith('file:') && CUSTOM_NAME.test(icon.slice(5))) {
    for (const root of new Set([folder, ...legacyFolders])) {
      const found = safeIcon(path.join(root, '.kamucl', 'icons', icon.slice(5)), root)
      if (found) return found
    }
  }
  if (!id || id === '.' || id === '..' || /[\\/]/.test(id)) return ''
  for (const name of LOCAL_ICONS) {
    const found = safeIcon(path.join(folder, 'versions', id, name), folder)
    if (found) return found
  }
  return ''
}

/** Restrict protocol access to known icon locations under a registered game root. */
export function authorizeInstanceIcon(candidate: string, folders: string[]): string {
  for (const folder of folders) {
    if (!isPathInside(candidate, folder)) continue
    const relative = path.relative(folder, candidate).split(path.sep)
    const custom = relative.length === 3 && relative[0] === '.kamucl' && relative[1] === 'icons' && CUSTOM_NAME.test(relative[2])
    const local = relative[0] === 'versions' && relative[1] && LOCAL_ICONS.some(name => samePath(candidate, path.join(folder, 'versions', relative[1], name)))
    if (custom || local) return safeIcon(candidate, folder)
  }
  return ''
}
