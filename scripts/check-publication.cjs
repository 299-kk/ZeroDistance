const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process')
const root=path.resolve(__dirname,'..'),files=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean),errors=[]
if(!files.length)throw Error('Stage or commit the intended source files before the publication check.')
const forbidden=/(^|\/)(node_modules|\.qa|out|release|素材|migration-proof|logs)(\/|$)|(^|\/)(accounts|settings|consent|window)\.json$|(^|\/)\.env(?:\.|$)|\.(?:exe|dll|jar|zip|7z|pfx|p12|pem|key|arw|log)$/i
const secrets=[['GitHub token',/gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,}/],['Private key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],['AWS access key',/AKIA[0-9A-Z]{16}/]]
const publicImages=new Map(require('../src/shared/landscape-images.json').filter(image=>image.generated===true).map(image=>['src/renderer/src/assets/launch/'+image.file,image.sha256]))
for(const file of files){
 if(forbidden.test(file)&&!file.endsWith('.env.example'))errors.push(file+': private/generated file')
 if((file.startsWith('src/renderer/src/assets/launch/')&&!publicImages.has(file))||/^docs\/screenshots\//.test(file)||/^docs\/validation-1\.1\.7\/.*\.(png|wav|webm)$/.test(file))errors.push(file+': non-public media')
 const full=path.join(root,file);if(!fs.existsSync(full)){errors.push(file+': indexed file missing');continue}
 if(publicImages.has(file)&&crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex')!==publicImages.get(file))errors.push(file+': generated image checksum mismatch')
 const size=fs.statSync(full).size;if(size>50*1024*1024)errors.push(file+': source file exceeds 50 MiB')
 if(!/\.(?:png|jpg|webp|ico|gif|br)$/i.test(file)){const text=fs.readFileSync(full,'utf8');for(const[label,pattern]of secrets)if(pattern.test(text))errors.push(file+': '+label+' pattern')}
}
for(const file of publicImages.keys())if(!files.includes(file))errors.push(file+': required generated default is not tracked')
const remotes=execFileSync('git',['remote','-v'],{cwd:root,encoding:'utf8'})
if(/github\.com[:/](?:YUN-SAN3|kamubaba-i)\/KAMUCL(?:\.git)?\s.*\(push\)/i.test(remotes))errors.push('Upstream KAMUCL must not be a push destination')
if(errors.length){console.error(errors.join('\n'));process.exitCode=1}else console.log('PASS '+files.length+' tracked source files: no forbidden private files, unapproved media or known secret patterns')
