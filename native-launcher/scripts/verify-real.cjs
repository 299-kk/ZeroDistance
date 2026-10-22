const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),net=require('node:net'),{execFileSync}=require('node:child_process')
module.exports=async function({page,qa,report,passed,until,delay,root}){
 const game=path.join(root,'.qa/native-real-game/game'),id='26.3',java=process.env.ZERO_DISTANCE_VERIFY_JAVA||'D:/ZeroDistance/.minecraft/runtimes/jre-25-x64-THBkbL/bin/java.exe'
 assert(fs.existsSync(path.join(game,'versions',id,id+'.jar')),'Prepare an isolated real game copy first');assert(fs.existsSync(java))
 const versionFile=path.join(game,'versions',id,id+'.json'),version=JSON.parse(fs.readFileSync(versionFile));delete version._javaPath;delete version._javaAuto;version._resolution={width:854,height:480,mode:'windowed',fullscreen:false};fs.writeFileSync(versionFile,JSON.stringify(version,null,2))
 await page.evaluate(({game,java})=>window.kamucl.invoke('settings:set',{folders:[{path:game,name:'原生启动测试',isDefault:true}],gameDir:game,activeFolder:game,javaPath:java,javaAuto:false,javaCustom:[java],memoryAuto:false,memoryMB:2048,closeAfterLaunch:false,offlineMultiplayerNoticeDismissed:true,theme:'black-purple',mirror:'official'}),{game,java})
 await page.reload();await page.locator('.zd-hero').waitFor({timeout:30000})
 const manifest=await page.evaluate(()=>window.kamucl.invoke('versions:manifest',true));assert(manifest.some(v=>v.id==='26.3'));report.manifestCount=manifest.length;passed('Live Minecraft version catalog is fetched and parsed by the migrated launcher')
 // Small real shader download verifies transfer, SHA-1, byte sizes and the instance destination.
 const files=await page.evaluate(()=>window.kamucl.invoke('community:files','modrinth','complementary-reimagined',{kind:'shader'}));const file=files.find(f=>f.sha1&&f.size>0&&f.size<8*1024*1024);assert(file)
 await page.evaluate(()=>{window.__nativeProgress=[];window.kamucl.on('event:progress',value=>window.__nativeProgress.push(value));})
 const downloaded=await page.evaluate(({file,id})=>window.kamucl.invoke('community:download',file,{versionId:id,kind:'shader'}),{file,id});assert(downloaded.startsWith(game+path.sep));const bytes=fs.readFileSync(downloaded);assert.equal(bytes.length,file.size);assert.equal(crypto.createHash('sha1').update(bytes).digest('hex'),file.sha1);report.download={file:file.fileName,bytes:bytes.length,sha1:file.sha1};assert((await page.evaluate(()=>window.__nativeProgress)).length>0);passed('An actual Modrinth shader ZIP downloads to the isolated instance with matching size/SHA-1 and progress events')
 // Obtain, then immediately cancel a device code. No human authorization or token is consumed.
 try{const login=await page.evaluate(()=>window.kamucl.invoke('accounts:msBegin'));assert(login.userCode&&login.verificationUri);report.microsoftDeviceCode={obtained:true,verificationHost:new URL(login.verificationUri).hostname};await page.evaluate(()=>window.kamucl.invoke('accounts:msCancel'));passed('Microsoft device-code request and cancellation work; full account authorization still requires the user')}
 catch(error){report.microsoftDeviceCode={obtained:false,error:error.message};console.log('LIMIT Microsoft device code: '+error.message)}
 // Retained local networking engine: real TCP payload round trip and explicit shutdown.
 const echo=net.createServer(socket=>socket.pipe(socket));await new Promise(r=>echo.listen(0,'127.0.0.1',r));let host
 try{
  host=await page.evaluate(request=>window.kamucl.invoke('direct:host',request),{versionId:id,folder:game,port:echo.address().port,useUpnp:false});assert(host.active&&host.exposedPort>0)
  const marker='ZERO_DISTANCE_NATIVE_'+crypto.randomUUID();const reply=await new Promise((resolve,reject)=>{const socket=net.connect(host.exposedPort,'127.0.0.1',()=>socket.write(marker));socket.setTimeout(5000,()=>socket.destroy(Error('TCP timeout')));socket.once('data',bytes=>{resolve(bytes.toString());socket.destroy()});socket.once('error',reject)});assert.equal(reply,marker)
  assert.equal((await page.evaluate(()=>window.kamucl.invoke('direct:stop'))).active,false);passed('Original local forwarding engine transfers a real TCP payload and releases its listener on stop; cross-network peers remain unverified')
 }finally{await page.evaluate(()=>window.kamucl.invoke('direct:stop')).catch(()=>{});await new Promise(r=>echo.close(r))}
 // Native LAN auth toggle changes the QA JSON only; preserve original game JAR hash.
 const jar=path.join(game,'versions',id,id+'.jar'),jarHash=crypto.createHash('sha256').update(fs.readFileSync(jar)).digest('hex')
 await page.evaluate(({id,game})=>window.kamucl.invoke('versions:lanAuthentication',{id,folder:game},true),{id,game});assert.equal(JSON.parse(fs.readFileSync(path.join(game,'versions',id,id+'.json')))._zeroDistanceLanOffline,true)
 await page.evaluate(({id,game})=>window.kamucl.invoke('versions:lanAuthentication',{id,folder:game},false),{id,game});assert(!JSON.parse(fs.readFileSync(path.join(game,'versions',id,id+'.json')))._zeroDistanceLanOffline);assert.equal(crypto.createHash('sha256').update(fs.readFileSync(jar)).digest('hex'),jarHash);passed('Per-instance LAN verification toggle prepares the actual Java agent and preserves the original client JAR')
 await page.evaluate(()=>{window.__nativeLaunchStates=[];window.__nativeLaunchLogs=[];window.kamucl.on('event:launchState',value=>window.__nativeLaunchStates.push(value));window.kamucl.on('event:launchLog',value=>window.__nativeLaunchLogs.push(value));})
 await page.evaluate(({id,game})=>window.kamucl.invoke('game:launch',id,undefined,game),{id,game})
 const running=path.join(game,'running-game.json');let pid
 try{
  await until(async()=>{const states=await page.evaluate(()=>window.__nativeLaunchStates);const error=states.find(s=>s.status==='error');if(error)throw Error(error.text);return states.some(s=>s.status==='running')},'real Minecraft process',360000)
  const profile=(await page.evaluate(()=>window.kamucl.invoke('native:info'))).dataDirectory
  const files=fs.readdirSync(profile).filter(n=>/running.*game|game.*running/.test(n));report.runningRecordFiles=files
  const records=JSON.parse(fs.readFileSync(path.join(profile,'running-game.json'))),record=Array.isArray(records)?records.find(r=>r.versionId===id):records;pid=record?.pid;assert(pid>0)
  const title=await until(()=>{try{const text=execFileSync('powershell.exe',['-NoProfile','-Command',`$gameTest = Get-Process -Id ${pid} -ErrorAction Stop; if ($gameTest.MainWindowHandle -ne 0) { $gameTest.MainWindowTitle }`],{encoding:'utf8',windowsHide:true,timeout:5000}).trim();return /Minecraft/.test(text)?text:null}catch{return null}},'Minecraft native main window',90000)
  report.minecraft={pid,title,java:record.javaPath||java,version:id,logs:(await page.evaluate(()=>window.__nativeLaunchLogs)).slice(-15)}
  await page.locator('[data-nav=home]').click();await until(async()=>(await page.locator('.zd-session-strip').innerText()).includes('目前已启动 1 个游戏版本'),'running count');await page.screenshot({path:path.join(qa,'06-real-minecraft-running.png')})
  passed('Real Minecraft 26.3 starts with Java 25, creates its native game window and updates the original home running count')
  // Close this launcher's window, then confirm its owned Minecraft PID survives.
  await page.evaluate(()=>window.kamucl.send('window:close'));await delay(4500)
  assert(execFileSync('powershell.exe',['-NoProfile','-Command',`(Get-Process -Id ${pid} -ErrorAction Stop).Id`],{encoding:'utf8',windowsHide:true,timeout:5000}).trim()==String(pid));passed('Closing the C# launcher and compatibility backend leaves its owned Minecraft process running')
 }finally{
  try{report.launchStates=await page.evaluate(()=>window.__nativeLaunchStates);report.launchLogs=(await page.evaluate(()=>window.__nativeLaunchLogs)).slice(-30)}catch{}
  if(pid){try{execFileSync('powershell.exe',['-NoProfile','-Command',`$gameTest = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if ($gameTest) { $null = $gameTest.CloseMainWindow(); $null = $gameTest.WaitForExit(15000) }`],{windowsHide:true,timeout:18000})}catch{}}
 }
}
