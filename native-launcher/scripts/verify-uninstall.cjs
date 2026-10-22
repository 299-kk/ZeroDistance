const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),net=require('node:net'),{execFileSync,spawnSync,spawn}=require('node:child_process'),Zip=require('adm-zip')
const root=path.resolve(__dirname,'../..'),project=path.join(root,'native-launcher'),delay=ms=>new Promise(r=>setTimeout(r,ms)),hash=b=>crypto.createHash('sha256').update(b).digest('hex')
async function verify(){
 const id=crypto.randomUUID().replaceAll('-',''),qa=path.join(root,'.qa/uninstall',id),installed=path.join(qa,'installed'),profile=path.join(qa,'profile'),local=path.join(qa,'local-profile'),identity='ZeroDistanceUninstallQA_'+id,installer=path.join(qa,'Setup-QA.exe'),configFile=path.join(qa,'config.json'),report={qa,identity,passed:[],ok:false};fs.mkdirSync(qa,{recursive:true})
 const config={qa,identity,installer};fs.writeFileSync(configFile,JSON.stringify(config))
 const ps=(mode,target=installed,noDesktop=false)=>JSON.parse(execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'uninstall-qa.ps1'),'-Config',configFile,'-Mode',mode,'-Target',target,...(noDesktop?['-NoDesktopShortcut']:[])],{encoding:'utf8',windowsHide:true,timeout:90000}).trim())
 const passed=message=>{report.passed.push(message);console.log('PASS '+message)},gone=state=>{assert(state.registry.every(r=>!r.install&&!r.uninstall&&!r.parent));assert(!state.startShortcut&&!state.desktopShortcut&&!state.legacyStart&&!state.legacyDesktop)}
 let application,browser
 try{
  const generated=fs.readFileSync(path.join(root,'.qa/migration-tools/native-launcher.nsi'),'utf8').replace(/^\uFEFF/,''),release=require('../package.json'),original=path.join(project,'release','ZeroDistance-'+release.version+'-Setup.exe')
  let script=generated.replace('OutFile "'+original+'"','OutFile "'+installer+'"')
  const definitions={'ZD_REG_ROOT':'Software\\'+identity,'ZD_UNINSTALL_KEY':'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\'+identity,'ZD_DATA_DIR':profile,'ZD_LOCAL_DATA_DIR':local,'ZD_CLEANUP_ARGS':'--qa-root $\\"'+qa+'$\\"','ZD_SHORTCUT':identity+'.lnk','ZD_LEGACY_SHORTCUT':identity+'-legacy.lnk'}
  for(const[key,value]of Object.entries(definitions)){const pattern=new RegExp('^!define '+key+' .*$', 'm');assert(pattern.test(script));script=script.replace(pattern,()=> '!define '+key+' "'+value+'"')}
  script='!define ZD_TEST_LOG "'+path.join(qa,'cleanup.log')+'"\n'+script
  assert(script.includes('OutFile "'+installer+'"'));const file=path.join(qa,'setup.nsi');fs.writeFileSync(file,'\ufeff'+script)
  const compiler=process.env.ZERO_DISTANCE_MAKENSIS||path.join(process.env.LOCALAPPDATA,'electron-builder/Cache/nsis-3.0.4.1/nsis-3.0.4.1-1mx3n/makensis.exe');execFileSync(compiler,['/V2',file],{windowsHide:true,stdio:'pipe',timeout:180000})
  const legacy=ps('SeedLegacyLinks');assert(legacy.legacyStart&&legacy.legacyDesktop)
  const first=ps('Install');assert.equal(first.exitCode,0);assert(first.state.startShortcut&&first.state.desktopShortcut);assert(!first.state.legacyStart&&!first.state.legacyDesktop);assert(first.state.registry.filter(r=>r.uninstall).every(r=>r.displayName==='ZeroDistance'));passed('The new product display name is ZeroDistance and installation removes legacy migration shortcuts')
  const zip=new Zip(path.join(project,'release','ZeroDistance-'+release.version+'-windows-x64.zip'));for(const e of zip.getEntries().filter(e=>!e.isDirectory))assert.equal(hash(fs.readFileSync(path.join(installed,e.entryName))),hash(e.getData()),e.entryName)
  ps('SeedBothViews');passed('Actual installer payload matches ZIP, default shortcuts exist, and both registry views are exercised under an isolated identity')
  const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r))
  application=spawn(path.join(installed,'ZeroDistance.exe'),['--qa','--data-dir',profile,'--cdp-port',String(port)],{windowsHide:true,stdio:'ignore'})
  let connected=false;for(let i=0;i<300;i++){assert.equal(application.exitCode,null);try{connected=(await fetch('http://127.0.0.1:'+port+'/json/version')).ok}catch{}if(connected)break;await delay(100)}assert(connected)
  const busy=ps('Uninstall');assert.notEqual(busy.exitCode,0);assert(busy.state.registry.some(r=>r.uninstall));assert(fs.existsSync(path.join(installed,'ZeroDistance.exe')))
  let pw;try{pw=require('playwright')}catch{pw=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))}
  browser=await pw.chromium.connectOverCDP('http://127.0.0.1:'+port);const page=browser.contexts().flatMap(c=>c.pages())[0];await page.waitForFunction(()=>window.kamucl);await page.evaluate(()=>window.kamucl.send('window:close'))
  await browser.close();browser=null;for(let i=0;i<150&&application.exitCode===null;i++)await delay(100);assert.equal(application.exitCode,0);await delay(1000)
  passed('A running launcher blocks uninstall without deleting data or unregistering the program')
  fs.mkdirSync(profile,{recursive:true});fs.mkdirSync(local,{recursive:true})
  const external=path.join(qa,'external-game'),nested=path.join(profile,'player-games'),installedGame=path.join(installed,'ui/player-game');for(const dir of [external,nested,installedGame]){fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'world.dat'),'player world sentinel')}
  fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({gameDir:external,activeFolder:external,folders:[external,nested,installedGame].map(path=>({path}))}));fs.writeFileSync(path.join(profile,'accounts.json'),'private fixture');fs.mkdirSync(path.join(profile,'webview/cache'),{recursive:true});fs.writeFileSync(path.join(profile,'webview/cache/old'),'cache');fs.writeFileSync(path.join(local,'old-cache'),'local cache');fs.writeFileSync(path.join(installed,'ui/obsolete-version.js'),'old payload');fs.writeFileSync(path.join(installed,'personal-note.txt'),'personal note')
  const linked=path.join(profile,'outside-link');fs.symlinkSync(external,linked,'junction')
  const failed=ps('LockedUninstall');assert.notEqual(failed.exitCode,0);assert(failed.state.registry.some(r=>r.uninstall));assert(fs.existsSync(path.join(installed,'Uninstall.exe'))&&fs.existsSync(path.join(installed,'UninstallCleanup.exe')));passed('Locked data prevents a successful uninstall and retains a usable uninstall entry for retry')
  const cleaned=ps('Uninstall');assert.equal(cleaned.exitCode,0);gone(cleaned.state)
  for(const dir of [external,nested,installedGame])assert.equal(fs.readFileSync(path.join(dir,'world.dat'),'utf8'),'player world sentinel')
  for(const file of ['accounts.json','settings.json','webview','cache.lock','outside-link'])assert(!fs.existsSync(path.join(profile,file)),file)
  for(const file of ['ZeroDistance.exe','Uninstall.exe','UninstallCleanup.exe','ZeroDistance.Native.marker','.uninstall-preserved-games.json','ui/obsolete-version.js'])assert(!fs.existsSync(path.join(installed,file)),file)
  assert(!fs.existsSync(local));assert.equal(fs.readFileSync(path.join(installed,'personal-note.txt'),'utf8'),'personal note');passed('Retry removes software, old assets, account/cache data, shortcuts, both registry views and empty parent keys while preserving games and personal files; directory links are not followed')
  // A second install with no user files must leave neither installation nor data directory.
  const cleanInstall=path.join(qa,'clean-install'),second=ps('Install',cleanInstall,true);assert.equal(second.exitCode,0);assert(second.state.startShortcut&&!second.state.desktopShortcut)
  // Keep the registered game paths for the retry test separate from this clean profile.
  fs.renameSync(nested,path.join(qa,'saved-game'));fs.rmdirSync(profile)
  fs.mkdirSync(local,{recursive:true});fs.writeFileSync(path.join(local,'cache'),'cache');fs.mkdirSync(profile);fs.writeFileSync(path.join(profile,'cache-only'),'cache')
  const clear=ps('Uninstall',cleanInstall);assert.equal(clear.exitCode,0);gone(clear.state);assert(!fs.existsSync(cleanInstall)&&!fs.existsSync(profile)&&!fs.existsSync(local));passed('Ordinary no-shortcut installation leaves no installation directory, profile, local cache, shortcuts or app registry keys after uninstall')
  const old=path.join(qa,'old-copy');assert.equal(ps('Install',old).exitCode,0);fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'keep.txt'),'active install data');const active=path.join(qa,'other-install');fs.mkdirSync(active);fs.copyFileSync(path.join(old,'ZeroDistance.exe'),path.join(active,'ZeroDistance.exe'));ps('PointElsewhere',active)
  assert.equal(ps('Uninstall',old).exitCode,0);assert(!fs.existsSync(old));assert.equal(fs.readFileSync(path.join(profile,'keep.txt'),'utf8'),'active install data');assert(ps('State').registry.some(r=>r.location===active));passed('Removing an old copy preserves another registered installation and its shared data')
  const moved=path.join(qa,'moved-install');assert.equal(ps('Install',moved).exitCode,0);ps('PointElsewhere',path.join(qa,'missing-old-location'));const movedResult=ps('Uninstall',moved);assert.equal(movedResult.exitCode,0);gone(movedResult.state);assert(!fs.existsSync(moved)&&!fs.existsSync(profile));passed('Stale registration pointing to a missing old directory is removed rather than preserving unwanted app data')
  const guard=path.join(qa,'unmarked');fs.mkdirSync(guard);fs.writeFileSync(path.join(guard,'keep'),'foreign')
  const result=spawnSync(path.join(project,'out/UninstallCleanup.exe'),['--install-dir',guard,'--data-dir',profile,'--local-data-dir',local,'--qa-root',qa],{windowsHide:true,encoding:'utf8'});assert.equal(result.status,1);assert.equal(fs.readFileSync(path.join(guard,'keep'),'utf8'),'foreign');passed('Cleanup refuses unmarked or foreign installation roots')
  report.ok=true;return report
 }catch(error){report.error=error.stack;const log=path.join(qa,'cleanup.log');if(fs.existsSync(log))report.cleanupLog=new TextDecoder('gb18030').decode(fs.readFileSync(log));throw error
 }finally{
  if(application&&application.exitCode===null)try{execFileSync('taskkill.exe',['/PID',String(application.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'})}catch{}
  if(browser)try{await browser.close()}catch{}
  try{ps('Cleanup')}catch(error){report.cleanupError=String(error);report.ok=false}
  fs.writeFileSync(path.join(qa,'RESULT.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'.qa/uninstall-result.json'),JSON.stringify(report,null,2));console.log('Report '+path.join(qa,'RESULT.json'))
 }
}
module.exports=verify
if(require.main===module)verify().catch(error=>{console.error(error);process.exitCode=1})
