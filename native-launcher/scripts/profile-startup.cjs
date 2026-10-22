// Measures owned QA processes only; no input injection or foreground manipulation.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{spawn,execFileSync}=require('node:child_process')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'.qa/startup-speed'),stateFile=path.join(folder,'current.json'),label=process.argv[2]||'current',trace=process.argv.includes('--trace'),delay=ms=>new Promise(r=>setTimeout(r,ms))
fs.mkdirSync(folder,{recursive:true})
let state
if(fs.existsSync(stateFile))state=JSON.parse(fs.readFileSync(stateFile))
else{
 const source=JSON.parse(fs.readFileSync(path.join(root,'.qa/player-behavior-current.json'))),qa=path.join(folder,crypto.randomUUID()),data=path.join(qa,'profile');fs.mkdirSync(data,{recursive:true})
 for(const file of ['settings.json','accounts.json','consent.json'])fs.copyFileSync(path.join(source.profile,file),path.join(data,file))
 state={qa,data};fs.writeFileSync(stateFile,JSON.stringify(state,null,2))
}
assert(path.resolve(state.data).startsWith(folder+path.sep))
async function until(check,description,timeout=30000){const end=Date.now()+timeout;while(Date.now()<end){const value=await check();if(value)return value;await delay(10)}throw Error('Timeout: '+description)}
async function run(){
 const exe=path.join(root,'native-launcher/out/ZeroDistance.exe'),report={label,trace,qa:state.qa,runs:[]}
 for(let trial=0;trial<(trace?1:4);trial++){
  const before=new Set(fs.readdirSync(state.data)),start=Date.now(),child=spawn(exe,['--qa',...(trace?[]:['--qa-ordinary-browser']),...(process.argv.includes('--full-motion')?['--qa-full-startup-motion']:[]),'--data-dir',state.data,'--cdp-port','45981'],{windowsHide:true,stdio:'ignore'});let browser,page
  try{
   if(trace){
    await until(async()=>{try{return(await fetch('http://127.0.0.1:45981/json/version')).ok}catch{return false}},'CDP')
    let pw;try{pw=require('playwright')}catch{pw=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))}
    browser=await pw.chromium.connectOverCDP('http://127.0.0.1:45981');page=await until(()=>browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().endsWith('/index.html')),'production page')
   }
   const signal=await until(()=>{assert.equal(child.exitCode,null);return fs.readdirSync(state.data).find(n=>!before.has(n)&&/^startup-.*\.control\.finished$/.test(n))},'visible startup and usable renderer')
   const base=path.join(state.data,signal.replace(/\.finished$/,'')),timing={trial,visibleMs:Math.round(fs.statSync(base+'.visible').mtimeMs-start),mainMs:Math.round(fs.statSync(base+'.assembled').mtimeMs-start),finishedMs:Math.round(fs.statSync(base+'.finished').mtimeMs-start),stages:JSON.parse(fs.readFileSync(path.join(state.data,'startup-performance.json')))}
   timing.initialWindow=JSON.parse(fs.readFileSync(path.join(state.data,'startup-window.json')));assert.equal(timing.initialWindow.opacity,0);assert.equal(timing.initialWindow.showInTaskbar,true);assert.equal(timing.initialWindow.layered,true)
   report.runs.push(timing);console.log(JSON.stringify(timing))
   if(trace){
    report.navigation=await page.evaluate(()=>({navigation:performance.getEntriesByType('navigation').map(e=>e.toJSON()),resources:performance.getEntriesByType('resource').map(e=>({name:e.name,duration:e.duration,start:e.startTime,responseStart:e.responseStart,responseEnd:e.responseEnd,transferSize:e.transferSize})).sort((a,b)=>b.duration-a.duration)}))
    const cdp=await page.context().newCDPSession(page)
    await cdp.send('Profiler.enable');await cdp.send('Profiler.start');await page.reload({waitUntil:'networkidle'});await delay(150);const {profile}=await cdp.send('Profiler.stop');fs.writeFileSync(path.join(state.qa,label+'.cpuprofile'),JSON.stringify(profile))
    const nodes=new Map(profile.nodes.map(n=>[n.id,n.callFrame])),totals=new Map();for(let i=0;i<(profile.samples||[]).length;i++){const id=profile.samples[i];totals.set(id,(totals.get(id)||0)+(profile.timeDeltas[i]||0))}report.cpu=Array.from(totals,([id,micros])=>({...nodes.get(id),ms:micros/1000})).sort((a,b)=>b.ms-a.ms).slice(0,25)
    await page.evaluate(()=>window.kamucl.send('window:close'));await until(()=>child.exitCode!==null,'normal shutdown',12000)
   }
  }finally{
   if(child.exitCode===null)try{execFileSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore',timeout:12000})}catch{}
   if(browser)try{await browser.close()}catch{}
   await delay(150)
  }
 }
 const warm=report.runs.slice(trace?0:1);report.medianMainMs=warm.map(x=>x.mainMs).sort((a,b)=>a-b)[Math.floor(warm.length/2)];report.medianVisibleMs=warm.map(x=>x.visibleMs).sort((a,b)=>a-b)[Math.floor(warm.length/2)]
 fs.writeFileSync(path.join(state.qa,label+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({label,medianVisibleMs:report.medianVisibleMs,medianMainMs:report.medianMainMs,report:path.join(state.qa,label+'.json')}))
}
run().catch(error=>{console.error(error);process.exitCode=1})
