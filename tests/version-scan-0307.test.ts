import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import AdmZip from 'adm-zip'
import { build } from 'esbuild'
import { isMinecraftVersionId, resolveInstanceMetadata } from '../src/main/core/instanceMetadata'

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-scan-api-'))
process.once('exit', () => fs.rmSync(fixtureRoot, { recursive: true, force: true }))
const apiCache: Promise<Record<string, any>> = (async () => {
  const built = await build({ stdin: { contents: "export { scanInstalledFolder, listAllInstalled } from './src/main/core/versions'; export { saveSettings } from './src/main/core/settings'", resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external' })
  const mod = { exports: {} as any }, req = createRequire(path.resolve('package.json'))
  new Function('require', 'module', 'exports', '__dirname', built.outputFiles[0].text)((id: string) => id === 'electron' ? { app: { getPath: () => fixtureRoot, isPackaged: false }, BrowserWindow: { getAllWindows: () => [] } } : req(id), mod, mod.exports, fixtureRoot)
  return mod.exports
})()

test('版本扫描排除无关目录与描述，保留待修复实例并从客户端识别重命名版本', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-scan-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const api = await apiCache
  const game = path.join(root, 'game'), versions = path.join(game, 'versions')
  api.saveSettings({ gameDir: game, activeFolder: game, folders: [{ path: game, name: 'test', isDefault: true }], mirror: 'bmclapi' })
  const folder = (id: string) => { const dir = path.join(versions, id); fs.mkdirSync(dir, { recursive: true }); return dir }
  folder('普通文件夹')
  fs.writeFileSync(path.join(folder('损坏'), '损坏.json'), '{')
  fs.writeFileSync(path.join(folder('其他应用'), '其他应用.json'), JSON.stringify({ id: '1.2', mainClass: 'org.example.Launcher' }))
  fs.writeFileSync(path.join(folder('失败安装'), '.installing'), '')
  const valid = folder('1.20.1')
  fs.writeFileSync(path.join(valid, '1.20.1.json'), JSON.stringify({ id: '1.20.1', mainClass: 'net.minecraft.client.main.Main' }))
  fs.writeFileSync(path.join(valid, '1.20.1.jar'), 'fixture')
  const renamed = folder('自定义名称')
  fs.writeFileSync(path.join(renamed, '自定义名称.json'), JSON.stringify({ id: '自定义名称', mainClass: 'net.minecraft.client.main.Main' }))
  const zip = new AdmZip(); zip.addFile('version.json', Buffer.from(JSON.stringify({ id: '1.21.1' }))); zip.writeZip(path.join(renamed, '自定义名称.jar'))
  const inherited = folder('Fabric 实例')
  fs.writeFileSync(path.join(inherited, 'Fabric 实例.json'), JSON.stringify({ id: 'Fabric 实例', inheritsFrom: '1.20.1', libraries: [{ name: 'net.fabricmc:fabric-loader:0.16.0' }] }))
  const result = api.scanInstalledFolder(game)
  assert.deepEqual(result.versions.map((v: any) => v.id).sort(), ['1.20.1', 'Fabric 实例', '失败安装', '自定义名称'].sort())
  assert.equal(result.versions.find((v: any) => v.id === '自定义名称').mcVersion, '1.21.1')
  assert.equal(result.versions.find((v: any) => v.id === 'Fabric 实例').mcVersion, '1.20.1')
  assert.equal(result.versions.find((v: any) => v.id === '失败安装').failed, true)
  assert.equal(fs.existsSync(path.join(versions, '普通文件夹')), true)
})

test('版本元数据不把自定义名称当成游戏版本', () => {
  assert.equal(resolveInstanceMetadata({ id: '我的整合包', mainClass: 'net.minecraft.client.main.Main' }, () => undefined).mcVersion, '未知')
  assert.equal(resolveInstanceMetadata({ id: '24w14a', mainClass: 'net.minecraft.client.main.Main' }, () => undefined).mcVersion, '24w14a')
  assert.equal(resolveInstanceMetadata({ id: '自定义', clientVersion: '其他软件', _mcVersion: '1.20.1', mainClass: 'net.minecraft.client.main.Main' }, () => undefined).mcVersion, '1.20.1')
})

test('快照与 NeoForge 实例正确识别，无标记损坏目录只报告不列版本', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-scan-extra-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const api = await apiCache
  const game = path.join(root, 'game'), versions = path.join(game, 'versions')
  api.saveSettings({ gameDir: game, activeFolder: game, folders: [{ path: game, name: 'test', isDefault: true }], mirror: 'bmclapi' })
  const write = (id: string, json: unknown, jar = true) => {
    const dir = path.join(versions, id); fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(json))
    if (jar) fs.writeFileSync(path.join(dir, `${id}.jar`), 'fixture')
    return dir
  }
  write('1.20.1', { id: '1.20.1', mainClass: 'net.minecraft.client.main.Main' })
  write('24w14a', { id: '24w14a', mainClass: 'net.minecraft.client.main.Main' })
  write('NeoForge 实例', {
    id: 'NeoForge 实例',
    inheritsFrom: '1.20.1',
    mainClass: 'cpw.mods.bootstraplauncher.BootstrapLauncher',
    arguments: { game: ['--fml.neoForgeVersion', '20.4.237'] },
    libraries: [{ name: 'net.neoforged:neoforge:20.4.237' }]
  }, false)
  const broken = path.join(versions, '无标记损坏'); fs.mkdirSync(broken)
  fs.writeFileSync(path.join(broken, '无标记损坏.json'), '{')
  const result = api.scanInstalledFolder(game)
  assert.deepEqual(result.versions.map((v: any) => v.id).sort(), ['1.20.1', '24w14a', 'NeoForge 实例'].sort())
  assert.equal(result.versions.find((v: any) => v.id === '24w14a').mcVersion, '24w14a')
  const neo = result.versions.find((v: any) => v.id === 'NeoForge 实例')
  assert.equal(neo.mcVersion, '1.20.1')
  assert.equal(neo.loader, 'neoforge')
  assert.equal(neo.loaderVersion, '20.4.237')
  assert.ok(result.errors.some((e: string) => e.includes('无标记损坏')), '无标记损坏目录必须报告原因，而不是静默消失')
  assert.ok(!result.versions.some((v: any) => v.id === '无标记损坏'), '损坏目录不列为可启动实例')
})

test('多个游戏目录全局扫描各自保留实例与目录归属', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-scan-multi-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const api = await apiCache
  const gameA = path.join(root, 'gameA'), gameB = path.join(root, 'gameB')
  const seed = (game: string, id: string) => {
    const dir = path.join(game, 'versions', id); fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({ id, mainClass: 'net.minecraft.client.main.Main' }))
    fs.writeFileSync(path.join(dir, `${id}.jar`), 'fixture')
  }
  seed(gameA, 'A 目录实例')
  seed(gameB, 'B 目录实例')
  seed(gameB, 'A 目录实例')
  api.saveSettings({ gameDir: gameA, activeFolder: gameA, folders: [{ path: gameA, name: 'A', isDefault: true }, { path: gameB, name: 'B' }], mirror: 'bmclapi' })
  const all = api.listAllInstalled()
  assert.equal(all.filter((v: any) => v.id === 'A 目录实例').length, 2, '两个目录里的同名实例都必须保留')
  assert.equal(all.find((v: any) => v.id === 'B 目录实例').folder, gameB)
  assert.deepEqual(all.map((v: any) => `${v.folder}::${v.id}`).sort(), [
    `${gameA}::A 目录实例`, `${gameB}::A 目录实例`, `${gameB}::B 目录实例`
  ].sort())
})
