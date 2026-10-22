import { app, config, output, receiveNative, ipcMain, ipcEvent, mainWindow } from './electron'
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
import { stopDirectHost } from '../../src/main/core/directConnect'
import { stopVoxlinkOnQuit } from '../../src/main/core/voxlink'
import { stopTerracottaOnQuit } from '../../src/main/core/terracotta'
import { frpManager } from '../../src/main/core/frpService'
import { listPlugins, readPluginCode } from '../../src/main/core/plugins'
import { closeHttpClient } from '../../src/main/core/httpClient'
import { applyNativeAppearance } from '../../src/main/nativeAppearance'

// stdout is a private framed JSON transport. Diagnostics never share it.
for(const level of ['log','info','warn','error','debug'] as const)console[level]=(...args)=>process.stderr.write(util.format(...args)+'\n')
let stopping=false
async function shutdown(){
  if(stopping)return;stopping=true
  await Promise.race([Promise.allSettled([stopDirectHost(),stopVoxlinkOnQuit(),stopTerracottaOnQuit(),frpManager.shutdown()]),new Promise(resolve=>setTimeout(resolve,5000))])
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
  void (async()=>{
    try{
      const event=ipcEvent(),args=Array.isArray(message.args)?message.args:[]
      if(message.send){ipcMain.emit(message.channel,event,...args);return}
      let result:unknown
      if(message.channel==='__native:channels')result=[...ipcMain.handlers.keys()]
      else if(message.channel==='__native:asset'){
        const candidate=String(args[0]||''),roots=getSettings().folders.map(f=>f.path)
        const authorized=authorizeManagedImage(candidate,roots)||authorizeInstanceIcon(candidate,roots)
        if(!authorized)throw Error('图片未获授权')
        if(fs.statSync(authorized).size>32*1024*1024)throw Error('图片过大')
        result={data:fs.readFileSync(authorized).toString('base64'),type:'image/'+(path.extname(authorized).slice(1).replace('jpg','jpeg'))}
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
  // The Electron updater packages cannot replace a native build. Keep the UI and return an explicit result.
  const updater=['update:apply','update:start','update:applyLocal','update:applyPending','update:restoreBackup','update:pickLocalFile']
  for(const channel of updater)if(ipcMain.handlers.has(channel))ipcMain.handlers.set(channel,()=>{throw Error('请使用 ZeroDistance 安装程序更新，暂不支持 Electron 更新包')})
  for(const channel of ['update:check'])if(ipcMain.handlers.has(channel))ipcMain.handlers.set(channel,()=>({ok:false,error:'当前版本暂不支持自动更新，请使用 ZeroDistance 安装程序。'}))
  output({ready:true,channels:ipcMain.handlers.size})
  mainWindow.webContents.emit('did-finish-load')
  void frpManager.restore().catch(error=>launcherLogError('frp','恢复隧道失败',error))
}
process.on('uncaughtException',error=>{console.error(error);try{launcherLogError('native','后端异常',error)}catch{}})
process.on('unhandledRejection',error=>{console.error(error);try{launcherLogError('native','后端异步异常',error)}catch{}})
start().catch(error=>{console.error(error);output({fatal:error.message});process.exitCode=1})
