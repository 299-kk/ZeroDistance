// Isolated HTTPS and HTTP CONNECT checks for the native game download path.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),https=require('node:https'),http=require('node:http'),net=require('node:net'),assert=require('node:assert/strict'),{spawnSync,execFileSync}=require('node:child_process'),esbuild=require('esbuild')
const root=path.resolve(__dirname,'../..'),worker=process.argv.indexOf('--worker'),qa=worker<0?path.join(root,'.qa/download-proxy',crypto.randomUUID()):process.argv[worker+1]
async function run(){
 const body=crypto.randomBytes(32768),sha1=crypto.createHash('sha1').update(body).digest('hex'),requests=[]
 const server=https.createServer({key:fs.readFileSync(path.join(qa,'key.pem')),cert:fs.readFileSync(path.join(qa,'cert.pem'))},(req,res)=>{
  requests.push({url:req.url,method:req.method,range:req.headers.range})
  if(req.url==='/redirect'){res.writeHead(302,{Location:'/installer.jar'});return res.end()}
  if(req.url==='/installer.jar.sha1')return res.end(sha1)
  if(req.url==='/installer.jar'){res.writeHead(200,{'Content-Length':body.length});return res.end(req.method==='HEAD'?undefined:body)}
  res.writeHead(404);res.end()
 })
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const serverPort=server.address().port
 let tunnels=0;const sockets=new Set(),proxy=http.createServer()
 proxy.on('connect',(req,client,head)=>{const target=new URL('http://'+req.url);if(target.hostname!=='localhost'||Number(target.port)!==serverPort)return client.destroy();tunnels++;sockets.add(client);client.on('close',()=>sockets.delete(client));client.on('error',()=>{});const dest=net.connect(serverPort,'127.0.0.1',()=>{client.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)dest.write(head);client.pipe(dest);dest.pipe(client)});dest.on('error',()=>client.destroy());client.on('close',()=>dest.destroy())})
 await new Promise(r=>proxy.listen(0,'127.0.0.1',r));const base=`https://localhost:${serverPort}`,proxyUrl=`http://127.0.0.1:${proxy.address().port}`
 const entry=path.join(qa,'entry.ts'),bundle=path.join(qa,'bundle.cjs')
 fs.writeFileSync(entry,`export {setNativeDownloadProxyResolver,downloadFetch} from ${JSON.stringify(path.join(root,'src/main/core/downloadFetch.ts'))};export {downloadLoaderInstaller} from ${JSON.stringify(path.join(root,'src/main/core/installerDownload.ts'))};export {closeHttpClient} from ${JSON.stringify(path.join(root,'src/main/core/httpClient.ts'))}`)
 await esbuild.build({entryPoints:[entry],outfile:bundle,bundle:true,platform:'node',format:'cjs',target:'node24',external:['koffi'],alias:{electron:path.join(root,'native-launcher/backend/electron.ts')}})
 const api=require(bundle)
 try{
  const seen=[];api.setNativeDownloadProxyResolver(async url=>{seen.push(url);return proxyUrl})
  const dest=path.join(qa,'installer.jar');await api.downloadLoaderInstaller(base+'/installer.jar',dest,'official',undefined,AbortSignal.timeout(15000));assert.deepEqual(fs.readFileSync(dest),body);assert(tunnels>=3);assert(requests.some(x=>x.url==='/installer.jar.sha1'));assert(requests.some(x=>x.url==='/installer.jar'&&x.method==='HEAD'));console.log('PASS Installer checksum, metadata and content use the actual CONNECT proxy')
  seen.length=0;assert.deepEqual(Buffer.from(await(await api.downloadFetch(base+'/redirect',{})).arrayBuffer()),body);assert.deepEqual(seen,[base+'/redirect',base+'/installer.jar']);console.log('PASS Each redirect resolves its own proxy route')
  const unused=net.createServer();await new Promise(r=>unused.listen(0,'127.0.0.1',r));const port=unused.address().port;await new Promise(r=>unused.close(r));api.setNativeDownloadProxyResolver(async()=>`http://127.0.0.1:${port}`);assert.equal((await api.downloadFetch(base+'/installer.jar',{signal:AbortSignal.timeout(10000)})).status,200);console.log('PASS Unavailable proxy falls back to direct HTTPS')
  api.setNativeDownloadProxyResolver(async()=>{throw Error('lookup failed')});assert.equal((await api.downloadFetch(base+'/installer.jar',{signal:AbortSignal.timeout(10000)})).status,200);console.log('PASS Failed system proxy lookup falls back to direct HTTPS')
  const aborted=AbortSignal.abort();await assert.rejects(api.downloadFetch(base+'/installer.jar',{signal:aborted}));console.log('PASS Cancellation is honored')
 }finally{api.setNativeDownloadProxyResolver();await api.closeHttpClient();for(const s of sockets)s.destroy();proxy.closeAllConnections?.();server.closeAllConnections?.();await Promise.all([new Promise(r=>proxy.close(r)),new Promise(r=>server.close(r))])}
}
if(worker<0){fs.mkdirSync(qa,{recursive:true});const config=path.join(qa,'openssl.cnf');fs.writeFileSync(config,'[req]\ndistinguished_name=dn\n[dn]\n');execFileSync('openssl',['req','-config',config,'-x509','-newkey','rsa:2048','-nodes','-sha256','-days','1','-subj','/CN=ZeroDistance-local-QA','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1','-keyout',path.join(qa,'key.pem'),'-out',path.join(qa,'cert.pem')],{stdio:'pipe',windowsHide:true,timeout:30000});const env={...process.env,NODE_EXTRA_CA_CERTS:path.join(qa,'cert.pem')};delete env.NODE_OPTIONS;delete env.NODE_TLS_REJECT_UNAUTHORIZED;const result=spawnSync(path.join(root,'native-launcher/out/engine/node.exe'),[__filename,'--worker',qa],{cwd:root,env,stdio:'inherit',windowsHide:true,timeout:60000});if(result.error)throw result.error;process.exitCode=result.status??1}else run().catch(e=>{console.error(e);process.exitCode=1})
