import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import type { Account, ProfileSkins, SkinVariant } from '../../shared/types'

function identity(account: Pick<Account, 'id' | 'type'>) {
  if (account.type !== 'offline') throw new Error('请选择离线账号')
  return crypto.createHash('sha256').update(account.id).digest('hex').slice(0, 24)
}
function owned(root: string, ...parts: string[]) {
  const file = path.join(root, ...parts)
  let cursor = path.resolve(root)
  if (fs.existsSync(cursor) && fs.lstatSync(cursor).isSymbolicLink()) throw new Error('皮肤目录不能是符号链接')
  for (const part of parts) {
    cursor = path.join(cursor, part)
    if (fs.existsSync(cursor) && fs.lstatSync(cursor).isSymbolicLink()) throw new Error('皮肤文件不能是符号链接')
  }
  return file
}
function write(file: string, value: string | Buffer) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temp = file + '.' + crypto.randomUUID() + '.tmp'
  try { fs.writeFileSync(temp, value, { flag: 'wx' }); fs.renameSync(temp, file) }
  finally { fs.rmSync(temp, { force: true }) }
}
export function readOfflineSkin(root: string, account: Account): ProfileSkins {
  const key = identity(account), png = owned(root, key + '.png'), meta = owned(root, key + '.json')
  const profile: ProfileSkins = { username: account.username, skins: [], capes: [] }
  if (fs.existsSync(png) && fs.statSync(png).size <= 2_000_000) {
    let variant: SkinVariant = 'classic'
    try { variant = JSON.parse(fs.readFileSync(meta, 'utf8')).variant === 'slim' ? 'slim' : 'classic' } catch {}
    profile.skins.push({ variant, url: '', dataUrl: 'data:image/png;base64,' + fs.readFileSync(png).toString('base64'), state: 'ACTIVE' })
  }
  return profile
}
export function storeOfflineSkin(root: string, account: Account, png: Buffer | null, variant: SkinVariant): ProfileSkins {
  const key = identity(account)
  if (variant !== 'classic' && variant !== 'slim') throw new Error('无效的皮肤模型')
  if (png) write(owned(root, key + '.png'), png)
  if (!png && !readOfflineSkin(root, account).skins.length) throw new Error('请先选择皮肤文件')
  write(owned(root, key + '.json'), JSON.stringify({ variant }))
  return readOfflineSkin(root, account)
}
/** Legacy loader is a documented CustomSkinLoader interface. Keep other skin sources intact. */
export function syncOfflineSkin(root: string, gameDirectory: string, account: Account): boolean {
  if (account.type !== 'offline') return false
  const profile = readOfflineSkin(root, account), skin = profile.skins[0]
  if (!skin?.dataUrl) return false
  if (!/^[a-zA-Z0-9_]{1,16}$/.test(account.username)) throw new Error('离线皮肤需要 1–16 位英文、数字或下划线的玩家名')
  const key = identity(account), relative = ['CustomSkinLoader', 'ZeroDistance', key, account.username + '.png']
  const dest = owned(gameDirectory, ...relative)
  const config = owned(gameDirectory, 'CustomSkinLoader', 'CustomSkinLoader.json')
  const extra = owned(gameDirectory, 'CustomSkinLoader', 'ExtraList', 'ZeroDistanceLocal.json')
  let data: Record<string, unknown> = {}
  if (fs.existsSync(config)) {
    if (fs.statSync(config).size > 2_000_000) throw new Error('CustomSkinLoader 配置过大，未修改')
    try { data = JSON.parse(fs.readFileSync(config, 'utf8').replace(/^\uFEFF/, '')) } catch { throw new Error('CustomSkinLoader 配置无法解析，未覆盖原配置') }
    if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.loadlist)) throw new Error('CustomSkinLoader 配置格式无效，未覆盖原配置')
  }
  const loadlist = (Array.isArray(data.loadlist) ? data.loadlist : []).filter(entry => entry?.name !== 'ZeroDistanceLocal')
  const entry = { name: 'ZeroDistanceLocal', type: 'Legacy', checkPNG: false, skin: `ZeroDistance/${key}/{USERNAME}.png`, model: skin.variant === 'slim' ? 'slim' : 'default' }
  const content = JSON.stringify({ ...data, loadlist: [entry, ...loadlist] }, null, 2)
  write(dest, Buffer.from(skin.dataUrl.split(',')[1], 'base64'))
  // Let the mod initialize its normal default sources on first run.
  if (!fs.existsSync(config)) { write(extra, JSON.stringify(entry, null, 2)); return true }
  if (!fs.existsSync(config) || fs.readFileSync(config, 'utf8') !== content) {
    if (fs.existsSync(config)) {
      const backup = owned(gameDirectory, 'CustomSkinLoader', 'CustomSkinLoader.zero-distance-backup.json')
      if (!fs.existsSync(backup)) fs.copyFileSync(config, backup, fs.constants.COPYFILE_EXCL)
    }
    write(config, content)
  }
  return true
}
