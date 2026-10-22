import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { minecraftData } from '../src/main/core/projectionRegistry'
import { validateState, projectionVersions } from '../src/main/core/projectionConversion'

const original = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../src/main/core/projectionRegistries.json'), 'utf8'))
test('shared registry preserves every version, block state and legacy mapping', () => {
  for (const [version, hash] of Object.entries(original.registry)) assert.deepEqual(minecraftData(version).blocksByName, original.schemas[hash as string], version)
  assert.deepEqual(minecraftData.legacy.pc.blocks, original.legacy)
  assert.deepEqual(projectionVersions().map(v => [v.version, v.dataVersion]), original.supported.map((v: any) => [v.version, v.dataVersion]))
  assert.equal(minecraftData('unsupported-version'), undefined)
})
test('state validation still accepts exact schemas and rejects invalid properties', () => {
  for (const version of ['1.20.1', '1.21.11', '26.3']) {
    assert.equal(validateState('minecraft:stone', version), undefined)
    assert.equal(validateState('minecraft:oak_log[axis=x]', version), undefined)
    assert.match(validateState('minecraft:oak_log[axis=invalid]', version)!, /不接受/)
    assert.match(validateState('minecraft:oak_log', version)!, /需要明确/)
  }
})
