const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn,execFileSync}=require('node:child_process')
const root=path.resolve(__dirname,'../..'),record=JSON.parse(fs.readFileSync(path.join(root,'.qa/native-launcher-result.json'))),data=path.join(record.qa,'profile'),exe=process.env.ZERO_DISTANCE_NATIVE_EXE||path.join(root,'native-launcher/out/ZeroDistance.exe'),label=process.argv[2]||'current',delay=ms=>new Promise(r=>setTimeout(r,ms))
assert(record.ok&&data.startsWith(path.join(root,'.qa')+path.sep),'Use a QA profile that passed the actual consent gate')
async function run(){
 const report={label,exe,debugging:false,runs:[]};
 for(let trial=0;trial<3;trial++){
  const before=new Set(fs.readdirSync(data)),fatal=path.join(data,'native-unhandled.log'),fatalBefore=fs.existsSync(fatal)?fs.statSync(fatal).size:0,start=Date.now(),child=spawn(exe,['--qa','--qa-ordinary-browser','--data-dir',data,'--cdp-port','45579'],{windowsHide:true,stdio:'ignore'});let signal;
  try{
   for(let i=0;i<3000;i++){signal=fs.readdirSync(data).find(n=>!before.has(n)&&/^startup-.*\.control\.finished$/.test(n));if(signal)break;assert.equal(child.exitCode,null);await delay(10)}
   assert(signal,'Ordinary startup must finish');const base=path.join(data,signal.replace(/\.finished$/,''));
   const timing={visibleMs:Math.round(fs.statSync(base+'.visible').mtimeMs-start),mainMs:Math.round(fs.statSync(base+'.assembled').mtimeMs-start),finishedMs:Math.round(fs.statSync(base+'.finished').mtimeMs-start)};report.runs.push(timing);
   execFileSync('powershell.exe',['-NoProfile','-Command',`$ownWindow=Get-Process -Id ${child.pid} -ErrorAction Stop; if($ownWindow.MainWindowHandle -eq 0){throw 'Main window missing'}; $null=$ownWindow.CloseMainWindow(); if(-not $ownWindow.WaitForExit(12000)){throw 'Shutdown timeout'}`],{windowsHide:true,stdio:'pipe',timeout:15000});await delay(100);assert.equal(child.exitCode,0);assert.equal(fs.existsSync(fatal)?fs.statSync(fatal).size:0,fatalBefore);console.log(JSON.stringify(timing));
  }finally{if(child.exitCode===null)try{execFileSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'})}catch{}}
 }
 report.medianMainMs=report.runs.map(r=>r.mainMs).sort((a,b)=>a-b)[1];report.medianFinishedMs=report.runs.map(r=>r.finishedMs).sort((a,b)=>a-b)[1];fs.writeFileSync(path.join(root,'.qa/native-startup-'+label+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({label,medianMainMs:report.medianMainMs,medianFinishedMs:report.medianFinishedMs}));
}
run().catch(error=>{console.error(error);process.exitCode=1})
