import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { measureInstance } from '../src/main/core/instanceSize'
import { readOfflineSkin, storeOfflineSkin, syncOfflineSkin } from '../src/main/core/offlineSkins'
import { formatBytes, groupVersions } from '../src/shared/versionPresentation'
import type { Account, RemoteVersion } from '../src/shared/types'
function fixture(t: Parameters<Parameters<typeof test>[1]>[0]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-020-'))
  t.after(() => { assert(root.startsWith(os.tmpdir())); fs.rmSync(root, { force: true, recursive: true }) })
  return root
}
test('instance sizes count nested files, ignore junctions, and report bounded scans as partial', async t => {
  const root = fixture(t), game = path.join(root, 'game'), external = path.join(root, 'external')
  fs.mkdirSync(game); fs.mkdirSync(external); fs.mkdirSync(path.join(game, 'mods'))
  fs.writeFileSync(path.join(game, 'version.jar'), Buffer.alloc(100))
  fs.writeFileSync(path.join(game, 'mods/mod.jar'), Buffer.alloc(200))
  fs.writeFileSync(path.join(external, 'private'), Buffer.alloc(1000))
  fs.symlinkSync(external, path.join(game, 'junction'), 'junction')
  assert.deepEqual({ ...(await measureInstance(game)), checkedAt: 0 }, { bytes: 300, files: 2, partial: false, checkedAt: 0 })
  const bounded = await measureInstance(game, { files: 1, milliseconds: 5000 })
  assert.equal(bounded.partial, true); assert.equal(bounded.files, 1)
})
const account: Account = { id: 'account-a', type: 'offline', username: 'ZeroQA', uuid: '12345678123456781234567812345678' }
test('offline skin and model persist per account without requesting an online identity', t => {
  const root = fixture(t), png = Buffer.from('fixture texture')
  storeOfflineSkin(root, account, png, 'classic')
  storeOfflineSkin(root, account, null, 'slim')
  assert.equal(readOfflineSkin(root, account).skins[0].variant, 'slim')
  assert.equal(readOfflineSkin(root, account).skins[0].dataUrl, 'data:image/png;base64,' + png.toString('base64'))
  assert.equal(readOfflineSkin(root, { ...account, id: 'other' }).skins.length, 0)
  assert.throws(() => storeOfflineSkin(root, { ...account, type: 'microsoft' }, png, 'classic'), /离线/)
})
test('CSL first run uses ExtraList; existing sources and settings survive a model update with backup', t => {
  const root = fixture(t), skinRoot = path.join(root, 'skins'), game = path.join(root, 'game')
  storeOfflineSkin(skinRoot, account, Buffer.from('png'), 'slim')
  assert(syncOfflineSkin(skinRoot, game, account))
  const config = path.join(game, 'CustomSkinLoader/CustomSkinLoader.json')
  assert.equal(fs.existsSync(config), false)
  const entry = JSON.parse(fs.readFileSync(path.join(game, 'CustomSkinLoader/ExtraList/ZeroDistanceLocal.json'), 'utf8'))
  assert.equal(entry.model, 'slim'); assert(entry.skin.endsWith('/{USERNAME}.png'))
  const original = { cacheExpiry: 50, loadlist: [{ name: 'OtherSkinSite', type: 'MojangAPI' }] }
  fs.writeFileSync(config, JSON.stringify(original))
  storeOfflineSkin(skinRoot, account, null, 'classic')
  syncOfflineSkin(skinRoot, game, account)
  const updated = JSON.parse(fs.readFileSync(config, 'utf8'))
  assert.equal(updated.loadlist[0].model, 'default'); assert.equal(updated.cacheExpiry, 50)
  assert.deepEqual(updated.loadlist[1], original.loadlist[0])
  syncOfflineSkin(skinRoot, game, account)
  assert.equal(JSON.parse(fs.readFileSync(config, 'utf8')).loadlist.length, 2)
  assert.deepEqual(JSON.parse(fs.readFileSync(config.replace('.json', '.zero-distance-backup.json'), 'utf8')), original)
})
test('offline skin sync refuses corrupt configs and linked destinations without overwriting data', t => {
  const root = fixture(t), skinRoot = path.join(root, 'skins'), game = path.join(root, 'game')
  storeOfflineSkin(skinRoot, account, Buffer.from('png'), 'classic')
  fs.mkdirSync(path.join(game, 'CustomSkinLoader'), { recursive: true })
  const config = path.join(game, 'CustomSkinLoader/CustomSkinLoader.json')
  fs.writeFileSync(config, '{broken')
  assert.throws(() => syncOfflineSkin(skinRoot, game, account), /无法解析/)
  assert.equal(fs.readFileSync(config, 'utf8'), '{broken')
  const linked = path.join(root, 'linked'), target = path.join(root, 'external')
  fs.mkdirSync(linked); fs.mkdirSync(target)
  fs.symlinkSync(target, path.join(linked, 'CustomSkinLoader'), 'junction')
  assert.throws(() => syncOfflineSkin(skinRoot, linked, account), /符号链接/)
  assert.equal(fs.readdirSync(target).length, 0)
})
test('release families retain catalog order, group patch versions, and keep snapshots separate', () => {
  const list = [ ['26.3','release'],['1.21.11','release'],['1.21.1','release'],['1.20.1','release'],['26.4-snapshot-5','snapshot'],['24w14a','snapshot'],['b1.7.3','old_beta'] ].map(([id,type]) => ({id,type}) as RemoteVersion)
  assert.deepEqual(groupVersions(list).map(g => [g.family, g.versions.length]), [['26.3',1],['1.21',2],['1.20',1],['26.4',1],['2024 开发快照',1],['早期 Beta',1]])
  assert.equal(formatBytes(undefined), '大小未知'); assert.equal(formatBytes(0), '0 B'); assert.equal(formatBytes(1_048_576), '1.0 MB')
})
