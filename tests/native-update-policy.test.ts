import test from 'node:test'
import assert from 'node:assert/strict'
import { nativeUpdateSources, validateNativeUpdate, nativeRelease } from '../src/shared/nativeUpdatePolicy'
const asset={name:'ZeroDistance-0.3.2-windows-x64.zip',url:'https://github.com/299-kk/ZeroDistance/releases/download/v0.3.2/ZeroDistance-0.3.2-windows-x64.zip',size:39000000,sha256:'a'.repeat(64)}
const payload={format:1,product:'ZeroDistance',platform:'win32-x64',version:'0.3.2',publishedAt:'2026-10-27T00:00:00Z',body:'Release',asset}
test('native updates accept only complete directory packages from the fork release namespace',()=>{
 assert.equal(nativeRelease(validateNativeUpdate(payload)).assetName,asset.name)
 for(const patch of [{url:asset.url.replace('299-kk','other')},{name:'ZeroDistance-0.3.2.exe'},{size:100000001},{sha256:'invalid'}])assert.throws(()=>validateNativeUpdate({...payload,asset:{...asset,...patch}}))
 assert.throws(()=>validateNativeUpdate({...payload,version:'../../1.0.0'}))
 for(const version of ['00.3.2','0.3.2\n','2147483648.1.1','9'.repeat(50)+'.0.1'])assert.throws(()=>validateNativeUpdate({...payload,version}))
})
test('update transport uses GitHub first, normalizes mirror prefixes, and validates HTTPS mirrors',()=>{
 const url=asset.url;assert.deepEqual(nativeUpdateSources(url,{updateMirrorUrl:'https://mirror.example'}),[url,'https://mirror.example/'+url])
 assert.deepEqual(nativeUpdateSources(url,{updateSource:'direct',updateMirrorUrl:'broken'}),[url])
 assert.deepEqual(nativeUpdateSources(url,{updateSource:'mirror',updateMirrorUrl:'https://mirror.example/'}),['https://mirror.example/'+url])
 assert.deepEqual(nativeUpdateSources(url,{}),[url,'https://gh-proxy.org/'+url,'https://gh-proxy.com/'+url,'https://ghproxy.net/'+url])
 assert.deepEqual(nativeUpdateSources(url,{updateSource:'mirror'}),['https://gh-proxy.org/'+url,'https://gh-proxy.com/'+url,'https://ghproxy.net/'+url])
 assert.throws(()=>nativeUpdateSources(url,{updateMirrorUrl:'http://untrusted.example/'}));assert.throws(()=>nativeUpdateSources(url,{updateMirrorUrl:'https://user:password@example.com/'}))
})
