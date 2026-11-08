import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { withFileJob } from './fileJobs'
import { moveDirectoryWithRetry } from './directoryMove'

const journalPrefix = '.zerodistance-recycle-'
function validName(id: unknown): id is string {
  return typeof id === 'string' && !!id && id !== '.' && id !== '..' && !/[\\/:*?"<>|\x00-\x1f]/.test(id) && !/[. ]$/.test(id)
}
function processAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch (error) { return (error as NodeJS.ErrnoException).code !== 'ESRCH' }
}
function existsNoFollow(file: string): boolean {
  try { fsSync.lstatSync(file); return true } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error }
}

/** Recover only our own interrupted same-directory moves; never overwrite a new instance. */
export function recoverVersionRecycles(folder: string): void {
  const parent = path.resolve(folder, 'versions')
  let files: string[]
  try { if (fsSync.lstatSync(parent).isSymbolicLink()) return; files = fsSync.readdirSync(parent) } catch { return }
  for (const file of files) {
    if (!/^\.zerodistance-recycle-[0-9a-f-]{36}\.json$/.test(file)) continue
    const journal = path.join(parent, file)
    try {
      const stat = fsSync.lstatSync(journal)
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096) continue
      const entry = JSON.parse(fsSync.readFileSync(journal, 'utf8'))
      const token = file.slice(journalPrefix.length, -5)
      if (entry.version !== 1 || !validName(entry.id) || entry.staged !== `${entry.id.slice(0, 80)}-ZD-${token}` || !Number.isSafeInteger(entry.pid) || entry.pid <= 0 || processAlive(entry.pid)) continue
      const original = path.join(parent, entry.id), staged = path.join(parent, entry.staged)
      if (!existsNoFollow(staged)) { fsSync.unlinkSync(journal); continue }
      const current = fsSync.lstatSync(staged)
      if (!current.isDirectory() || current.isSymbolicLink() || existsNoFollow(original)) continue
      fsSync.renameSync(staged, original)
      fsSync.unlinkSync(journal)
    } catch { /* Preserve the journal and data for manual recovery. */ }
  }
}

/** Use the native recycle operation instead of deleting children before discovering a locked parent. */
export async function recycleVersion(folder: string, id: string, deps: {
  assertIdle(directory: string): Promise<void>
  trash(directory: string): Promise<void>
}): Promise<void> {
  if (!validName(id)) {
    throw new Error('版本名称无效，未删除任何文件')
  }
  const parent = path.resolve(folder, 'versions'), target = path.resolve(parent, id)
  if (path.dirname(target) !== parent) throw new Error('版本路径超出游戏目录')
  return withFileJob(target, undefined, async () => {
    let stat
    try { stat = await fs.lstat(target) } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return; throw e }
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('版本目录是链接或不是文件夹，请在文件管理器中确认其实际位置')
    if ((await fs.lstat(parent)).isSymbolicLink()) throw new Error('versions 目录是链接，请先确认实际游戏目录')
    await deps.assertIdle(target)
    // Recheck after asynchronous process inspection; no traversal into child links.
    const current = await fs.lstat(target)
    if (current.isSymbolicLink() || current.ino !== stat.ino || current.dev !== stat.dev) throw new Error('版本目录已变化，请刷新后重试')
    // A same-volume rename can work around some Windows Shell recycle failures.
    // Stage the whole directory without deleting its children.
    const token = crypto.randomUUID(), staged = path.join(parent, `${id.slice(0, 80)}-ZD-${token}`)
    const journal = path.join(parent, `${journalPrefix}${token}.json`)
    let moved = false, journalCreated = false
    try {
      await fs.writeFile(journal, JSON.stringify({ version: 1, id, staged: path.basename(staged), pid: process.pid }), { flag: 'wx' })
      journalCreated = true
      await moveDirectoryWithRetry(target, staged)
      moved = true
      await deps.trash(staged)
      try { await fs.lstat(staged) } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') { await fs.unlink(journal).catch(() => {}); return }; throw e }
      throw new Error('系统未移除该目录')
    } catch (error) {
      if (moved) {
        let exists = false
        try {
          await fs.lstat(staged)
          exists = true
        } catch (checkError) {
          if ((checkError as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error(`回收状态无法确认；请检查 ${staged}：${String(checkError)}`)
        }
        if (exists) try {
          try { await fs.lstat(target); throw new Error('原位置已被占用') } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e }
          await moveDirectoryWithRetry(staged, target)
          moved = false
        } catch (restoreError) {
          throw new Error(`回收失败，未能恢复原名称；请在文件管理器中检查 ${staged}：${String(restoreError)}`)
        }
      }
      if (journalCreated) await fs.unlink(journal).catch(() => {})
      throw new Error(`无法将版本移入回收站：请关闭使用该目录的游戏或文件窗口，并检查目录权限及磁盘的回收站支持。目录：${target}；${error instanceof Error ? error.message : String(error)}`)
    }
  })
}
