/* Native transport only. The original renderer, styles and IPC names are reused. */
(() => {
  'use strict';
  const native = window.chrome.webview, pending = new Map(), subscriptions = new Map(), paths = new WeakMap();
  let sequence = 0;
  const invoke = (channel, ...args) => new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, {resolve, reject});
    try { native.postMessage(JSON.stringify({id, channel, args})); } catch(e) { pending.delete(id); reject(e); }
  });
  const on = (channel, callback) => {
    if(!subscriptions.has(channel)) subscriptions.set(channel,new Set());
    subscriptions.get(channel).add(callback);
    return () => subscriptions.get(channel)?.delete(callback);
  };
  native.addEventListener('message', event => {
    const message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    if(message.event==='window:prepareLowMemory')setTimeout(()=>send('window:lowMemoryReady'),0);
    if(message.event) { for(const callback of subscriptions.get(message.event)||[]) { try { callback(...(message.args||[])); } catch(e) { console.error(e); } } return; }
    const request = pending.get(message.id); if(!request) return;
    pending.delete(message.id); message.error ? request.reject(new Error(message.error)) : request.resolve(message.result);
  });
  const send = (channel,...args) => native.postMessage(JSON.stringify({channel,args,send:true}));
  Object.defineProperty(window, 'kamucl', {value:Object.freeze({platform:'win32',invoke,on,send,getFilePath:file=>paths.get(file)||''})});
  Object.defineProperty(window, 'kamuclSplash', {value:Object.freeze({
    ready:()=>send('boot:splash-ready'), assembled:()=>send('boot:assembled'), finished:()=>send('boot:finished'), failed:message=>send('boot:splash-failed',message),
    onPointer:callback=>on('boot:pointer',callback),onState:callback=>on('boot:state',callback),onReveal:callback=>on('boot:reveal',callback)
  })});
  const grant = files => new Promise((resolve,reject)=>{
    const id=++sequence; pending.set(id,{resolve,reject});
    try { native.postMessageWithAdditionalObjects(JSON.stringify({id,channel:'native:filePaths',args:[]}),files); }
    catch(e) { pending.delete(id);reject(e); }
  });
  // WebView2 supplies the actual paths for File objects; do not infer paths from names.
  let replaying=false;
  document.addEventListener('drop',event=>{
    const files=Array.from(event.dataTransfer?.files||[]);
    if(replaying||!files.length||files.every(f=>paths.has(f)))return;
    event.preventDefault();event.stopImmediatePropagation();
    const target=event.target,original=event.dataTransfer,x=event.clientX,y=event.clientY;
    grant(files).then(values=>{
      files.forEach((file,i)=>paths.set(file,values[i]||''));
      const transfer=new DataTransfer();files.forEach(file=>transfer.items.add(file));
      for(const type of original.types)if(type!=='Files')try{transfer.setData(type,original.getData(type));}catch{}
      replaying=true;try{target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer,clientX:x,clientY:y}));}finally{replaying=false;}
    }).catch(error=>console.error('Native file drop failed',error));
  },true);
  document.addEventListener('change',event=>{
    const target=event.target,files=target instanceof HTMLInputElement&&target.type==='file'?Array.from(target.files||[]):[];
    if(replaying||!files.length||files.every(f=>paths.has(f)))return;
    event.stopImmediatePropagation();
    grant(files).then(values=>{files.forEach((file,i)=>paths.set(file,values[i]||''));replaying=true;try{target.dispatchEvent(new Event('change',{bubbles:true}));}finally{replaying=false;}}).catch(console.error);
  },true);
  document.addEventListener('mousedown',event=>{
    if(event.button!==0)return;
    const edge=7,x=event.clientX,y=event.clientY,w=innerWidth,h=innerHeight;
    const hit=y<edge?(x<edge?13:x>w-edge?14:12):y>h-edge?(x<edge?16:x>w-edge?17:15):x<edge?10:x>w-edge?11:0;
    if(hit){send('window:resize',hit);return;}
    for(let element=event.target;element instanceof Element;element=element.parentElement){
      const region=getComputedStyle(element).getPropertyValue('-webkit-app-region')||getComputedStyle(element).getPropertyValue('app-region');
      if(region==='no-drag'||element.matches('button,input,textarea,select,a,[role="button"]'))break;
      if(region==='drag'||element.classList.contains('topbar')){send('window:drag');break;}
    }
  },true);
})();
