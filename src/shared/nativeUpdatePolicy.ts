import type { ReleaseInfo } from './types'
import trust from './nativeUpdateTrust.json'
export interface NativeUpdatePayload { format: 1; product: 'ZeroDistance'; platform: 'win32-x64'; version: string; publishedAt: string; body: string; asset: { name: string; url: string; size: number; sha256: string } }
export interface SignedNativeUpdate { payload: string; signature: string }
export function validateNativeUpdate(value: unknown): NativeUpdatePayload {
  const p = value as NativeUpdatePayload
  if (!p || p.format !== 1 || p.product !== 'ZeroDistance' || p.platform !== 'win32-x64' || typeof p.version!=='string'||p.version!==p.version.trim()||p.version.length>32||! /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(p.version)||p.version.split('.').some(n=>Number(n)>2147483647)) throw Error('更新清单格式无效')
  const name = `ZeroDistance-${p.version}-windows-x64.zip`
  if (p.asset?.name !== name || p.asset.url !== `https://github.com/${trust.repository}/releases/download/v${p.version}/${name}` || !/^[a-f0-9]{64}$/.test(p.asset.sha256) || !Number.isSafeInteger(p.asset.size) || p.asset.size <= 0 || p.asset.size > 100_000_000) throw Error('更新包来源或校验信息无效')
  if (typeof p.body !== 'string' || p.body.length > 100_000 || typeof p.publishedAt !== 'string' || !Number.isFinite(Date.parse(p.publishedAt))) throw Error('更新说明无效')
  return p
}
export function nativeRelease(p: NativeUpdatePayload): ReleaseInfo { return { version: p.version, publishedAt: p.publishedAt, body: p.body, assetName: p.asset.name, assetUrl: p.asset.url, assetSize: p.asset.size } }
/** Built-in mirrors, tried in order when no explicit mirror is configured. */
export const DEFAULT_UPDATE_MIRRORS: readonly string[] = trust.defaultMirrors?.length ? trust.defaultMirrors : [trust.defaultMirror]
export function nativeUpdateSources(url: string, settings: { updateSource?: string; updateMirrorUrl?: string }): string[] {
  const source = settings.updateSource ?? 'auto', custom = (settings.updateMirrorUrl || '').trim()
  if (source === 'direct') return [url]
  const candidates=custom?[custom]:DEFAULT_UPDATE_MIRRORS
  const alternates=[...new Set(candidates.map(raw=>{
    const mirror=new URL(raw)
    if(mirror.protocol!=='https:'||mirror.username||mirror.password||mirror.search||mirror.hash)throw Error('更新镜像必须是有效的 HTTPS 前缀')
    return mirror.href.replace(/\/*$/,'/')+url
  }))]
  return source === 'mirror' ? alternates : [url, ...alternates]
}
