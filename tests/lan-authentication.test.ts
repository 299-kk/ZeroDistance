import test from 'node:test'
import assert from 'node:assert/strict'
import { mojangLanSymbols, intermediaryLanSymbols, forgeLanSymbols, authenticationGetter } from '../src/main/core/lanClass'
test('official LAN symbols are scoped to the server class, not a same-named client method', () => {
  const mapping = 'net.minecraft.server.MinecraftServer -> net.minecraft.server.MinecraftServer:\n    12:12:boolean usesAuthentication() -> ac\nnet.minecraft.client.server.IntegratedServer -> x.y:\nnet.minecraft.Other -> z:\n    boolean usesAuthentication() -> unrelated\n'
  assert.deepEqual(mojangLanSymbols(mapping), { server: 'net/minecraft/server/MinecraftServer', integrated: 'x/y', getter: 'ac' })
  assert.throws(() => mojangLanSymbols('net.minecraft.Other -> z:\n boolean usesAuthentication() -> bad'), /缺少/)
})
test('Fabric and Forge mappings select the exact boolean authentication method', () => {
  const original = { server: 'net/minecraft/server/MinecraftServer', integrated: 'x/y', getter: 'ac' }
  const tiny = 'tiny\t2\t0\tofficial\tintermediary\nc\tnet/minecraft/server/MinecraftServer\tnet/minecraft/server/MinecraftServer\n\tm\t()Z\tac\tmethod_3820\n\tm\t(I)Z\tac\twrong\nc\tx/y\tnet/minecraft/class_1132\n'
  assert.equal(intermediaryLanSymbols(tiny, original).getter, 'method_3820')
  assert.equal(intermediaryLanSymbols(tiny, original).integrated, 'net/minecraft/class_1132')
  assert.equal(forgeLanSymbols('tsrg2 obf srg\nnet/minecraft/server/MinecraftServer net/minecraft/server/MinecraftServer\n\tac ()Z m_129797_\nother Other\n\tac ()Z wrong\n', original).getter, 'm_129797_')
  assert.throws(() => intermediaryLanSymbols('', original), /无法解析/)
  assert.throws(() => forgeLanSymbols('', original), /无法解析/)
})
test('unknown class data is never accepted as a compatible LAN hook', () => {
  assert.equal(authenticationGetter(Buffer.from('not a class'), 'usesAuthentication'), false)
})
