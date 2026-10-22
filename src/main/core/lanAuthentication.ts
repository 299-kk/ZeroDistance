import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import Zip from 'adm-zip'
import { authenticationGetter, mojangLanSymbols, intermediaryLanSymbols, forgeLanSymbols, type LanSymbols } from './lanClass'
import { getVersionJson } from './versions'
import { downloadFile } from './download'

const normal: LanSymbols = { server: 'net/minecraft/server/MinecraftServer', integrated: 'net/minecraft/client/server/IntegratedServer', getter: 'usesAuthentication' }
const pending = new Map<string, Promise<LanSymbols>>()
async function symbols(mcVersion: string, loader: string | undefined, client: string): Promise<LanSymbols> {
  const key = JSON.stringify([mcVersion, loader, client, fs.statSync(client).mtimeMs])
  if (!pending.has(key)) pending.set(key, resolve(mcVersion, loader, client).catch(error => { pending.delete(key); throw error }))
  return pending.get(key)!
}
async function resolve(mcVersion: string, loader: string | undefined, client: string): Promise<LanSymbols> {
  if (!/^[\w.+-]+$/.test(mcVersion) || mcVersion === '.' || mcVersion === '..') throw new Error('无法识别 Minecraft 版本')
  const zip = new Zip(client), canonical = zip.getEntry(normal.server + '.class')
  if (canonical && authenticationGetter(zip.readFile(canonical)!, normal.getter) && zip.getEntry(normal.integrated + '.class')) return normal
  const root = path.join(app.getPath('userData'), 'lan-mappings'); fs.mkdirSync(root, { recursive: true })
  const metadata = await getVersionJson(mcVersion, path.join(root, mcVersion + '.json'), AbortSignal.timeout(30000))
  const mapping = metadata.downloads?.client_mappings
  if (!mapping?.url || !mapping.sha1 || !/^https:\/\/(piston-data|launcher)\.mojang\.com\//.test(mapping.url)) throw new Error('此版本没有可用的官方方法映射，暂不支持一键关闭')
  const file = path.join(root, mcVersion + '-client.txt')
  await downloadFile(mapping.url, file, undefined, mapping.sha1, 'official', AbortSignal.timeout(30000))
  const original = mojangLanSymbols(fs.readFileSync(file, 'utf8'))
  const server = zip.readFile(original.server + '.class')
  if (!server || !zip.getEntry(original.integrated + '.class') || !authenticationGetter(server, original.getter)) throw new Error('此版本的验证方法不兼容，未修改任何设置')
  if (loader === 'fabric' || loader === 'quilt') {
    const destination = path.join(root, mcVersion + '-intermediary.jar')
    if (!fs.existsSync(destination)) await downloadFile(`https://maven.fabricmc.net/net/fabricmc/intermediary/${mcVersion}/intermediary-${mcVersion}-v2.jar`, destination, undefined, undefined, 'official', AbortSignal.timeout(30000))
    const tiny = new Zip(destination).readAsText('mappings/mappings.tiny')
    return intermediaryLanSymbols(tiny, original)
  }
  if (loader === 'forge' || (loader === 'neoforge' && mcVersion === '1.20.1')) {
    const destination = path.join(root, mcVersion + '-mcp.zip')
    if (!fs.existsSync(destination)) {
      const response = await fetch('https://maven.minecraftforge.net/de/oceanlabs/mcp/mcp_config/maven-metadata.xml', { signal: AbortSignal.timeout(25000) })
      if (!response.ok) throw new Error('暂时无法读取 Forge 映射，请稍后重试')
      const matches = [...(await response.text()).matchAll(/<version>([^<]+)<\/version>/g)].map(item => item[1]).filter(id => id.startsWith(mcVersion + '-') && /^-\d{8}\.\d{6}$/.test(id.slice(mcVersion.length))).sort()
      const version = matches.at(-1); if (!version) throw new Error('此 Forge 版本没有可用的方法映射')
      await downloadFile(`https://maven.minecraftforge.net/de/oceanlabs/mcp/mcp_config/${version}/mcp_config-${version}.zip`, destination, undefined, undefined, 'official', AbortSignal.timeout(30000))
    }
    return forgeLanSymbols(new Zip(destination).readAsText('config/joined.tsrg'), original)
  }
  if (loader === 'neoforge') return normal
  return original
}
export async function prepareLanAuthentication(mcVersion: string, loader: string | undefined, client: string): Promise<string[]> {
  const agent = path.join(__dirname, 'zero-distance-lan-agent.jar').replace('app.asar', 'app.asar.unpacked')
  if (!fs.existsSync(agent)) throw new Error('内置局域网补丁缺失，请重新安装完整的 ZeroDistance')
  const target = await symbols(mcVersion, loader, client)
  const content = `${target.server}=${target.integrated}|${target.getter}\n`
  const directory = path.join(app.getPath('userData'), 'lan-mappings'); fs.mkdirSync(directory, { recursive: true })
  const config = path.join(directory, crypto.createHash('sha256').update(content).digest('hex') + '.properties')
  fs.writeFileSync(config, content)
  return [`-javaagent:${agent}=${config}`]
}
