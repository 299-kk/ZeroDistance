import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { moveDirectoryWithRetry } from '../src/main/core/directoryMove'

test('瞬时占用重试成功，长期占用及取消不会删除原目录', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zero-move-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const source = path.join(root, 'source'), dest = path.join(root, 'dest')
  await fs.mkdir(source); await fs.writeFile(path.join(source, 'save.dat'), 'keep')
  let attempts = 0
  await moveDirectoryWithRetry(source, dest, undefined, async (a, b) => {
    if (++attempts < 3) throw Object.assign(new Error('sharing violation'), { code: 'EPERM' })
    await fs.rename(a, b)
  }, [1, 1])
  assert.equal(await fs.readFile(path.join(dest, 'save.dat'), 'utf8'), 'keep')
  await fs.rename(dest, source)
  await assert.rejects(moveDirectoryWithRetry(source, dest, undefined, async () => { throw Object.assign(new Error('busy'), { code: 'EPERM' }) }, [1]), /占用或没有足够权限/)
  assert.equal(await fs.readFile(path.join(source, 'save.dat'), 'utf8'), 'keep')
  const abort = new AbortController()
  await assert.rejects(moveDirectoryWithRetry(source, dest, abort.signal, async () => { abort.abort(new Error('cancelled')); throw Object.assign(new Error('busy'), { code: 'EPERM' }) }, [1]), /cancelled/)
  assert.equal(await fs.readFile(path.join(source, 'save.dat'), 'utf8'), 'keep')
})

test('真实 Windows 目录共享锁释放后，重新尝试可成功移动', { skip: process.platform !== 'win32', timeout: 20000 }, async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zero-winlock-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const source = path.join(root, 'source'), dest = path.join(root, 'dest')
  await fs.mkdir(source); await fs.writeFile(path.join(source, 'save.dat'), 'keep')
  const script = "[Console]::Out.WriteLine('LOCKED'); [Console]::Out.Flush(); Start-Sleep -Milliseconds 1300"
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { cwd: source, windowsHide: true })
  t.after(() => { if (child.exitCode === null) child.kill() })
  await new Promise<void>((resolve, reject) => {
    child.stdout.on('data', chunk => { if (String(chunk).includes('LOCKED')) resolve() })
    child.once('error', reject); child.once('exit', code => { if (code !== 0) reject(new Error('锁定测试进程失败：' + code)) })
  })
  let denied = 0
  await moveDirectoryWithRetry(source, dest, undefined, async (from, to) => {
    try { await fs.rename(from, to) } catch (error) { if (['EPERM', 'EACCES', 'EBUSY'].includes((error as NodeJS.ErrnoException).code ?? '')) denied++; throw error }
  }, [150, 300, 600, 1000, 1000])
  assert(denied > 0, 'Windows 必须确实拒绝过移动，才能验证释放锁后的重试')
  assert.equal(await fs.readFile(path.join(dest, 'save.dat'), 'utf8'), 'keep')
})
