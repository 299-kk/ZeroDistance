const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),net=require('node:net'),assert=require('node:assert/strict'),{spawn,execFileSync}=require('node:child_process')
let pw;try{pw=require('playwright')}catch{pw=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))}
const root=path.resolve(__dirname,'../..'),arg=k=>process.argv[process.argv.indexOf(k)+1],label=process.argv.includes('--label')?arg('--label'):'candidate',exe=path.resolve(process.argv.includes('--exe')?arg('--exe'):path.join(root,'native-launcher/out/ZeroDistance.exe')),qa=path.join(root,'.qa/memory-optimization',label+'-'+crypto.randomUUID()),data=path.join(qa,'profile'),delay=ms=>new Promise(r=>setTimeout(r,ms))
async function until(fn,label){for(let i=0;i<300;i++){if(await fn())return;await delay(100)}throw Error('Timeout: '+label)}
async function run(){
 fs.mkdirSync(data,{recursive:true});const game=path.join(qa,'game');fs.mkdirSync(game)
 fs.writeFileSync(path.join(data,'settings.json'),JSON.stringify({folders:[{path:game,name:'Memory QA',isDefault:true}],gameDir:game,activeFolder:game,gameFolderPolicyVersion:1,autoUpdate:false,disableStartupAnimation:true,reduceMotion:false}))
 fs.writeFileSync(path.join(data,'accounts.json'),JSON.stringify({accounts:[{id:'qa-offline',uuid:'00000000000000000000000000000001',username:'MemoryQA',type:'offline'}],selectedId:'qa-offline'}))
 const skins=path.join(data,'offline-skins');fs.mkdirSync(skins);fs.writeFileSync(path.join(skins,crypto.createHash('sha256').update('qa-offline').digest('hex').slice(0,24)+'.png'),await require('sharp')({create:{width:64,height:64,channels:4,background:{r:166,g:110,b:60,alpha:1}}}).png().toBuffer())
 if(process.argv.includes('--gallery-stress')){
  const dir=path.join(data,'appearance/launch-thumbnails');fs.mkdirSync(dir,{recursive:true});const pictures=[];const sharp=require('sharp');const width=2400,height=1350,raw=Buffer.alloc(width*height*3);
  for(let i=0;i<20;i++){for(let y=0;y<height;y++)for(let x=0;x<width;x++){const o=(y*width+x)*3;raw[o]=(x+y+i*23)%256;raw[o+1]=(x*3+y*2+i*47)%256;raw[o+2]=(x^y^(i*11))%256}const file=path.join(dir,'stress-'+i+'.jpg');await sharp(raw,{raw:{width,height,channels:3}}).jpeg({quality:85}).toFile(file);pictures.push(file)}
  const file=path.join(data,'settings.json'),settings=JSON.parse(fs.readFileSync(file));settings.launchThumbnail={images:pictures,image:pictures[0],order:pictures,disabled:require('../../src/shared/landscape-images.json').map(i=>i.key),intervalSeconds:120};fs.writeFileSync(file,JSON.stringify(settings))
 }
 const notice=fs.readFileSync(path.join(path.dirname(exe),'legal/disclaimer.json'));fs.writeFileSync(path.join(data,'consent.json'),JSON.stringify({version:JSON.parse(notice).version,contentHash:crypto.createHash('sha256').update(notice).digest('hex'),acceptedAt:new Date().toISOString()}))
 const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r))
 const child=spawn(exe,['--qa','--data-dir',data,'--cdp-port',String(port)],{windowsHide:true,stdio:'ignore'}),report={label,exe,qa,pid:child.pid,samples:[],ok:false};let browser
 try{
  await until(async()=>{assert.equal(child.exitCode,null);try{return(await fetch('http://127.0.0.1:'+port+'/json/version')).ok}catch{return false}},'CDP')
  browser=await pw.chromium.connectOverCDP('http://127.0.0.1:'+port);let page;await until(()=>{page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().endsWith('/index.html'));return page},'main page');await page.locator('.zd-hero').waitFor();await page.waitForFunction(()=>document.querySelector('.zd-hero')&&window.kamucl)
  const session=await page.context().newCDPSession(page)
  const sample=async(stage)=>{const rows=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'memory-processes.ps1'),'-RootId',String(child.pid)],{encoding:'utf8',windowsHide:true}));const heap=await session.send('Runtime.getHeapUsage');report.samples.push({stage,workingBytes:rows.reduce((n,p)=>n+p.workingBytes,0),privateBytes:rows.reduce((n,p)=>n+p.privateBytes,0),jsUsedBytes:heap.usedSize,jsTotalBytes:heap.totalSize,processes:rows});console.log(stage,Math.round(report.samples.at(-1).privateBytes/1048576)+' MiB private',Math.round(report.samples.at(-1).workingBytes/1048576)+' MiB working')}
  await delay(8000);for(let i=0;i<3;i++){await sample('home-'+i);await delay(1000)}
  await page.locator('[data-nav=resources]').click()
  for(let cycle=0;cycle<3;cycle++){
   await page.locator('[data-nav=skins]').click();await page.locator('.viewer3d canvas').waitFor({timeout:30000});await delay(1500)
   await page.locator('[data-nav=settings]').click();await page.locator('.settings-categories').waitFor();await delay(1200)
   await page.locator('[data-nav=home]').click();await page.locator('.zd-hero').waitFor();await delay(1500);await sample('return-home-'+cycle)
  }
  await page.screenshot({path:path.join(qa,'home.png')});await page.evaluate(()=>window.kamucl.send('window:minimize'));await delay(12000)
  for(let i=0;i<3;i++){await sample('minimized-'+i);await delay(1000)}
  await page.evaluate(()=>window.kamucl.invoke('native:qaFocus'));await page.locator('.zd-hero').waitFor();await delay(1500);await sample('restored');assert(await page.evaluate(()=>window.kamucl.invoke('window:visibility')))
  await page.evaluate(()=>window.kamucl.send('window:close'));await browser.close();browser=null;await until(()=>child.exitCode!==null,'exit');assert.equal(child.exitCode,0);report.ok=true
 }finally{if(browser)await browser.close().catch(()=>{});if(child.exitCode===null)try{execFileSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'})}catch{}fs.writeFileSync(path.join(qa,'RESULT.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'.qa/memory-optimization',label+'-result.json'),JSON.stringify(report,null,2));console.log('Report',qa)}
}
run().catch(e=>{console.error(e);process.exitCode=1})
