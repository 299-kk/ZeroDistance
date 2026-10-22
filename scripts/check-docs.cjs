const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict')
const root=path.resolve(__dirname,'..'),version=require('../native-launcher/package.json').version
const documents=['README.md','START_HERE.md','CONTRIBUTING.md','SECURITY.md','docs/README.md','docs/PRODUCT.md','docs/DEVELOPMENT.md','docs/ARCHITECTURE.md','docs/TESTING.md','docs/RELEASING.md','docs/VISUAL_ASSETS.md','docs/CORRESPONDING_SOURCE.md','native-launcher/README.md']
for(const file of documents){
 const text=fs.readFileSync(path.join(root,file),'utf8')
 for(const match of text.matchAll(/\[[^\]\n]*\]\(([^)]+)\)/g)){
  const target=match[1].replace(/^<|>$/g,'').split('#')[0]
  if(!target||/^[a-z][a-z0-9+.-]*:/i.test(target)||target.startsWith('//'))continue
  const resolved=path.resolve(root,path.dirname(file),decodeURIComponent(target))
  assert(resolved.startsWith(root+path.sep)&&fs.existsSync(resolved),'Broken documentation link: '+file+' -> '+target)
 }
}
for(const file of ['README.md','START_HERE.md','docs/PRODUCT.md','native-launcher/README.md'])assert(fs.readFileSync(path.join(root,file),'utf8').includes(version),'Stale current version: '+file)
assert.equal(require('../package.json').version,version,'Root and desktop product versions must agree')
assert(fs.readFileSync(path.join(root,'native-launcher/native/LauncherWindow.cs'),'utf8').includes('Version="'+version+'"'))
console.log('PASS '+documents.length+' current documents: local links and product versions agree')
