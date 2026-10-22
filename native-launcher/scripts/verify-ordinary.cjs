const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn,execFileSync}=require('node:child_process')
const root=path.resolve(__dirname,'../..'),record=JSON.parse(fs.readFileSync(path.join(root,'.qa/native-launcher-result.json'))),data=path.join(record.qa,'profile'),exe=path.join(root,'native-launcher/out/ZeroDistance.exe'),delay=ms=>new Promise(r=>setTimeout(r,ms))
assert(record.ok&&data.startsWith(path.join(root,'.qa')+path.sep),'Reuse a profile that already passed real foreground consent, never prefill a consent record')
async function run(){
 const before=new Set(fs.readdirSync(data)),fatal=path.join(data,'native-unhandled.log'),fatalBefore=fs.existsSync(fatal)?fs.statSync(fatal).size:0,child=spawn(exe,['--qa','--qa-ordinary-browser','--data-dir',data,'--cdp-port','45579'],{windowsHide:true,stdio:'ignore'}),result={ok:false,debugging:false,qaBrowserFlags:false};let signal
 try{
  for(let n=0;n<220;n++){signal=fs.readdirSync(data).find(name=>!before.has(name)&&/^startup-.*\.control\.finished$/.test(name));if(signal)break;await delay(100)}
  assert(signal,'Ordinary runtime must reach real renderer-ready, assemble and finish without debug/render flags')
  result.signal=path.join(data,signal);result.frames=fs.readFileSync(result.signal.replace(/\.finished$/,'.frames'),'utf8').trim().split(/\r?\n/).length
  await delay(500);result.pid=child.pid
  result.window=execFileSync('powershell.exe',['-NoProfile','-Command',`$ownWindow = Get-Process -Id ${child.pid} -ErrorAction Stop; if ($ownWindow.MainWindowHandle -eq 0) { throw 'Native main window missing' }; $title=$ownWindow.MainWindowTitle; $null = $ownWindow.CloseMainWindow(); if (-not $ownWindow.WaitForExit(12000)) { throw 'Native shutdown timed out' }; $title`],{encoding:'utf8',windowsHide:true,timeout:15000}).trim();await delay(100);result.exitCode=child.exitCode;assert.equal(result.window,'ZeroDistance');assert.equal(result.exitCode,0);assert.equal(fs.existsSync(fatal)?fs.statSync(fatal).size:0,fatalBefore,'Ordinary startup and shutdown must not log an unhandled UI exception');result.ok=true
 }finally{if(child.exitCode===null)try{execFileSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'})}catch{};fs.writeFileSync(path.join(root,'.qa/native-ordinary-result.json'),JSON.stringify(result,null,2))}
 console.log(JSON.stringify(result,null,2))
}
run().catch(error=>{console.error(error);process.exitCode=1})
