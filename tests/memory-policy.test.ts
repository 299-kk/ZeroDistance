import test from 'node:test'
import assert from 'node:assert/strict'
import { BoundedCache } from '../src/shared/boundedCache'
import { minecraftData, releaseProjectionRegistry } from '../src/main/core/projectionRegistry'
test('decoded image caches respect retained bytes, LRU usage, replacement and oversized bypass',()=>{
 const cache=new BoundedCache<string,string>(8,3,s=>s.length)
 cache.set('a','aaaa');cache.set('b','bbb');assert.equal(cache.get('a'),'aaaa');cache.set('c','cc')
 assert.equal(cache.get('b'),undefined);assert.equal(cache.bytes,6)
 cache.set('a','x');assert.equal(cache.bytes,3);cache.set('large','123456789');assert.equal(cache.size,2);assert.equal(cache.get('large'),undefined)
 cache.clear();assert.equal(cache.bytes,0);assert.equal(cache.size,0)
})
test('releasing projection snapshots does not invalidate current readers and reloads exact schemas',()=>{
 const before=minecraftData('1.21.1');assert(before?.blocksByName.stone)
 const stone=JSON.stringify(before.blocksByName.stone),legacy=minecraftData.legacy.pc.blocks,versions=minecraftData.versions.pc
 releaseProjectionRegistry();assert.equal(JSON.stringify(before.blocksByName.stone),stone);assert.deepEqual(minecraftData('1.21.1'),before);assert.deepEqual(minecraftData.legacy.pc.blocks,legacy);assert.deepEqual(minecraftData.versions.pc,versions)
})
