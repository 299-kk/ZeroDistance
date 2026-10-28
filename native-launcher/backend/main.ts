import { app, config, output, receiveNative, ipcMain, ipcEvent, mainWindow, releaseNativeImages } from './electron'
import readline from 'node:readline'
import fs from 'node:fs'
import path from 'node:path'
import util from 'node:util'
import { registerIpc } from '../../src/main/ipc'
import { initializeLauncherLog, flushLauncherLog, launcherLogError } from '../../src/main/core/launcherLog'
import { getSettings, migrateLegacyAppearanceAssets } from '../../src/main/core/settings'
import { discoverGameFolders } from '../../src/main/core/gameFolders'
import { authorizeManagedImage } from '../../src/main/core/appearanceAssets'
import { authorizeInstanceIcon } from '../../src/main/core/instanceIcons'
import { stopDirectHost,hasActiveDirectServices } from '../../src/main/core/directConnect'
import { stopVoxlinkOnQuit,hasActiveVoxlinkServices } from '../../src/main/core/voxlink'
import { stopTerracottaOnQuit,hasActiveTerracottaServices } from '../../src/main/core/terracotta'
import { frpManager } from '../../src/main/core/frpService'
import { listPlugins, readPluginCode } from '../../src/main/core/plugins'
import { closeHttpClient } from '../../src/main/core/httpClient'
import { applyNativeAppearance } from '../../src/main/nativeAppearance'
import { releaseProjectionRegistry } from '../../src/main/core/projectionRegistry'
import { releaseSkinProfileMemory } from '../../src/main/core/skins'
import { registerNativeUpdates,suspendNativeUpdates,stopNativeUpdates } from './updater'
import { activeTaskCount } from '../../src/main/core/tasks'
import net from 'node:net'

// stdout is a private framed JSON transport. Diagnostics never share it.
for(const level of ['log','info','warn','error','debug'] as const)console[level]=(...args)=>process.stderr.write(util.format(...args)+'\n')
let stopping=false
let lowMemory=false,qaEcho:net.Server|undefined
function coreActive(){return !!qaEcho||hasActiveDirectServices()||hasActiveVoxlinkServices()||hasActiveTerracottaServices()||frpManager.list().tunnels.some(t=>t.desired||t.busy||!!t.pid)}
async function shutdown(){
  if(stopping)return;stopping=true
  await Promise.race([Promise.allSettled([stopNativeUpdates(),stopDirectHost(),stopVoxlinkOnQuit(),stopTerracottaOnQuit(),frpManager.shutdown()]),new Promise(resolve=>setTimeout(resolve,5000))])
  await flushLauncherLog().catch(()=>{})
  void closeHttpClient();process.exit(0) // Games are detached; never kill their process tree.
}
const lines=readline.createInterface({input:process.stdin,crlfDelay:Infinity})
lines.on('close',()=>void shutdown())
lines.on('line',line=>{
  if(line.length>144*1024*1024)return
  let message:any;try{message=JSON.parse(line)}catch{return}
  if(message.nativeResult){receiveNative(message);return}
  if(message.control==='shutdown'){void shutdown();return}
  if(message.control==='idle'){releaseNativeImages();releaseSkinProfileMemory();releaseProjectionRegistry();(globalThis as any).gc?.();return}
  void (async()=>{
    try{
      if(lowMemory&&!String(message.channel).startsWith('__native:'))throw Error('低占用模式中仅保留核心服务，请先恢复主界面')
      const event=ipcEvent(),args=Array.isArray(message.args)?message.args:[]
      if(message.send){ipcMain.emit(message.channel,event,...args);return}
      let result:unknown
      if(message.channel==='__native:lowMemory'){
        if(activeTaskCount())result={ready:false,reason:'仍有下载、安装或文件任务，请等待完成后再进入低占用模式'}
        else{const keepCore=coreActive();lowMemory=true;suspendNativeUpdates(true);releaseNativeImages();releaseProjectionRegistry();releaseSkinProfileMemory();result={ready:true,keepCore}}
      }else if(message.channel==='__native:resumeFull'){lowMemory=false;suspendNativeUpdates(false);result={ok:true}}
      else if(message.channel==='__native:qaCore'&&config.qa){if(!qaEcho){qaEcho=net.createServer(socket=>socket.pipe(socket));await new Promise<void>(resolve=>qaEcho!.listen(0,'127.0.0.1',resolve))}result={port:(qaEcho.address() as net.AddressInfo).port}}
      else if(message.channel==='__native:channels')result=[...ipcMain.handlers.keys()]
      else if(message.channel==='__native:asset'){
        const candidate=String(args[0]||''),roots=getSettings().folders.map(f=>f.path)
        const authorized=authorizeManagedImage(candidate,roots)||authorizeInstanceIcon(candidate,roots)
        if(!authorized)throw Error('图片未获授权')
        if(fs.statSync(authorized).size>32*1024*1024)throw Error('图片过大')
        // Transfer only the authorized path. The host streams the bytes to WebView2.
        result={file:authorized,type:'image/'+(path.extname(authorized).slice(1).replace('jpg','jpeg'))}
      }else if(message.channel==='__native:plugin'){
        const id=String(args[0]||'');if(!listPlugins().some(p=>p.id===id&&p.enabled))throw Error('插件未启用')
        result={data:Buffer.from(readPluginCode(id)).toString('base64'),type:'text/javascript; charset=utf-8'}
      }else{
        const handler=ipcMain.handlers.get(message.channel);if(!handler)throw Error('未知功能通道：'+message.channel)
        result=await handler(event,...args)
      }
      output({id:message.id,result:result??null})
    }catch(error){output({id:message.id,error:error instanceof Error?error.message:String(error)})}
  })()
})
async function start(){
  initializeLauncherLog()
  await migrateLegacyAppearanceAssets()
  registerIpc(()=>mainWindow as any)
  // Render known instances immediately; bounded disk discovery refreshes the
  // existing page afterwards rather than holding every launch for a full scan.
  ipcMain.once('boot:renderer-ready',()=>{
    if(config.noDiscovery)return
    setImmediate(()=>void discoverGameFolders().then(result=>{
      if(result.added.length)mainWindow.webContents.send('folders:discovered',{added:result.added})
    }).catch(error=>launcherLogError('folders','后台发现游戏目录失败',error)))
  })
  applyNativeAppearance(mainWindow as any,getSettings())
  registerNativeUpdates()
  output({ready:true,channels:ipcMain.handlers.size})
  mainWindow.webContents.emit('did-finish-load')
  void frpManager.restore().catch(error=>launcherLogError('frp','恢复隧道失败',error))
}
process.on('uncaughtException',error=>{console.error(error);try{launcherLogError('native','后端异常',error)}catch{}})
process.on('unhandledRejection',error=>{console.error(error);try{launcherLogError('native','后端异步异常',error)}catch{}})
start().catch(error=>{console.error(error);output({fatal:error.message});process.exitCode=1})
