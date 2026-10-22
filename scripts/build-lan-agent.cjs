const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), { execFileSync } = require('node:child_process'), Zip = require('adm-zip')
const root = path.resolve(__dirname, '..'), tools = path.join(root, '.qa/tools'), classes = path.join(root, '.qa/lan-agent/classes')
const compiler = path.join(tools, 'ecj-3.43.0.jar'), checksum = 'c786468c65e906498e7e36ece4e0d04c6d3dd34c9a61b34a3a5b512801911a82'
async function build() {
  fs.mkdirSync(tools, { recursive: true }); fs.mkdirSync(classes, { recursive: true })
  const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
  if (!fs.existsSync(compiler) || hash(fs.readFileSync(compiler)) !== checksum) {
    const response = await fetch('https://repo.maven.apache.org/maven2/org/eclipse/jdt/ecj/3.43.0/ecj-3.43.0.jar', { signal: AbortSignal.timeout(30000) })
    if (!response.ok) throw new Error('Cannot download development Java compiler: ' + response.status)
    const bytes = Buffer.from(await response.arrayBuffer()); if (hash(bytes) !== checksum) throw new Error('Java compiler checksum mismatch')
    fs.writeFileSync(compiler, bytes)
  }
  const javaName = process.platform === 'win32' ? 'java.exe' : 'java'
  const candidates = [process.env.ZERO_DISTANCE_BUILD_JAVA, process.env.JAVA_HOME && path.join(process.env.JAVA_HOME, 'bin', javaName)].filter(Boolean)
  const runtimes = 'D:/ZeroDistance/.minecraft/runtimes'
  if (fs.existsSync(runtimes)) for (const entry of fs.readdirSync(runtimes)) candidates.push(path.join(runtimes, entry, 'bin/java.exe'))
  const java = candidates.find(file => fs.existsSync(file)) || 'java'
  execFileSync(java, ['-jar', compiler, '-encoding', 'UTF-8', '-source', '8', '-target', '8', '-g:none', '-nowarn', '-d', classes, path.join(root, 'lan-agent/src/app/zerodistance/lan/LanAgent.java')], { stdio: 'inherit', windowsHide: true })
  const zip = new Zip()
  zip.addFile('META-INF/MANIFEST.MF', Buffer.from('Manifest-Version: 1.0\r\nPremain-Class: app.zerodistance.lan.LanAgent\r\n\r\n'))
  const folder = path.join(classes, 'app/zerodistance/lan')
  for (const name of fs.readdirSync(folder)) if (name.endsWith('.class')) zip.addFile('app/zerodistance/lan/' + name, fs.readFileSync(path.join(folder, name)))
  for (const entry of zip.getEntries()) entry.header.time = new Date('2020-01-01T00:00:00Z')
  const output = path.join(root, 'out/main/zero-distance-lan-agent.jar'); fs.mkdirSync(path.dirname(output), { recursive: true }); zip.writeZip(output)
  console.log('Built local LAN agent (Java 8+): ' + fs.statSync(output).size + ' bytes')
}
module.exports = { build }
if (require.main === module) build().catch(error => { console.error(error); process.exitCode = 1 })
