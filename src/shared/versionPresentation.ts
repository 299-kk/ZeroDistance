import type { RemoteVersion } from './types'
export function formatBytes(bytes?: number): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return '大小未知'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}
export function versionFamily(version: RemoteVersion): string {
  if (version.type === 'old_alpha') return '早期 Alpha'
  if (version.type === 'old_beta') return '早期 Beta'
  const release = version.id.match(/^(1\.\d+|\d{2,}\.\d+)(?:\.|$|[- ])/)?.[1]
  if (release) return release
  if (version.type === 'snapshot') return /^(\d{2})w/.test(version.id) ? `20${version.id.slice(0, 2)} 开发快照` : '开发预览'
  return version.id.match(/^\d+/)?.[0] ?? '其他版本'
}
export function groupVersions(versions: RemoteVersion[]) {
  const groups = new Map<string, RemoteVersion[]>()
  for (const version of versions) {
    const family = versionFamily(version)
    if (!groups.has(family)) groups.set(family, [])
    groups.get(family)!.push(version)
  }
  return [...groups].map(([family, versions]) => ({ family, versions }))
}
