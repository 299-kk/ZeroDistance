import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { config, ipcMain, mainWindow, nativeCall } from './electron'
import { getSettings } from '../../src/main/core/settings'
import { httpFetch } from '../../src/main/core/httpClient'
import { registerTask, finishTask, cancelTask, waitIfTaskPaused } from '../../src/main/core/tasks'
import { compareSemver } from '../../src/shared/semver'
import { nativeUpdateSources, validateNativeUpdate, nativeRelease, type SignedNativeUpdate, type NativeUpdatePayload } from '../../src/shared/nativeUpdatePolicy'
import type { ReleaseInfo, UpdateCheckResult } from '../../src/shared/types'
import trust from '../../src/shared/nativeUpdateTrust.json'

export function verifyNativeFeed(envelope: SignedNativeUpdate, publicKey = trust.publicKey): NativeUpdatePayload {
  if (!envelope || typeof envelope.payload !== 'string' || typeof envelope.signature !== 'string' || envelope.payload.length > 200_000 || envelope.signature.length > 2048) throw Error('签名更新清单无效')
  const data = Buffer.from(envelope.payload, 'base64')
  if (!crypto.verify('RSA-SHA256', data, publicKey, Buffer.from(envelope.signature, 'base64'))) throw Error('更新签名不匹配，已拒绝镜像内容')
  return validateNativeUpdate(JSON.parse(data.toString('utf8')))
}
const directory = () => path.join(config.dataDirectory, 'updates')
function plain(file:string){
  for(let cursor=path.resolve(file);;cursor=path.dirname(cursor)){
    try{const st=fs.lstatSync(cursor);if(st.isSymbolicLink()||st.isFile()&&st.nlink>1)throw Error('更新路径不能包含链接文件或目录')}catch(error:any){if(error.code!=='ENOENT')throw error}
    if(path.dirname(cursor)===cursor)break
  }
  return file
}
const pendingPath = () => path.join(directory(), 'pending.json')
function atomic(file: string, data: unknown) { plain(file);fs.mkdirSync(path.dirname(file), { recursive: true }); const temp = file + '.'+crypto.randomUUID()+'.tmp';try{fs.writeFileSync(temp, JSON.stringify(data),{flag:'wx'});plain(file);fs.renameSync(temp, file)}finally{fs.rmSync(temp,{force:true})} }
function readJson(file:string){plain(file);if(fs.statSync(file).size>512_000)throw Error('本地更新记录过大');return JSON.parse(fs.readFileSync(file,'utf8'))}
type Ready = { envelope: SignedNativeUpdate; file: string }
let checked: { time: number; envelope: SignedNativeUpdate } | undefined
let current: { envelope: SignedNativeUpdate; payload: NativeUpdatePayload } | undefined
let downloading: { version: string; done: Promise<void>; taskId: string } | undefined
let suspended=false
export function suspendNativeUpdates(value:boolean){suspended=value}
export async function stopNativeUpdates(){suspended=true;const active=downloading;if(active){cancelTask(active.taskId);await active.done.catch(()=>{})}}
async function readBounded(response: Response, limit: number): Promise<string> {
  if (!response.ok) throw Error('HTTP ' + response.status)
  const reader = response.body?.getReader(); if (!reader) throw Error('更新响应为空')
  const chunks: Uint8Array[] = []; let bytes = 0
  try { for (;;) { const step = await reader.read(); if (step.done) break; bytes += step.value.length; if (bytes > limit) throw Error('更新响应过大'); chunks.push(step.value) } }
  finally { await reader.cancel().catch(() => {}) }
  return Buffer.concat(chunks).toString('utf8')
}
async function resolveSystemProxy(url:string):Promise<string|undefined>{
  if(config.qa&&!config.qaNetworkProxy)return undefined
  try{const route=await nativeCall('network:resolveProxy',[url]);if(typeof route!=='string')return undefined;const value=new URL(route);return ['http:','https:'].includes(value.protocol)&&!value.username&&!value.password&&!value.search&&!value.hash?value.href:undefined}catch{return undefined}
}
async function updateRequest(url:string,init:Parameters<typeof httpFetch>[1]):Promise<Response>{
  init.signal?.throwIfAborted();const proxyUrl=await resolveSystemProxy(url);init.signal?.throwIfAborted()
  if(proxyUrl){
    const connect=new AbortController(),timer=setTimeout(()=>connect.abort(),5000)
    try{return await httpFetch(url,{...init,proxyUrl,signal:init.signal?AbortSignal.any([init.signal,connect.signal]):connect.signal})}
    catch(error){if(init.signal?.aborted)throw error}
    finally{clearTimeout(timer)}
  }
  return httpFetch(url,init)
}
export async function secureUpdateFetch(url:string,init:Parameters<typeof httpFetch>[1]={}):Promise<Response>{
  for(let hops=0;hops<=5;hops++){
    const target=new URL(url);if(target.protocol!=='https:'||target.username||target.password)throw Error('更新请求或重定向必须使用无凭据的 HTTPS')
    const response=await updateRequest(target.href,{...init,redirect:'manual'})
    if(![301,302,303,307,308].includes(response.status))return response
    const location=response.headers.get('location');await response.body?.cancel().catch(()=>{});if(!location||hops===5)throw Error('更新重定向无效或次数过多');url=new URL(location,target).href
  }
  throw Error('更新重定向次数过多')
}
const direct = async (url: string) => secureUpdateFetch(url, { signal: AbortSignal.timeout(10_000), headers: { 'User-Agent': 'ZeroDistance', Accept: 'application/vnd.github+json' } })
class NoNewerNativeRelease extends Error {}
async function feed(url: string, fetcher=direct): Promise<SignedNativeUpdate> { const envelope = JSON.parse(await readBounded(await fetcher(url), 256_000)); verifyNativeFeed(envelope); return envelope }
export async function obtainNativeFeed(settings: {updateSource?:string;updateMirrorUrl?:string},fetcher=direct): Promise<SignedNativeUpdate> {
  const errors: string[] = []
  if (settings.updateSource !== 'mirror') {
    try {
      const releases = JSON.parse(await readBounded(await fetcher(`https://api.github.com/repos/${trust.repository}/releases?per_page=20`), 1_000_000))
      const available = releases.filter((r: any) => !r.draft && /^v\d+\.\d+\.\d+$/.test(r.tag_name) && r.assets?.some((a: any) => a.name === 'ZeroDistance-update.json')).sort((a: any, b: any) => compareSemver(b.tag_name.slice(1), a.tag_name.slice(1)))
      if (available.length) return await feed(`https://github.com/${trust.repository}/releases/download/${available[0].tag_name}/ZeroDistance-update.json`,fetcher)
      if(releases.filter((r:any)=>!r.draft&&/^v\d+\.\d+\.\d+$/.test(r.tag_name)).every((r:any)=>compareSemver(r.tag_name.slice(1),config.version)<=0))throw new NoNewerNativeRelease()
    } catch (e) { if(e instanceof NoNewerNativeRelease)throw e;errors.push(String(e)) }
  }
  const raw = `https://raw.githubusercontent.com/${trust.repository}/main/${trust.feedPath}`
  for (const url of nativeUpdateSources(raw, settings)) try { return await feed(url,fetcher) } catch (e) { errors.push(String(e)) }
  throw Error('GitHub 与备用更新镜像均不可用：' + errors.at(-1))
}
export async function checkNativeUpdate(force = false): Promise<UpdateCheckResult> {
  try {
    if (!checked) try { const cache = readJson(path.join(directory(), 'checked.json')); verifyNativeFeed(cache.envelope); checked = cache } catch {}
    const cacheFresh=!force && checked && Date.now()-checked.time>=0 && Date.now()-checked.time<6*3600_000
    const envelope = cacheFresh ? checked!.envelope : await obtainNativeFeed(getSettings())
    const payload = verifyNativeFeed(envelope); current = { envelope, payload }; if(!cacheFresh){checked = { time: Date.now(), envelope };atomic(path.join(directory(), 'checked.json'), checked)}
    return { ok: true, hasUpdate: compareSemver(payload.version, config.version) > 0, release: nativeRelease(payload) }
  } catch (error) { if(error instanceof NoNewerNativeRelease)return{ok:true,hasUpdate:false};console.warn('更新检查失败', error); return { ok: false, hasUpdate: false, reason: String(error) } }
}
export function pendingNativeUpdate(): { release: ReleaseInfo; file: string } | null {
  try { const ready = readJson(pendingPath()) as Ready; const p = verifyNativeFeed(ready.envelope); const file = plain(path.join(directory(), p.version, p.asset.name)); if (compareSemver(p.version,config.version)<=0||ready.file !== file || !fs.existsSync(file)) return null; return { release: nativeRelease(p), file } } catch { return null }
}
function downloadNative(release: ReleaseInfo): { taskId: string; done: Promise<void> } {
  if (downloading) { if (downloading.version === release.version) return downloading; throw Error('已有更新下载正在进行') }
  if (!current || current.payload.version !== release.version || !Object.entries(nativeRelease(current.payload)).every(([key,value])=>(release as any)[key]===value)) throw Error('请重新检查可信更新来源')
  if(compareSemver(current.payload.version,config.version)<=0)throw Error('拒绝安装旧版或重复版本的更新')
  const { envelope, payload } = current, file = plain(path.join(directory(), payload.version, payload.asset.name)),part=file+'.'+crypto.randomUUID()+'.part',task = registerTask('更新 ZeroDistance v' + payload.version, 'download')
  const done = (async () => {
    let lastError: unknown,received=0,hash=crypto.createHash('sha256'),initialized=false
    const signal=AbortSignal.any([task.controller.signal,AbortSignal.timeout(15*60_000)])
    const reset=()=>{received=0;hash=crypto.createHash('sha256');if(initialized){plain(part);const fd=fs.openSync(part,'r+');try{fs.ftruncateSync(fd,0)}finally{fs.closeSync(fd)}}}
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      for (const url of nativeUpdateSources(payload.asset.url, getSettings())) {
        for(let attempt=0;attempt<4;attempt++){
          signal.throwIfAborted();let fd: number | undefined, reader: ReadableStreamDefaultReader<Uint8Array> | undefined,response:Response|undefined,streamBroken=false,invalid=false
          try {
            const from=received,headers:Record<string,string>={'Accept-Encoding':'identity'};if(from>0)headers.Range='bytes='+from+'-'
            response = await secureUpdateFetch(url, { signal,headers,bodyTimeoutMs:120_000 })
            if (!response.ok || !response.body) throw Error('HTTP ' + response.status)
            const encoding=response.headers.get('content-encoding');if(encoding&&encoding.toLowerCase()!=='identity'){invalid=true;throw Error('更新包的传输编码不支持续传')}
            if(from>0&&response.status===206){const range=/^bytes (\d+)-(\d+)\/(\d+)$/i.exec(response.headers.get('content-range')||'');if(!range||Number(range[1])!==from||Number(range[2])!==payload.asset.size-1||Number(range[3])!==payload.asset.size){invalid=true;throw Error('更新包续传范围无效')}}
            else if(response.status===200){if(from>0)reset()}
            else{invalid=true;throw Error('更新包响应范围无效')}
            let lastEvent=0;const start=Date.now(),startBytes=received;plain(part);fd=fs.openSync(part,initialized?'r+':'wx');initialized=true
            if(fs.fstatSync(fd).size!==received){fs.closeSync(fd);fd=undefined;reset();throw Error('下载临时文件发生变化')}
            reader=response.body.getReader()
            for (;;) {
              await waitIfTaskPaused(task.controller.signal);let step:ReadableStreamReadResult<Uint8Array>;try{step=await reader.read()}catch(error){streamBroken=true;throw error}if(step.done)break
              if(received+step.value.length>payload.asset.size){invalid=true;throw Error('更新包大小超过签名清单')}
              for(let offset=0;offset<step.value.length;){const written=fs.writeSync(fd,step.value,offset,step.value.length-offset,received+offset);if(written<=0)throw Error('更新包写入失败');offset+=written}
              received+=step.value.length;hash.update(step.value)
              if (Date.now() - lastEvent > 150) { lastEvent = Date.now(); mainWindow.webContents.send('event:progress', { taskId: task.id, stage: 'launcher-update', progress: received / payload.asset.size, bytesDone: received, bytesTotal: payload.asset.size, speed: (received-startBytes)*1000/Math.max(1,Date.now()-start), text: '更新 ZeroDistance v' + payload.version }) }
            }
            fs.closeSync(fd);fd=undefined
            if(received<payload.asset.size){streamBroken=true;throw Error('更新包传输中断')}
            if(hash.copy().digest('hex')!==payload.asset.sha256){invalid=true;throw Error('更新包 SHA-256 与签名清单不符')}
            signal.throwIfAborted();plain(file);fs.renameSync(part,file);initialized=false;atomic(pendingPath(),{envelope,file})
            mainWindow.webContents.send('event:taskDone',{taskId:task.id,ok:true});mainWindow.webContents.send('event:updateReady',{version:payload.version});return
          }catch(error){
            lastError=error;if(fd!==undefined){fs.closeSync(fd);fd=undefined}if(invalid)reset();if(signal.aborted)throw error
            if(streamBroken&&received>0&&received<payload.asset.size&&attempt<3)continue
            break
          }finally{if(fd!==undefined)fs.closeSync(fd);if(reader)await reader.cancel().catch(()=>{});else await response?.body?.cancel().catch(()=>{})}
          }
      }
      throw lastError || Error('更新下载失败')
    } catch (error) { mainWindow.webContents.send('event:taskDone', { taskId: task.id, ok: false, error: String(error), cancelled: task.controller.signal.aborted }); throw error }
    finally { fs.rmSync(part,{force:true});finishTask(task.id); downloading = undefined }
  })()
  downloading = { version: payload.version, taskId: task.id, done }; void done.catch(() => {}); return downloading
}
export function registerNativeUpdates(): void {
  const replace = (channel: string, fn: (...args: any[]) => any) => { ipcMain.handlers.set(channel, (_e: unknown, ...args: unknown[]) => fn(...args)) }
  replace('update:check', checkNativeUpdate); replace('update:start', (release: ReleaseInfo, mode: string) => { if (mode === 'rollback') throw Error('历史版本请从 GitHub Releases 手动下载安装'); return { taskId: downloadNative(release).taskId } })
  replace('update:getPending', pendingNativeUpdate)
  replace('update:apply', () => { if (!pendingNativeUpdate()) throw Error('没有已校验的待安装更新') })
  replace('update:applyPending', () => !!pendingNativeUpdate())
  replace('update:getState', () => null); replace('update:listReleases', () => [])
  for (const channel of ['update:restoreBackup', 'update:applyLocal', 'update:pickLocalFile']) replace(channel, () => { throw Error('请从 GitHub Releases 获取对应版本；不接受未签名的本地替换包') })
  ipcMain.once('boot:renderer-ready', () => { if (config.qa&&!config.qaAutoUpdate) return; void checkNativeUpdate().then(result => { if (suspended||!result.ok || !result.hasUpdate || !result.release || (getSettings().skipUpdateVersion && compareSemver(getSettings().skipUpdateVersion!, result.release.version) >= 0)) return; if (getSettings().autoUpdate) downloadNative(result.release); else mainWindow.webContents.send('event:updatePrompt', result.release) }).catch(error => console.warn('自动更新未完成', error)) })
}
