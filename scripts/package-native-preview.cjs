const path=require('node:path'),{execFileSync}=require('node:child_process')
async function main(){
 if(process.platform!=='win32')throw Error('Windows packaging requires Windows x64.')
 const env={...process.env}
 if(!env.ZERO_DISTANCE_MAKENSIS){
  // Uses the NSIS toolset and checksum pinned by package-lock.json. This is a
  // development tool only; no Electron executable enters the runtime package.
  const tool=await require('app-builder-lib/out/toolsets/windows').getMakeNsisPath('0.0.0')
  Object.assign(env,tool.env||{});env.ZERO_DISTANCE_MAKENSIS=tool.path
 }
 execFileSync(process.execPath,[path.resolve(__dirname,'../native-launcher/scripts/pack.cjs')],{cwd:path.resolve(__dirname,'..'),env,stdio:'inherit',windowsHide:true})
}
main().catch(error=>{console.error(error.message);process.exitCode=1})
