import test from 'node:test'
import assert from 'node:assert/strict'
import { requiredMajor, selectHealthyJava } from '../src/main/core/java'
import { modpackJavaMajor } from '../src/main/core/modpackJava'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import AdmZip from 'adm-zip'

test('按版本声明获取 Java 并支持精确匹配', async () => {
  const oldForge = { id: 'renamed', _mcVersion: '1.16.5', _loader: 'forge', javaVersion: { majorVersion: 8 }, libraries: [{ name: 'net.minecraftforge:forge:1.16.5-36.2.42' }] }
  assert.equal(requiredMajor(oldForge), 8)
  assert.equal(requiredMajor({ id: '1.20.1', _loader: 'forge', javaVersion: { majorVersion: 17 } }), 17)
  assert.equal(requiredMajor({ ...oldForge, _mcVersion: '1.17.1', javaVersion: { majorVersion: 16 } }), 16)
  const available = [{ path: 'not-used', major: 25, version: '25', is64Bit: true }]
  assert.equal(await selectHealthyJava(available, 8, undefined, true), null)
})

test('旧版整合包按已启用模组的 Mixin 声明选择 Java，忽略禁用和损坏的模组', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zd-java-'))
  const mods = path.join(dir, 'mods'); fs.mkdirSync(mods)
  const jar = (name: string, config: string) => { const zip = new AdmZip(); zip.addFile('example.mixins.json', Buffer.from(config)); zip.writeZip(path.join(mods, name)) }
  try {
    assert.equal(await modpackJavaMajor(dir, 8), 8)
    jar('disabled.jar.disabled', '{"compatibilityLevel":"JAVA_11"}')
    fs.writeFileSync(path.join(mods, 'broken.jar'), 'invalid zip')
    assert.equal(await modpackJavaMajor(dir, 8), 8)
    jar('active.jar', '{"compatibilityLevel":"JAVA_11"}')
    assert.equal(await modpackJavaMajor(dir, 8), 11)
    jar('new.jar', '{"compatibilityLevel":"JAVA_17"}')
    assert.equal(await modpackJavaMajor(dir, 8), 17)
    assert.equal(await modpackJavaMajor(dir, 21), 21)
    fs.mkdirSync(path.join(dir, 'PCL'))
    fs.writeFileSync(path.join(dir, 'PCL', 'Setup.ini'), 'VersionArgumentJavaV2:3\nVersionArgumentJavaSelect:{"Path":"Z:\\\\not-portable","VersionString":"1.21.0.1"}\n')
    assert.equal(await modpackJavaMajor(dir, 8), 21)
    fs.writeFileSync(path.join(dir, 'PCL', 'Setup.ini'), 'VersionArgumentJavaV2:0\nVersionArgumentJavaSelect:{"VersionString":"1.21.0.1"}\n')
    const fabric = new AdmZip(); fabric.addFile('fabric.mod.json', Buffer.from('{"depends":{"java":">=19"}}')); fabric.writeZip(path.join(mods, 'fabric.jar'))
    assert.equal(await modpackJavaMajor(dir, 8), 19)
    const forge = new AdmZip(); forge.addFile('META-INF/mods.toml', Buffer.from('[[dependencies.example]]\nmodId="java"\nmandatory=true\nversionRange="[21,)"\n')); forge.writeZip(path.join(mods, 'forge.jar'))
    assert.equal(await modpackJavaMajor(dir, 8), 21)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})
