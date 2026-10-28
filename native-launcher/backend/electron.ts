/** Transitional desktop compatibility adapter; no Electron runtime is loaded. */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { BoundedCache } from '../../src/shared/boundedCache'

export const config=JSON.parse(process.env.ZERO_DISTANCE_NATIVE_CONFIG||'{}')
const write=(value:unknown)=>process.stdout.write(JSON.stringify(value)+'\n')
const requests=new Map<number,{resolve:(value:any)=>void;reject:(error:Error)=>void}>()
let sequence=0
export function nativeCall(operation:string,args:unknown[]=[]):Promise<any>{
  return new Promise((resolve,reject)=>{const id=++sequence;requests.set(id,{resolve,reject});write({native:id,operation,args})})
}
export function receiveNative(message:any){const request=requests.get(message.nativeResult);if(request){requests.delete(message.nativeResult);message.error?request.reject(new Error(message.error)):request.resolve(message.result)}}
export function output(value:unknown){write(value)}
export function syncNative(operation:string,args:unknown[]):any{
  const result=spawnSync(config.executable,['--native-service'],{input:JSON.stringify({operation,args}),encoding:'utf8',windowsHide:true,timeout:20000,maxBuffer:128*1024*1024})
  if(result.error||result.status!==0)throw result.error||new Error('系统服务失败：'+(result.stderr||'').slice(0,300))
  const reply=JSON.parse(result.stdout);if(reply.error)throw Error(reply.error);return reply.result
}
class Application extends EventEmitter{
  isPackaged=true
  commandLine={hasSwitch:(name:string)=>name==='no-auto-discovery'&&config.noDiscovery,getSwitchValue:()=>'',appendSwitch:()=>{}}
  getPath(name:string){const values:Record<string,string>={...config.paths,userData:config.dataDirectory,temp:os.tmpdir(),exe:config.executable};if(!values[name])throw Error('未知系统目录：'+name);return values[name]}
  setPath(name:string,value:string){config.paths[name]=value}
  setName(){}
  getVersion(){return config.version}
  getAppPath(){return config.appDirectory}
  whenReady(){return Promise.resolve()}
  quit(){void nativeCall('app:quit')}
  exit(code=0){void nativeCall('app:quit',[code])}
  getAppMetrics(){return[]}
}
export const app=new Application()
export const ipcMain=Object.assign(new EventEmitter(),{
  handlers:new Map<string,Function>(),
  handle(channel:string,listener:Function){if(this.handlers.has(channel))throw Error('重复通道：'+channel);this.handlers.set(channel,listener)},
  removeHandler(channel:string){this.handlers.delete(channel)}
})
class Contents extends EventEmitter{
  id=1; mainFrame:any=this
  isDestroyed(){return false}
  send(channel:string,...args:unknown[]){write({event:channel,args})}
  setBackgroundThrottling(){}
  setWindowOpenHandler(){}
  startDrag(options:any){void nativeCall('files:startDrag',[options.files||[options.file]])}
}
const contents=new Contents()
class WindowAdapter extends EventEmitter{
  webContents=contents
  isDestroyed(){return false}
  isVisible(){return true}
  isMinimized(){return false}
  close(){void nativeCall('window:close')}
  minimize(){void nativeCall('window:minimize')}
  focus(){void nativeCall('window:focus')}
  setBackgroundMaterial(material:string){void nativeCall('window:material',[material])}
  setBackgroundColor(){}
  getNativeWindowHandle(){const result=Buffer.alloc(8);result.writeBigUInt64LE(BigInt(config.hwnd||0));return result}
}
export const mainWindow=new WindowAdapter()
export const BrowserWindow={getAllWindows:()=>[mainWindow],fromWebContents:(value:unknown)=>value===contents?mainWindow:null}
export const webContents={getAllWebContents:()=>[contents]}
export function ipcEvent(){return {sender:contents,senderFrame:contents,reply:(channel:string,...args:unknown[])=>contents.send(channel,...args),preventDefault(){}}}
export const safeStorage={
  isEncryptionAvailable:()=>true,
  encryptString:(value:string)=>Buffer.from(syncNative('secret:encrypt',[value]),'base64'),
  decryptString:(value:Buffer)=>syncNative('secret:decrypt',[value.toString('base64')]) as string
}
const options=(args:any[])=>args.length>1?args[1]:args[0]
export const dialog={
  showOpenDialog:(...args:any[])=>nativeCall('dialog:open',[options(args)]),
  showSaveDialog:(...args:any[])=>nativeCall('dialog:save',[options(args)]),
  showMessageBox:(...args:any[])=>nativeCall('dialog:message',[options(args)]),
  showErrorBox:(title:string,content:string)=>void nativeCall('dialog:error',[title,content])
}
export const shell={
  openPath:(file:string)=>nativeCall('shell:openPath',[file]),
  openExternal:(url:string)=>nativeCall('shell:openExternal',[url]),
  showItemInFolder:(file:string)=>void nativeCall('shell:showItem',[file]),
  trashItem:(file:string)=>nativeCall('shell:trash',[file])
}
export const screen={getPrimaryDisplay:()=>config.display,getAllDisplays:()=>[config.display],getDisplayNearestPoint:()=>config.display,getCursorScreenPoint:()=>({x:0,y:0})}
let theme='dark'
export const nativeTheme={get themeSource(){return theme},set themeSource(value:string){theme=value;void nativeCall('window:theme',[value])},get shouldUseDarkColors(){return theme==='dark'}}
export const systemPreferences={accessibilityDisplayShouldReduceTransparency:false}
export const Menu={buildFromTemplate(template:any[]){return {popup(){void nativeCall('menu:popup',[template.map((e,i)=>({label:e.label,type:e.type,enabled:e.enabled,id:i}))]).then(index=>{if(Number.isInteger(index))template[index]?.click?.()})}}}}
export const net={fetch:(...args:Parameters<typeof fetch>)=>fetch(...args)}
export const protocol={handle(){},registerSchemesAsPrivileged(){}}

