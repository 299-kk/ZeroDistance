const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict')
const root=path.resolve(__dirname,'..'),release=path.join(root,'native-launcher/release'),report=JSON.parse(fs.readFileSync(path.join(release,'SIZE.json'))),trust=require('../src/shared/nativeUpdateTrust.json'),version=require('../native-launcher/package.json').version
const keyFile=process.env.ZERO_DISTANCE_UPDATE_SIGNING_KEY||path.join(root,'.qa/publisher/update-private.pem')
if(process.platform==='win32')require('node:child_process').execFileSync(path.join(process.env.SystemRoot||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/check-publisher-key.ps1'),'-KeyPath',keyFile],{windowsHide:true,stdio:'pipe'})
else for(const file of [keyFile,path.dirname(keyFile)])assert.equal(fs.statSync(file).mode&0o077,0,'Publisher key and directory must be private to the publishing user')
const key=crypto.createPrivateKey(fs.readFileSync(keyFile)),publicKey=crypto.createPublicKey(key).export({type:'spki',format:'pem'})
assert.equal(publicKey,trust.publicKey,'Publisher key must match the pinned desktop public key; never rotate it silently')
assert.equal(report.version,version)
const asset=report.artifacts.find(a=>a.name===`ZeroDistance-${version}-windows-x64.zip`);assert(asset)
assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(release,asset.name))).digest('hex'),asset.sha256)
const notes=process.argv.includes('--notes')?fs.readFileSync(process.argv[process.argv.indexOf('--notes')+1],'utf8'):`ZeroDistance ${version} Preview\n内存占用优化；GitHub 更新及签名镜像回退。`
const payload={format:1,product:'ZeroDistance',platform:'win32-x64',version,publishedAt:new Date().toISOString(),body:notes,asset:{name:asset.name,url:`https://github.com/${trust.repository}/releases/download/v${version}/${asset.name}`,size:asset.bytes,sha256:asset.sha256}}
const bytes=Buffer.from(JSON.stringify(payload)),envelope=JSON.stringify({payload:bytes.toString('base64'),signature:crypto.sign('RSA-SHA256',bytes,key).toString('base64')},null,2)+'\n'
fs.mkdirSync(path.join(root,'updates'),{recursive:true});fs.writeFileSync(path.join(root,'updates/windows-x64.json'),envelope);fs.writeFileSync(path.join(release,'ZeroDistance-update.json'),envelope)
console.log('Signed native update '+version+'; private key remains outside published source and artifacts.')
