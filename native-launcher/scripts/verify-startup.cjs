const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),net=require('node:net'),{spawn,execFileSync}=require('node:child_process'),Zip=require('adm-zip')
let pw;try{pw=require('playwright')}catch{pw=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))}
const root=path.resolve(__dirname,'../..'),qa=path.join(root,'.qa/startup-regression',crypto.randomUUID()),data=path.join(qa,'profile'),current=path.join(root,'native-launcher/out/ZeroDistance.exe'),oldDir=path.join(qa,'previous'),delay=ms=>new Promise(r=>setTimeout(r,ms)),runs=[],report={qa,passed:[]}
async function until(check,label,timeout=30000){const end=Date.now()+timeout;while(Date.now()<end){const value=await check();if(value)return value;await delay(30)}throw Error('Timeout: '+label)}
async function launch(exe,full=false){
 const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r))
 const child=spawn(exe,['--qa','--data-dir',data,'--cdp-port',String(port),...(full?['--qa-full-startup-motion']:[])],{windowsHide:true,stdio:'ignore'}),run={child};runs.push(run)
 await until(async()=>{assert.equal(child.exitCode,null);try{return(await fetch('http://127.0.0.1:'+port+'/json/version')).ok}catch{return false}},'CDP')
 run.browser=await pw.chromium.connectOverCDP('http://127.0.0.1:'+port);run.page=await until(()=>run.browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().endsWith('/index.html')),'home document')
 await run.page.locator('.zd-hero').waitFor({timeout:30000});await until(()=>run.page.evaluate(()=>window.kamucl.invoke('window:visibility')),'usable main window');await delay(250);return run
}
async function stop(run){await run.page.evaluate(()=>window.kamucl.send('window:close'));try{await until(()=>run.child.exitCode!==null,'normal exit',15000)}catch(error){await run.page.screenshot({path:path.join(qa,'failed-close.png'),timeout:5000});report.failedPage=await run.page.locator('body').innerText();throw error}assert.equal(run.child.exitCode,0);try{await run.browser.close()}catch{}}
function passed(message){report.passed.push(message);console.log('PASS '+message)}
async function main(){
 fs.mkdirSync(data,{recursive:true});const source=JSON.parse(fs.readFileSync(path.join(root,'.qa/player-behavior-current.json')))
 for(const file of ['settings.json','accounts.json','consent.json'])fs.copyFileSync(path.join(source.profile,file),path.join(data,file))
 const game=path.join(qa,'game'),version=path.join(game,'versions/26.3');fs.mkdirSync(version,{recursive:true});fs.writeFileSync(path.join(version,'26.3.json'),JSON.stringify({id:'26.3',_mcVersion:'26.3',mainClass:'net.minecraft.client.main.Main',libraries:[]}));fs.writeFileSync(path.join(version,'26.3.jar'),Buffer.alloc(4096,1));fs.copyFileSync(source.skin,path.join(version,'icon.png'))
 const settings=JSON.parse(fs.readFileSync(path.join(data,'settings.json')));Object.assign(settings,{folders:[{path:game,name:'启动迁移测试',isDefault:true}],gameDir:game,activeFolder:game});fs.writeFileSync(path.join(data,'settings.json'),JSON.stringify(settings))
 const archive=new Zip(path.join(root,'native-launcher/release/ZeroDistance-0.3.0-native.3-windows-x64.zip'));archive.extractAllTo(oldDir)
 const legacy=await launch(path.join(oldDir,'ZeroDistance.exe'));assert.equal(new URL(legacy.page.url()).hostname,'zerodistance-native.local')
 const seed={'kamucl.bannerAlign':'center','kamucl.lastPlayed':'{"26.3":1234567890123}','kamucl.resourceExpanded':'true','zerodistance.gallery.migration-test':'{"key":"fixture","remainingMs":3200}','qa.unrelated':'do not migrate'}
 await legacy.page.evaluate(entries=>{for(const[k,v]of Object.entries(entries))localStorage.setItem(k,v)},seed);await stop(legacy)
 const migrated=await launch(current);assert.equal(new URL(migrated.page.url()).hostname,'zerodistance-native.test')
 assert.equal((await migrated.page.evaluate(()=>window.kamucl.invoke('settings:get'))).theme,settings.theme)
 const values=await migrated.page.evaluate(keys=>Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)])),Object.keys(seed))
 for(const[k,v]of Object.entries(seed))assert.equal(values[k],k==='qa.unrelated'?null:v,k)
 assert.equal(JSON.parse(fs.readFileSync(path.join(data,'ui-origin-v2.json'))).version,2)
 const initial=JSON.parse(fs.readFileSync(path.join(data,'startup-window.json'))),info=await migrated.page.evaluate(()=>window.kamucl.invoke('native:info'))
 assert.equal(initial.opacity,0);assert(initial.layered);assert.equal(info.windowHandle,initial.handle);assert.equal(info.windowOpacity,1);assert.equal(info.layered,false)
 await migrated.page.waitForFunction(()=>{const images=Array.from(document.images).filter(i=>i.src.includes('zerodistance-assets.local'));return images.length>0&&images.every(i=>i.complete&&i.naturalWidth>0)})
 assert.equal(await migrated.page.evaluate(()=>window.kamucl.invoke('__native:asset','C:\\Windows\\win.ini').then(()=>false,()=>true)),true)
 await migrated.page.screenshot({path:path.join(qa,'migrated-home.png')});report.firstUpgradeStages=JSON.parse(fs.readFileSync(path.join(data,'startup-performance.json')))
 passed('Previous UI preferences migrate before Vue initializes; unrelated keys are excluded and authorized images still load')
 passed('Initial native window is fully transparent; reveal retains its HWND, restores opacity and removes the layered warmup style')
 await migrated.page.evaluate(()=>localStorage.setItem('kamucl.bannerAlign','start'));await stop(migrated)
 // Simulate an interrupted migration marker without deleting either origin's preferences.
 fs.unlinkSync(path.join(data,'ui-origin-v2.json'))
 const retry=await launch(current);assert.equal(await retry.page.evaluate(()=>localStorage.getItem('kamucl.bannerAlign')),'start');await stop(retry)
 passed('Retry preserves preferences already written under the new origin')
 const full=await launch(current,true),boot=await full.page.evaluate(()=>window.kamucl.invoke('native:info'))
 await until(()=>fs.existsSync(boot.startup.signal+'.finished'),'full animation finish');assert.equal(fs.readFileSync(boot.startup.signal+'.assembled','utf8'),'ready')
 const frames=fs.readFileSync(boot.startup.signal+'.frames','utf8').trim().split(/\r?\n/).map(Number);assert(frames.length>=5)
 report.fullAnimation={frames:frames.length,stages:JSON.parse(fs.readFileSync(path.join(data,'startup-performance.json')))};assert(!('uiStorageMigrated'in report.fullAnimation.stages))
 passed('Subsequent startup skips migration; forced full-animation QA path renders frames even when system motion is disabled')
 await full.page.locator('[data-nav=settings]').click();await full.page.getByRole('button',{name:'外观',exact:true}).click()
 const toggle=full.page.getByRole('checkbox',{name:'关闭启动动画',exact:true});assert.equal(await toggle.isChecked(),false);await toggle.check()
 await until(()=>JSON.parse(fs.readFileSync(path.join(data,'settings.json'))).disableStartupAnimation===true,'startup switch saved')
 await full.page.screenshot({path:path.join(qa,'startup-animation-setting.png')});await stop(full)
 const signals=()=>fs.readdirSync(data).filter(f=>/^startup-.*\.control$/.test(f)).length,before=signals()
 const disabled=await launch(current,true),disabledInfo=await disabled.page.evaluate(()=>window.kamucl.invoke('native:info'))
 assert.equal(disabledInfo.startup,null);assert.equal(signals(),before);assert.equal(disabledInfo.windowOpacity,1);assert.equal(disabledInfo.layered,false)
 report.disabledAnimation={stages:JSON.parse(fs.readFileSync(path.join(data,'startup-performance.json'))),createsHelper:false}
 await disabled.page.locator('[data-nav=settings]').click();await disabled.page.getByRole('button',{name:'外观',exact:true}).click()
 const persisted=disabled.page.getByRole('checkbox',{name:'关闭启动动画',exact:true});assert.equal(await persisted.isChecked(),true);await persisted.uncheck()
 await until(()=>JSON.parse(fs.readFileSync(path.join(data,'settings.json'))).disableStartupAnimation===false,'startup switch restored');await stop(disabled)
 const restored=await launch(current,true);assert((await restored.page.evaluate(()=>window.kamucl.invoke('native:info'))).startup);await stop(restored)
 passed('Startup switch persists through the actual UI: disabled launches create no overlay helper and reveal directly; re-enabling restores the animation')
 assert(!fs.existsSync(path.join(data,'native-unhandled.log')));report.ok=true
}
main().catch(error=>{report.error=error.stack;console.error(error);process.exitCode=1}).finally(async()=>{
 for(const run of runs)if(run.child.exitCode===null){try{execFileSync('taskkill.exe',['/PID',String(run.child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'})}catch{}}
 fs.writeFileSync(path.join(qa,'RESULT.json'),JSON.stringify(report,null,2));console.log('Report '+path.join(qa,'RESULT.json'))
})
