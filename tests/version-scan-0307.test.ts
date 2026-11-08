import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import AdmZip from 'adm-zip'
import { build } from 'esbuild'
import { resolveInstanceMetadata } from '../src/main/core/instanceMetadata'

test('版本扫描排除无关目录与描述，保留待修复实例并从客户端识别重命名版本', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-scan-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const built = await build({ stdin: { contents: "export { scanInstalledFolder } from './src/main/core/versions'; export { saveSettings } from './src/main/core/settings'", resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external' })
  const mod = { exports: {} as any }, req = createRequire(path.resolve('package.json'))
  new Function('require', 'module', 'exports', '__dirname', built.outputFiles[0].text)((id: string) => id === 'electron' ? { app: { getPath: () => root, isPackaged: false }, BrowserWindow: { getAllWindows: () => [] } } : req(id), mod, mod.exports, root)
  const api = mod.exports, game = path.join(root, 'game'), versions = path.join(game, 'versions')
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
