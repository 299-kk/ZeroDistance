import fs from 'node:fs'
import path from 'node:path'
import type { GameFolder } from '../../shared/types'
import { samePath } from './folderPaths'

/** Prefer a launcher-owned folder on D:; machines without a writable D: retain the local fallback. */
export function preferredGameFolder(appData: string, platform = process.platform, dDriveRoot = 'D:\\'): string {
  if (platform === 'win32') {
    try {
      if (fs.statSync(dDriveRoot).isDirectory()) {
        fs.accessSync(dDriveRoot, fs.constants.W_OK)
        return path.join(dDriveRoot, 'ZeroDistance', '.minecraft')
      }
    } catch { /* An unavailable drive must not prevent startup. */ }
  }
  return path.join(appData, '.zerodistance')
}

export function migrateDefaultGameFolder<T extends { folders: GameFolder[]; activeFolder: string; gameDir: string; gameFolderPolicyVersion?: number }>(settings: T, appData: string, preferred = preferredGameFolder(appData)): T {
  if (settings.gameFolderPolicyVersion === 1) return settings
  const legacy = path.join(appData, '.zerodistance')
  if (samePath(preferred, legacy)) return settings
  const oldDefault = settings.folders.find(folder => folder.isDefault)
  // Explicitly chosen defaults are preserved. Only the old built-in C: default changes.
  if (!oldDefault || !samePath(oldDefault.path, legacy)) return { ...settings, gameFolderPolicyVersion: 1 }
  const folders = settings.folders.map(folder => ({ ...folder, isDefault: samePath(folder.path, preferred), name: samePath(folder.path, legacy) ? '原默认文件夹' : folder.name }))
  if (!folders.some(folder => samePath(folder.path, preferred))) folders.push({ path: preferred, name: '默认文件夹', isDefault: true })
  const activeFolder = samePath(settings.activeFolder, legacy) ? preferred : settings.activeFolder
  return { ...settings, folders, activeFolder, gameDir: activeFolder, gameFolderPolicyVersion: 1 }
}

/** Only the launcher-owned default may be created implicitly; missing external roots stay missing. */
export function ensureDefaultGameFolder(appData: string, folders: readonly { path: string }[]): void {
  for (const root of new Set([path.join(appData, '.zerodistance'), preferredGameFolder(appData)])) {
    if (folders.some(folder => samePath(folder.path, root))) fs.mkdirSync(root, { recursive: true })
  }
}
