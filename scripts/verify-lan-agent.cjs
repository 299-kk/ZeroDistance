const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict'), { execFileSync } = require('node:child_process'), Zip = require('adm-zip')
require('tsx/cjs')
const { authenticationGetter } = require('../src/main/core/lanClass.ts')
const root = path.resolve(__dirname, '..'), output = path.join(root, '.qa/lan-agent-test', crypto.randomUUID()), classes = path.join(output, 'classes')
fs.mkdirSync(classes, { recursive: true })
const runtimes = 'D:/ZeroDistance/.minecraft/runtimes'
const java = process.env.ZERO_DISTANCE_BUILD_JAVA || fs.readdirSync(runtimes).map(name => path.join(runtimes, name, 'bin/java.exe')).find(file => fs.existsSync(file))
assert(java, 'A Java runtime is required to verify the built agent')
const write = (relative, text) => { const file = path.join(output, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); return file }
const files = [
  write('src/net/minecraft/server/MinecraftServer.java', 'package net.minecraft.server; public class MinecraftServer { private boolean auth=true; @Deprecated public boolean usesAuthentication(){return auth;} public void set(boolean value){auth=value;} }'),
  write('src/net/minecraft/client/server/IntegratedServer.java', 'package net.minecraft.client.server; public class IntegratedServer extends net.minecraft.server.MinecraftServer {}'),
  write('src/TestMain.java', 'import net.minecraft.server.MinecraftServer; import net.minecraft.client.server.IntegratedServer; public class TestMain { static class Modded extends IntegratedServer {} public static void main(String[] args) throws Exception { boolean patched=Boolean.getBoolean("patched"); MinecraftServer dedicated=new MinecraftServer(), local=new IntegratedServer(), modded=new Modded(); if(!dedicated.usesAuthentication() || local.usesAuthentication()==patched || modded.usesAuthentication()==patched)throw new AssertionError("host scope"); dedicated.set(false); local.set(false); if(dedicated.usesAuthentication()||local.usesAuthentication())throw new AssertionError("original false"); System.out.println("VERIFIED: host="+!patched+", dedicated unchanged, subclass supported"); } }'),
  write('src/InspectGame.java', `public class InspectGame {
    public static void main(String[] args) throws Exception {
      Class.forName("net.minecraft.SharedConstants").getMethod("tryDetectVersion").invoke(null);
      Class.forName("net.minecraft.server.Bootstrap").getMethod("bootStrap").invoke(null);
      Class<?> base=Class.forName("net.minecraft.server.MinecraftServer"), local=Class.forName("net.minecraft.client.server.IntegratedServer"), dedicated=Class.forName("net.minecraft.server.dedicated.DedicatedServer"), unsafe=Class.forName("sun.misc.Unsafe");
      java.lang.reflect.Field field=unsafe.getDeclaredField("theUnsafe"); field.setAccessible(true);
      Object allocator=field.get(null); java.lang.reflect.Method allocate=unsafe.getMethod("allocateInstance",Class.class);
      // Exercise actual game objects without creating a world, binding a port or running Minecraft's GUI.
      Object host=allocate.invoke(allocator,local), server=allocate.invoke(allocator,dedicated);
      java.lang.reflect.Method set=base.getMethod("setUsesAuthentication",boolean.class), get=base.getMethod("usesAuthentication");
      set.invoke(host,true); set.invoke(server,true); boolean patched=Boolean.getBoolean("patched");
      if(((Boolean)get.invoke(host))==patched || !((Boolean)get.invoke(server)))throw new AssertionError("real host policy");
      System.out.println("VERIFIED: real IntegratedServer="+get.invoke(host)+", DedicatedServer="+get.invoke(server));
    }
  }`)
]
execFileSync(java, ['-jar', path.join(root, '.qa/tools/ecj-3.43.0.jar'), '-source', '8', '-target', '8', '-g:none', '-nowarn', '-d', classes, ...files], { windowsHide: true, stdio: 'pipe' })
const policy = write('policy.properties', 'net/minecraft/server/MinecraftServer=net/minecraft/client/server/IntegratedServer|usesAuthentication\n')
const agent = path.join(root, 'out/main/zero-distance-lan-agent.jar')
const run = args => execFileSync(java, args, { windowsHide: true, cwd: output, encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] })
const baseline = run(['-Xverify:all', '-cp', classes, 'TestMain'])
const patched = run(['-Xverify:all', `-javaagent:${agent}=${policy}`, '-Dpatched=true', '-cp', classes, 'TestMain'])
assert(baseline.includes('VERIFIED')); assert(patched.includes('APPLIED')); assert(patched.includes('VERIFIED'))
const probe = fs.readFileSync(path.join(classes, 'net/minecraft/server/MinecraftServer.class'))
assert(authenticationGetter(probe, 'usesAuthentication')); assert(!authenticationGetter(probe, 'wrongMethod'))
const classpath = []
const metadata = JSON.parse(fs.readFileSync('D:/MC/.minecraft/versions/26.3/26.3.json'))
for (const library of metadata.libraries) {
  let allowed = !library.rules
  for (const rule of library.rules || []) { if (rule.os?.name && rule.os.name !== 'windows') continue; allowed = rule.action === 'allow' }
  if (!allowed || !library.downloads?.artifact) continue
  const relative = library.downloads.artifact.path
  const file = ['D:/MC/.minecraft/libraries', 'D:/ZeroDistance/.minecraft/libraries'].map(dir => path.join(dir, relative)).find(file => fs.existsSync(file))
  assert(file, 'Missing 26.3 library: ' + relative); classpath.push(file)
}
const client = 'D:/MC/.minecraft/versions/26.3/26.3.jar'
assert(fs.existsSync(client), 'Local 26.3 installation needed for the real class verifier')
const gameHash = () => crypto.createHash('sha256').update(fs.readFileSync(client)).digest('hex')
const beforeHash = gameHash()
const realClass = new Zip(client).readFile('net/minecraft/server/MinecraftServer.class')
assert(authenticationGetter(realClass, 'usesAuthentication'))
// Exclude the fixture server classes so this probe verifies the actual installed game class.
const inspector = path.join(output, 'inspector'); fs.mkdirSync(inspector)
fs.copyFileSync(path.join(classes, 'InspectGame.class'), path.join(inspector, 'InspectGame.class'))
const common = ['-Xverify:all', '-cp', '"' + [inspector, client, ...classpath].join(path.delimiter).replaceAll('\\','/') + '"', 'InspectGame']
const baselineFile = write('real-baseline.args', common.join('\n'))
const realBaseline = run(['@' + baselineFile]); assert(realBaseline.includes('real IntegratedServer=true, DedicatedServer=true'))
const argFile = write('real.args', ['-Dpatched=true', `"-javaagent:${agent.replaceAll('\\','/')}=${policy.replaceAll('\\','/')}"`, ...common].join('\n'))
const real = run(['@' + argFile]); assert(real.includes('APPLIED')); assert(real.includes('real IntegratedServer=false, DedicatedServer=true'))
assert.equal(gameHash(), beforeHash)
const report = { ok: true, output, baseline: baseline.trim(), patched: patched.trim(), realMinecraftBaseline: realBaseline.trim(), realMinecraft: real.trim(), gameJarUnchanged: true, gameJarSha256: beforeHash }
fs.writeFileSync(path.join(root, '.qa/lan-agent-result.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2))
