import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { BUILTIN_LAUNCH_IMAGES } from '../src/shared/launchImages'
import { activeCarouselKeys, carouselImages, carouselSelection, carouselTiming } from '../src/shared/appearancePolicy'
import { CarouselPlayback } from '../src/shared/carouselPlayback'

const keys = BUILTIN_LAUNCH_IMAGES.map(image => image.key)
test('upstream image keys disappear while users retain their pictures and ordering', () => {
  const settings = { images: ['custom-a', 'custom-b'], order: ['builtin:piston', 'custom-b', 'builtin:sunset', 'custom-b'], disabled: ['builtin:cannon', 'custom-a'] }
  assert.deepEqual(carouselSelection(settings), { order: ['custom-b', ...keys, 'custom-a'], disabled: ['custom-a'] })
  assert.deepEqual(activeCarouselKeys(settings), ['custom-b', ...keys])
  assert.deepEqual(carouselImages(settings), ['custom-a', 'custom-b'])
})
test('turning every picture off never revives a fallback or deletes files', () => {
  const settings = { images: ['custom'], disabled: [...keys, 'custom'] }
  assert.deepEqual(activeCarouselKeys(settings), [])
  assert.deepEqual(carouselImages(settings), ['custom'])
})
test('timings reject obsolete assets and clamp invalid durations', () => {
  const timing = carouselTiming({ images: ['custom-a', 'custom-b'], intervalSeconds: 999, durations: { 'custom-a': 0, 'custom-b': NaN, 'builtin:piston': 15 } })
  assert.equal(timing.intervalSeconds, 120)
  assert.deepEqual(timing.durations, { 'custom-a': 1, 'custom-b': 6.5 })
})
test('each visible slide owns its own dwell time', () => {
  const playback = new CarouselPlayback([{ path: 'a', durationMs: 1000 }, { path: 'b', durationMs: 4000 }], 0)
  assert.equal(playback.tick(999), 0)
  assert.equal(playback.tick(1000), 1)
  assert.equal(playback.tick(4999), 1)
  assert.equal(playback.tick(5000), 0)
})
test('leaving a page preserves remaining time instead of counting invisible time', () => {
  const slides = [{ path: 'a', durationMs: 5000 }, { path: 'b', durationMs: 3000 }]
  const before = new CarouselPlayback(slides, 1000)
  const bookmark = before.bookmark(2500)
  assert.deepEqual(bookmark, { path: 'a', remainingMs: 3500 })
  const resumed = new CarouselPlayback(slides, 90000, bookmark)
  assert.equal(resumed.tick(93499), 0)
  assert.equal(resumed.tick(93500), 1)
})
test('saving an overdue or not-yet-loaded slide never silently advances the visible image', () => {
  const player = new CarouselPlayback([{ path: 'a', durationMs: 1000 }, { path: 'b', durationMs: 1000 }], 0)
  assert.equal(player.peekNext(1500), 1)
  assert.deepEqual(player.bookmark(1500), { path: 'a', remainingMs: 1 })
  assert.equal(player.index, 0)
})
test('removed image bookmarks recover to the first available picture', () => {
  const player = new CarouselPlayback([{ path: 'replacement', durationMs: 3000 }], 10000, { path: 'removed', remainingMs: 9000 })
  assert.equal(player.index, 0)
  assert.deepEqual(player.bookmark(10000), { path: 'replacement', remainingMs: 3000 })
  assert.equal(player.tick(999999), 0)
})
test('the current UI compiles with the shared gallery and empty-image state', () => {
  for (const file of ['views/ZeroHomeView.vue', 'views/HomeView.vue', 'components/HomeLayoutEditor.vue', 'App.vue']) {
    const { descriptor, errors } = parse(fs.readFileSync('src/renderer/src/' + file, 'utf8'))
    assert.deepEqual(errors, [])
    const script = compileScript(descriptor, { id: file })
    const template = compileTemplate({ source: descriptor.template!.content, filename: file, id: file, compilerOptions: { bindingMetadata: script.bindings } })
    assert.deepEqual(template.errors, [])
  }
})
test('the asset directory has no old illustrations, mascot textures, or generated cover', () => {
  const root = 'src/renderer/src/assets'
  for (const name of ['zero-world.webp', 'splash-face.png', 'splash-face-32.png']) assert.equal(fs.existsSync(path.join(root, name)), false)
  for (const name of ['piston', 'brewer', 'cannon', 'cactus', 'farmer', 'camp', 'sunset']) assert.equal(fs.existsSync(path.join(root, 'launch', name + '.webp')), false)
  if (fs.existsSync(path.join(root, 'mascot-skins'))) assert.deepEqual(fs.readdirSync(path.join(root, 'mascot-skins')), [])
  assert.equal(BUILTIN_LAUNCH_IMAGES.length, 4)
  for (const image of BUILTIN_LAUNCH_IMAGES) {
    assert(image.key.startsWith('builtin:landscape-ai-'))
    assert.equal(image.generated, true)
    assert(image.author?.includes('AI'))
    assert.equal(image.optional, undefined)
    const file = path.join(root, 'launch', image.file)
    if (!fs.existsSync(file)) {
      assert.equal(image.optional, true, 'Only explicitly optional local photographs may be absent: ' + image.file)
      assert(image.sourceUrl?.startsWith('https://') && image.license, 'Missing optional photographs retain source and license records')
      continue
    }
    assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'), image.sha256)
  }
})
