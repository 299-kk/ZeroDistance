import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { preferredGameFolder, migrateDefaultGameFolder } from '../src/main/core/defaultGameFolder'
import { discoverMinecraftRoots } from '../src/main/core/gameFolderDiscovery'
import { resolveInstanceIcon, authorizeInstanceIcon } from '../src/main/core/instanceIcons'

const png = fs.readFileSync('build/icon-512.png')
function fixture(t: Parameters<Parameters<typeof test>[1]>[0]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-library-012-'))
  t.after(() => {
    assert(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep))
    fs.rmSync(root, { recursive: true, force: true })
  })
  const write = (relative: string, data: string | Buffer) => {
    const file = path.join(root, relative)
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data)
    return file
  }
  return { root, write }
}

test('D drive default falls back when absent; migration preserves existing C games and the selected external folder', t => {
  const { root, write } = fixture(t)
  const appData = path.join(root, 'appData'), disk = path.join(root, 'D')
  fs.mkdirSync(disk)
  const preferred = preferredGameFolder(appData, 'win32', disk)
  assert.equal(preferred, path.join(disk, 'ZeroDistance', '.minecraft'))
  assert.equal(preferredGameFolder(appData, 'win32', path.join(root, 'absent')), path.join(appData, '.zerodistance'))
  write('appData/.zerodistance/versions/old/old.json', '{"id":"old"}')
  const old = path.join(appData, '.zerodistance'), active = path.join(root, 'MC')
  const state = { folders: [{ path: old, name: '默认文件夹', isDefault: true }, { path: active, name: 'MC', isDefault: false }], activeFolder: active, gameDir: active }
  const next = migrateDefaultGameFolder(state, appData, preferred)
  assert.equal(next.activeFolder, active)
  assert.equal(next.folders.find(f => f.isDefault)?.path, preferred)
  assert(next.folders.some(f => f.path === old))
  assert.equal(fs.readFileSync(path.join(old, 'versions/old/old.json'), 'utf8'), '{"id":"old"}')
  assert.equal(fs.existsSync(preferred), false, 'migration itself does not copy or create game files')
  assert.equal(migrateDefaultGameFolder(next, appData, preferred), next)
  assert.equal(migrateDefaultGameFolder({ ...state, activeFolder: old }, appData, preferred).activeFolder, preferred)
})

test('explicit user defaults survive the D drive policy', t => {
  const { root } = fixture(t)
  const custom = path.join(root, 'custom')
  const next = migrateDefaultGameFolder({ folders: [{ path: custom, name: 'custom', isDefault: true }], activeFolder: custom, gameDir: custom }, root, path.join(root, 'D/default'))
  assert.equal(next.folders.length, 1)
  assert.equal(next.folders[0].path, custom)
})

test('discovery imports MC/minecraft/我的世界 wrappers, deduplicates roots and leaves empty or corrupt directories alone', async t => {
  const { root, write } = fixture(t)
  write('MC/.minecraft/versions/a/a.json', '{"id":"a"}')
  write('Games/MINECRAFT/versions/b/b.json', '\uFEFF{"id":"b"}')
  write('Games/我的世界/.minecraft/versions/c/c.json', '{"id":"c"}')
  write('Empty/minecraft/readme.txt', 'keep')
  write('Broken/MC/versions/oops/oops.json', 'invalid json')
  const found = await discoverMinecraftRoots([root, path.join(root, 'MC/.minecraft')])
  assert.deepEqual(new Set(found), new Set(['MC/.minecraft', 'Games/MINECRAFT', 'Games/我的世界/.minecraft'].map(p => path.join(root, p))))
  assert.equal(fs.readFileSync(path.join(root, 'Empty/minecraft/readme.txt'), 'utf8'), 'keep')
  assert.deepEqual(await discoverMinecraftRoots([root], { maxDirectories: 0 }), [])
  assert.deepEqual(await discoverMinecraftRoots([root], { maxDepth: 0 }), [])
})

test('discovery skips junctions and game data trees', async t => {
  const { root, write } = fixture(t)
  write('outside/MC/versions/a/a.json', '{"id":"a"}')
  fs.mkdirSync(path.join(root, 'search'))
  fs.symlinkSync(path.join(root, 'outside'), path.join(root, 'search/linked'), process.platform === 'win32' ? 'junction' : 'dir')
  write('search/mods/MC/versions/a/a.json', '{"id":"a"}')
  assert.deepEqual(await discoverMinecraftRoots([path.join(root, 'search')]), [])
})

test('imported PCL icons, instance icons, and explicit icons resolve in priority order', t => {
  const { root, write } = fixture(t)
  const pack = write('versions/包/PCL/Logo.png', png)
  const plain = write('versions/包/icon.png', png)
  const custom = write('.kamucl/icons/custom.png', png)
  assert.equal(resolveInstanceIcon(root, '包'), pack)
  assert.equal(resolveInstanceIcon(root, '包', 'file:custom.png'), custom)
  assert.equal(resolveInstanceIcon(root, '包', 'mob:allay'), '')
  fs.writeFileSync(pack, 'broken')
  assert.equal(resolveInstanceIcon(root, '包'), plain)
  fs.rmSync(plain)
  assert.equal(resolveInstanceIcon(root, '包'), '')
})

test('legacy shared icon caches remain readable after changing the default', t => {
  const { root, write } = fixture(t)
  const old = path.join(root, 'old'), current = path.join(root, 'new')
  const icon = write('old/.kamucl/icons/custom.png', png)
  assert.equal(resolveInstanceIcon(current, 'instance', 'file:custom.png', [old]), icon)
  const local = write('new/.kamucl/icons/custom.png', png)
  assert.equal(resolveInstanceIcon(current, 'instance', 'file:custom.png', [old]), local)
})

test('icon protocol rejects unregistered roots, arbitrary files, traversal and escaped junctions', t => {
  const { root, write } = fixture(t)
  const registered = path.join(root, 'registered')
  const icon = write('registered/versions/a/PCL/Logo.png', png)
  const arbitrary = write('registered/private.png', png)
  const outside = write('outside/icon.png', png)
  assert.equal(authorizeInstanceIcon(icon, [registered]), icon)
  assert.equal(authorizeInstanceIcon(icon, []), '')
  assert.equal(authorizeInstanceIcon(arbitrary, [registered]), '')
  assert.equal(authorizeInstanceIcon(outside, [registered]), '')
  assert.equal(resolveInstanceIcon(registered, '../../outside', 'file:../../icon.png'), '')
  fs.symlinkSync(path.dirname(outside), path.join(registered, 'versions/escaped'), process.platform === 'win32' ? 'junction' : 'dir')
  assert.equal(authorizeInstanceIcon(path.join(registered, 'versions/escaped/icon.png'), [registered]), '')
})
