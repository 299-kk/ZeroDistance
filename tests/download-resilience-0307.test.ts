import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  downloadAll,
  downloadCandidates,
  mirrorUrl,
  resetHostHealthForTest,
  retryableDownloadError
} from '../src/main/core/download'
import { downloadFetch } from '../src/main/core/downloadFetch'
import { downloadLimiter } from '../src/main/core/downloadLimits'

const sha1 = (bytes: Buffer): string => crypto.createHash('sha1').update(bytes).digest('hex')

test('Modrinth 文件同时生成国内镜像与两个官方 CDN 候选，其他路径不转换', () => {
  const cdn = 'https://cdn.modrinth.com/data/abc/versions/xyz/file.jar'
  assert.deepEqual(downloadCandidates([cdn], 'bmclapi'), [
    'https://mod.mcimirror.top/data/abc/versions/xyz/file.jar',
    cdn,
    'https://cdn-raw.modrinth.com/data/abc/versions/xyz/file.jar'
  ])
  assert.deepEqual(downloadCandidates([cdn], 'official'), [
    cdn,
    'https://cdn-raw.modrinth.com/data/abc/versions/xyz/file.jar'
  ])
  const raw = 'https://cdn-raw.modrinth.com/data/abc/versions/xyz/file.jar'
  assert.deepEqual(downloadCandidates([raw], 'official'), [raw, cdn])
  assert.equal(
    mirrorUrl('https://cdn-raw.modrinth.com/data/abc/versions/xyz/file.jar', 'bmclapi'),
    'https://mod.mcimirror.top/data/abc/versions/xyz/file.jar'
  )
  assert.equal(
    mirrorUrl('https://cdn-alt.modrinth.com/data/abc/versions/xyz/file.jar', 'bmclapi'),
    'https://mod.mcimirror.top/data/abc/versions/xyz/file.jar'
  )
  for (const untouched of [
    'https://cdn.modrinth.com/user/avatar.png',
    'https://cdn.modrinth.com/data/abc/file.jar',
    'https://example.com/data/abc/versions/xyz/file.jar'
  ]) assert.equal(mirrorUrl(untouched, 'bmclapi'), untouched)
})

test('cdn-alt 无法连接时自动回到 cdn.modrinth.com 的同一对象', async () => {
  const calls: string[] = []
  const fetcher = async (url: string): Promise<Response> => {
    calls.push(url)
    const host = new URL(url).hostname
    if (host === 'cdn-alt.modrinth.com') throw new TypeError('fetch failed')
    return new Response('payload', { status: 200 })
  }
  const response = await downloadFetch(
    'https://cdn-alt.modrinth.com/data/abc/versions/xyz/file.jar',
    { headers: { accept: 'x' } },
    undefined,
    fetcher as unknown as NonNullable<Parameters<typeof downloadFetch>[3]>
  )
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'payload')
  assert.equal(calls.length, 2)
  assert.match(calls[1], /^https:\/\/cdn\.modrinth\.com\/data\/abc\/versions\/xyz\/file\.jar$/)
})

test('单个文件连续断连后由整批重试完成，已完成的文件保持有效', { timeout: 30_000 }, async () => {
  resetHostHealthForTest()
  downloadLimiter.configure({ downloadThreads: 4, downloadSpeedKBps: 0 })
  const bodies = { flaky: Buffer.from('recovered after dropped connections'), ok: Buffer.from('healthy file') }
  let flakyHits = 0
  const server = http.createServer((req, res) => {
    const key = req.url === '/flaky' ? 'flaky' : 'ok'
    if (key === 'flaky') {
      flakyHits++
      if (flakyHits <= 5) return void res.writeHead(503).end('retry')
    }
    res.writeHead(200, { 'content-length': String(bodies[key].length) })
    res.end(bodies[key])
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'kamucl-batch-retry-'))
  const base = `http://127.0.0.1:${address.port}`
  try {
    const detail: Array<{ retryingFiles?: number }> = []
    await downloadAll([
      { url: `${base}/flaky`, dest: path.join(root, 'flaky.jar'), sha1: sha1(bodies.flaky), size: bodies.flaky.length },
      { url: `${base}/ok`, dest: path.join(root, 'ok.jar'), sha1: sha1(bodies.ok), size: bodies.ok.length }
    ], (_done, _total, _speed, snapshot) => detail.push({ retryingFiles: snapshot.retryingFiles }), 2, 'official', undefined, 2)
    assert.equal(flakyHits, 6)
    assert.deepEqual(await fs.promises.readFile(path.join(root, 'flaky.jar')), bodies.flaky)
    assert.deepEqual(await fs.promises.readFile(path.join(root, 'ok.jar')), bodies.ok)
    assert.ok(detail.some(item => (item.retryingFiles ?? 0) > 0), '等待整批重试时应报告重试数量')
    assert.equal(detail.at(-1)?.retryingFiles ?? 0, 0)
  } finally {
    downloadLimiter.configure({ downloadThreads: 16, downloadSpeedKBps: 0 })
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    await fs.promises.rm(root, { recursive: true, force: true })
  }
})

test('一个文件失败不会中断其他正在下载的文件', { timeout: 30_000 }, async () => {
  resetHostHealthForTest()
  downloadLimiter.configure({ downloadThreads: 2, downloadSpeedKBps: 0 })
  const slow = Buffer.alloc(512 * 1024, 7)
  const server = http.createServer((req, res) => {
    if (req.url === '/bad') return void res.writeHead(500).end('broken')
    res.writeHead(200, { 'content-length': String(slow.length) })
    let offset = 0
    const timer = setInterval(() => {
      if (res.destroyed || res.writableEnded) return clearInterval(timer)
      offset = Math.min(slow.length, offset + 32 * 1024)
      res.write(slow.subarray(offset - 32 * 1024, offset))
      if (offset >= slow.length) { clearInterval(timer); res.end() }
    }, 20)
    res.on('close', () => clearInterval(timer))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'kamucl-batch-isolation-'))
  const base = `http://127.0.0.1:${address.port}`
  try {
    await assert.rejects(
      downloadAll([
        { url: `${base}/slow`, dest: path.join(root, 'slow.jar'), sha1: sha1(slow), size: slow.length },
        { url: `${base}/bad`, dest: path.join(root, 'bad.jar'), size: 6 }
      ], undefined, 2, 'official', undefined, 0),
      /下载失败/
    )
    assert.deepEqual(await fs.promises.readFile(path.join(root, 'slow.jar')), slow)
    assert.equal(fs.existsSync(path.join(root, 'bad.jar')), false)
  } finally {
    downloadLimiter.configure({ downloadThreads: 16, downloadSpeedKBps: 0 })
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    await fs.promises.rm(root, { recursive: true, force: true })
  }
})

test('磁盘与权限错误不进行网络重试', async () => {
  const wrapped = Object.assign(new Error('下载失败：写入失败'), { cause: Object.assign(new Error('disk'), { code: 'ENOSPC' }) })
  assert.equal(retryableDownloadError(wrapped), false)
  const network = Object.assign(new Error('下载失败：连接中断'), { cause: new TypeError('fetch failed') })
  assert.equal(retryableDownloadError(network), true)
  assert.equal(retryableDownloadError(new Error('unknown')), true)
})