type ImageValue={width:number;height:number;png:string;bitmap?:string;jpeg?:string;file?:string}
const images=new BoundedCache<string,ImageValue>(8*1024*1024,32,value=>2*((value.png?.length||0)+(value.bitmap?.length||0)+(value.jpeg?.length||0)))
export function releaseNativeImages(){images.clear()}
class NativeImage{
  value:ImageValue
  constructor(value:ImageValue){this.value=value}
  private pixels(){if(this.value.file&&!this.value.png){const file=this.value.file;this.value=syncNative('image:decode',[fs.readFileSync(file).toString('base64')])}return this.value.png||''}
  isEmpty(){return !this.value.width||!this.value.height}
  getSize(){return {width:this.value.width,height:this.value.height}}
  toPNG(){return Buffer.from(this.pixels(),'base64')}
  toDataURL(){return 'data:image/png;base64,'+this.pixels()}
  toBitmap(){return Buffer.from(this.value.bitmap||syncNative('image:convert',[this.pixels(),{bitmap:true}]).bitmap,'base64')}
  toJPEG(quality:number){return Buffer.from(syncNative('image:convert',[this.pixels(),{jpeg:quality}]).jpeg,'base64')}
  resize(options:any){return new NativeImage(syncNative('image:convert',[this.pixels(),options]))}
  crop(rect:any){return new NativeImage(syncNative('image:convert',[this.pixels(),{crop:rect}]))}
}
export const nativeImage={
  createFromBuffer(data:Buffer){
    // The decoder validates the actual image and pixel count before allocating.
    if(data.length>32*1024*1024)return new NativeImage({width:0,height:0,png:''})
    const key=createHash('sha256').update(data).digest('hex')
    let image=images.get(key)
    if(!image){image=syncNative('image:decode',[data.toString('base64')]);images.set(key,image!)}
    return new NativeImage(image!)
  },
  createFromPath(file:string){try{const meta=syncNative('image:inspectFile',[file]);return new NativeImage({...meta,file})}catch{return new NativeImage({width:0,height:0,png:''})}},
  createFromBitmap(data:Buffer,options:any){return new NativeImage(syncNative('image:bitmap',[data.toString('base64'),options]))}
}
