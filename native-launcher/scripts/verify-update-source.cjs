const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{buildSync}=require('esbuild')
const root=path.resolve(__dirname,'../..'),qa=path.join(root,'.qa/native-update-source');fs.mkdirSync(qa,{recursive:true})
process.env.ZERO_DISTANCE_NATIVE_CONFIG=JSON.stringify({version:'0.3.1',dataDirectory:qa,appDirectory:path.join(root,'native-launcher/out'),paths:{appData:qa,home:qa},qa:true})
const bundle=path.join(qa,'updater.cjs');buildSync({entryPoints:[path.join(root,'native-launcher/backend/updater.ts')],outfile:bundle,bundle:true,platform:'node',format:'cjs',target:'node24',alias:{electron:path.join(root,'native-launcher/backend/electron.ts')},external:['koffi']})
const {verifyNativeFeed,obtainNativeFeed}=require(bundle),envelope=JSON.parse(fs.readFileSync(path.join(root,'updates/windows-x64.json'))),payload=verifyNativeFeed(envelope),calls=[],passed=[]
const pass=t=>{passed.push(t);console.log('PASS '+t)}
async function main(){
 assert.equal(payload.product,'ZeroDistance');assert.throws(()=>verifyNativeFeed({...envelope,signature:Buffer.alloc(256).toString('base64')}));assert.throws(()=>verifyNativeFeed({...envelope,payload:Buffer.from(JSON.stringify({...payload,version:'99.99.99'})).toString('base64')}));pass('Pinned production key verifies the actual locally signed feed and rejects metadata/signature tampering')
 const mirror='https://mirror.example/',fetcher=async url=>{calls.push(url);if(url.startsWith(mirror))return new Response(JSON.stringify(envelope));throw Error('simulated GitHub outage')}
 assert.deepEqual(await obtainNativeFeed({updateSource:'auto',updateMirrorUrl:mirror},fetcher),envelope);assert(calls[0].startsWith('https://api.github.com/'));assert(calls[1].startsWith('https://raw.githubusercontent.com/'));assert(calls[2].startsWith(mirror+'https://raw.githubusercontent.com/'));pass('GitHub API/direct feed failures fall back to a mirror of the signed feed')
 calls.length=0;assert.deepEqual(await obtainNativeFeed({updateSource:'mirror',updateMirrorUrl:mirror},fetcher),envelope);assert.equal(calls.length,1);pass('Explicit mirror mode does not first contact the GitHub API')
 calls.length=0;await assert.rejects(obtainNativeFeed({updateSource:'direct'},async url=>{calls.push(url);throw Error('offline')}));assert(calls.every(url=>!url.startsWith(mirror)));pass('Direct-only mode and complete outage report failure rather than claiming latest')
 await assert.rejects(obtainNativeFeed({updateSource:'mirror',updateMirrorUrl:mirror},async()=>new Response(JSON.stringify({...envelope,signature:'forged'}))));pass('An untrusted mirror cannot substitute an unsigned update')
 const tag='v'+payload.version;assert.deepEqual(await obtainNativeFeed({updateSource:'auto'},async url=>url.startsWith('https://api.github.com/')?new Response(JSON.stringify([{tag_name:tag,draft:false,prerelease:true,assets:[{name:'ZeroDistance-update.json'}]}])):new Response(JSON.stringify(envelope))),envelope);pass('The launcher discovers the fork preview releases and reads their signed release asset')
 await assert.rejects(obtainNativeFeed({updateSource:'mirror',updateMirrorUrl:mirror},async()=>new Response('x'.repeat(300000))));pass('Oversized update metadata is rejected with a bounded response reader')
 fs.writeFileSync(path.join(qa,'RESULT.json'),JSON.stringify({ok:true,passed},null,2))
}
main().catch(error=>{console.error(error);process.exitCode=1})
