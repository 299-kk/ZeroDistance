import fs from 'node:fs/promises'

/** Retry transient Windows sharing violations without deleting or replacing data. */
export async function moveDirectoryWithRetry(
  from: string, to: string, signal?: AbortSignal,
  rename: (from: string, to: string) => Promise<void> = fs.rename,
  delays = process.platform === 'win32' ? [250, 500, 1000, 2000, 3000] : []
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted()
    try { await rename(from, to); return } catch (error) {
      signal?.throwIfAborted()
      const code = (error as NodeJS.ErrnoException).code
      if (!code || !['EPERM', 'EACCES', 'EBUSY'].includes(code) || attempt >= delays.length) {
        if (code && ['EPERM', 'EACCES', 'EBUSY'].includes(code)) throw new Error('目录被占用或没有足够权限：请退出游戏，关闭打开该目录的文件管理器窗口，再重试。导入时也可以选择保留两份。', { cause: error })
        throw error
      }
      await new Promise<void>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout>
        const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(signal?.reason ?? new Error('已取消')) }
        timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve() }, delays[attempt])
        signal?.addEventListener('abort', abort, { once: true })
        if (signal?.aborted) abort()
      })
    }
  }
}
