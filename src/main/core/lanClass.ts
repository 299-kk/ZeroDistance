/** Read only the metadata needed to verify the local-host authentication hook. */
export function authenticationGetter(bytes: Buffer, name: string): boolean {
  if (bytes.length < 20 || bytes.readUInt32BE(0) !== 0xcafebabe) return false
  let at = 8
  const u1 = () => bytes[at++], u2 = () => { const n = bytes.readUInt16BE(at); at += 2; return n }, u4 = () => { const n = bytes.readUInt32BE(at); at += 4; return n }
  const count = u2(), strings: string[] = [], tags: number[] = [], refs: number[] = []
  for (let i = 1; i < count; i++) {
    tags[i] = u1()
    switch (tags[i]) {
      case 1: { const size = u2(); strings[i] = bytes.toString('utf8', at, at + size); at += size; break }
      case 3: case 4: at += 4; break
      case 5: case 6: at += 8; i++; break
      case 7: case 8: case 16: case 19: case 20: at += 2; break
      case 9: case 10: case 11: case 12: case 17: case 18: at += 2; refs[i] = u2(); break
      case 15: at += 3; break
      default: throw new Error('无法识别此版本的类文件')
    }
  }
  at += 6; const interfaces = u2(); at += interfaces * 2
  const member = (method: boolean) => {
    const flags = u2(), memberName = strings[u2()], desc = strings[u2()], attributes = u2()
    let match = false
    for (let i = 0; i < attributes; i++) {
      const attribute = strings[u2()], length = u4(), end = at + length
      if (method && memberName === name && desc === '()Z' && !(flags & (8 | 16 | 256 | 1024)) && attribute === 'Code') {
        at += 4; const size = u4()
        if (size === 5 && bytes[at] === 0x2a && bytes[at + 1] === 0xb4 && bytes[at + 4] === 0xac) {
          const field = bytes.readUInt16BE(at + 2)
          match = tags[field] === 9 && strings[refs[refs[field]]] === 'Z'
        }
      }
      at = end
    }
    return match
  }
  const fields = u2(); for (let i = 0; i < fields; i++) member(false)
  const methods = u2(); for (let i = 0; i < methods; i++) if (member(true)) return true
  return false
}
export interface LanSymbols { server: string; integrated: string; getter: string }
export function mojangLanSymbols(mapping: string): LanSymbols {
  let section = '', server = '', integrated = '', getter = ''
  for (const line of mapping.split(/\r?\n/)) {
    const header = line.match(/^([^\s]+) -> ([^\s]+):$/)
    if (header) {
      section = header[1]
      if (section === 'net.minecraft.server.MinecraftServer') server = header[2].replaceAll('.', '/')
      if (section === 'net.minecraft.client.server.IntegratedServer') integrated = header[2].replaceAll('.', '/')
    } else if (section === 'net.minecraft.server.MinecraftServer') {
      const method = line.match(/boolean usesAuthentication\(\)(?::\d+:\d+)? -> (\S+)/)
      if (method) getter = method[1]
    }
  }
  if (!server || !integrated || !getter) throw new Error('此游戏版本缺少可识别的局域网验证方法')
  return { server, integrated, getter }
}
export function intermediaryLanSymbols(tiny: string, original: LanSymbols): LanSymbols {
  let current = '', server = '', integrated = '', getter = ''
  for (const line of tiny.split(/\r?\n/)) {
    const parts = line.split('\t')
    if (parts[0] === 'c') { current = parts[1]; if (current === original.server) server = parts[2]; if (current === original.integrated) integrated = parts[2] }
    if (current === original.server && parts[0] === '' && parts[1] === 'm' && parts[2] === '()Z' && parts[3] === original.getter) getter = parts[4]
  }
  if (!server || !integrated || !getter) throw new Error('此 Fabric / Quilt 版本无法解析局域网方法映射')
  return { server, integrated, getter }
}
export function forgeLanSymbols(tsrg: string, original: LanSymbols): LanSymbols {
  let inServer = false, getter = ''
  for (const line of tsrg.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/)
    if (!/^\s/.test(line)) inServer = parts[0] === original.server
    else if (inServer && parts[0] === original.getter && parts[1] === '()Z') getter = parts[2]
  }
  if (!getter) throw new Error('此 Forge 版本无法解析局域网方法映射')
  return { server: 'net/minecraft/server/MinecraftServer', integrated: 'net/minecraft/client/server/IntegratedServer', getter }
}
