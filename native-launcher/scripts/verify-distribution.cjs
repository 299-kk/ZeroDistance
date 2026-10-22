const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),Zip=require('adm-zip')
const root=path.resolve(__dirname,'../..'),project=path.join(root,'native-launcher'),qa=path.join(root,'.qa/native-distribution',crypto.randomUUID()),unzipped=path.join(qa,'zip'),prefix='ZeroDistance-'+require('../package.json').version,hash=b=>crypto.createHash('sha256').update(b).digest('hex')
async function verify(){
 fs.mkdirSync(qa,{recursive:true});const report={qa,ok:false}
 try{
  const zip=new Zip(path.join(project,'release',prefix+'-windows-x64.zip')),entries=zip.getEntries().filter(e=>!e.isDirectory)
  for(const e of entries){assert(!e.entryName.split(/[\\/]/).includes('..'));assert(!path.isAbsolute(e.entryName));assert.equal(hash(e.getData()),hash(fs.readFileSync(path.join(project,'out',e.entryName))),e.entryName)}
  zip.extractAllTo(unzipped,false)
  const env={...process.env,ZERO_DISTANCE_NATIVE_EXE:path.join(unzipped,'ZeroDistance.exe'),ZERO_DISTANCE_QA_NO_EXTERNAL_FOCUS:'1'};delete env.ZERO_DISTANCE_VERIFY_REAL_GAME
  console.log(execFileSync(process.execPath,[path.join(__dirname,'verify.cjs')],{cwd:root,env,encoding:'utf8',windowsHide:true,timeout:180000}).trim())
  const ui=JSON.parse(fs.readFileSync(path.join(root,'.qa/native-launcher-result.json')));assert(ui.ok);fs.writeFileSync(path.join(qa,'zip-ui.json'),JSON.stringify(ui,null,2));report.zip={files:entries.length,byteIdentical:true,uiChecks:ui.passed.length}
  console.log(execFileSync(process.execPath,[path.join(__dirname,'verify-services.cjs')],{env,encoding:'utf8',windowsHide:true,timeout:30000}).trim())
  report.installer=await require('./verify-uninstall.cjs')();assert(report.installer.ok)
  for(const line of fs.readFileSync(path.join(project,'release/SHA256SUMS.txt'),'utf8').trim().split(/\r?\n/)){const[sum,name]=line.split('  ');assert.equal(hash(fs.readFileSync(path.join(project,'release',name))),sum)}
  report.ok=true;return report
 }catch(error){report.error=error.stack;throw error}finally{fs.writeFileSync(path.join(root,'.qa/native-distribution-result.json'),JSON.stringify(report,null,2));console.log('Report '+path.join(root,'.qa/native-distribution-result.json'))}
}
verify().catch(error=>{console.error(error);process.exitCode=1})
