import { computed, onScopeDispose, ref, watch } from 'vue'
import { activeCarouselKeys, carouselDuration } from '@shared/appearancePolicy'
import { CarouselPlayback, type CarouselBookmark } from '@shared/carouselPlayback'
import { selectedInstance } from '../store'
import { appearancePreview } from '../visualDesign'
import { builtInLaunchImages } from '../launchImages'
import { managedImageUrl } from '../managedAssets'
import { useMotion } from '../motion'

export function useLaunchGallery() {
  const { decorativeActive } = useMotion()
  const paused = ref(false)
  const failed = ref(new Set<string>())
  const ready = new Set<string>()
  const index = ref(0)
  let player: CarouselPlayback | undefined
  let timer: ReturnType<typeof setInterval> | undefined
  let scope = ''
  let alive = true
  const bookmarks = new Map<string, CarouselBookmark>()
  const settings = computed(() => appearancePreview.value?.launchThumbnail)
  const fit = computed(() => settings.value?.fit === 'fill' ? 'fill' : settings.value?.fit === 'fit' ? 'contain' : 'cover')
  const slides = computed(() => {
    const instance = selectedInstance.value
    if (instance?.thumbnail && !failed.value.has(instance.thumbnail)) {
      return [{ key: instance.thumbnail, title: instance.id, src: managedImageUrl(instance.thumbnail), credit: '', sourceUrl: '', position: 'center 50%', fit: instance.thumbnailFit === 'fit' ? 'contain' : instance.thumbnailFit === 'fill' ? 'fill' : 'cover' }]
    }
    return activeCarouselKeys(settings.value).filter(key => !failed.value.has(key)).map(key => {
      const image = builtInLaunchImages.find(item => item.key === key)
      return {
        key, title: image?.title || key.split(/[\\/]/).at(-1)?.replace(/\.[^.]+$/, '') || '自定义图片',
        src: image?.src || managedImageUrl(key),
        credit: image?.author || image?.source || '', position: image?.position || 'center 50%',
        sourceUrl: image?.sourceUrl || '', fit: fit.value
      }
    })
  })
  const current = computed(() => slides.value[index.value] || slides.value[0])
  const scopeKey = computed(() => selectedInstance.value?.thumbnail && !failed.value.has(selectedInstance.value.thumbnail)
    ? `instance:${selectedInstance.value.folder}:${selectedInstance.value.id}` : 'global')
  const storageKey = (key: string) => `zerodistance.gallery.${key}`
  function stop() {
    if (player && scope) {
      const bookmark = timer ? player.bookmark(performance.now()) : bookmarks.get(scope) || player.bookmark(performance.now())
      bookmarks.set(scope, bookmark)
      try { localStorage.setItem(storageKey(scope), JSON.stringify(bookmark)) } catch { /* Read-only storage is supported. */ }
    }
    clearInterval(timer)
    timer = undefined
  }
  function fail(key: string) {
    if (!alive || failed.value.has(key)) return
    failed.value = new Set([...failed.value, key])
  }
  function preload() {
    for (const slide of slides.value) {
      if (ready.has(slide.key)) continue
      const img = new Image()
      img.onload = () => { if (alive) ready.add(slide.key) }
      img.onerror = () => fail(slide.key)
      img.src = slide.src
    }
  }
  function start() {
    stop()
    scope = scopeKey.value
    if (!slides.value.length) { player = undefined; index.value = 0; return }
    let bookmark = bookmarks.get(scope)
    if (!bookmark) {
      try { bookmark = JSON.parse(localStorage.getItem(storageKey(scope)) || 'null') || undefined } catch { /* Invalid bookmarks are ignored. */ }
    }
    player = new CarouselPlayback(slides.value.map(slide => ({ path: slide.key, durationMs: 1000 * carouselDuration(settings.value?.durations?.[slide.key] ?? settings.value?.intervalSeconds) })), performance.now(), bookmark)
    index.value = player.index
    bookmarks.set(scope, player.bookmark(performance.now()))
    preload()
    if (slides.value.length < 2 || !decorativeActive.value || paused.value) return
    timer = setInterval(() => {
      if (!player) return
      const now = performance.now(), next = player.peekNext(now)
      if (next !== player.index && !ready.has(slides.value[next]?.key)) return
      index.value = player.tick(now)
    }, 100)
  }
  function select(next: number) {
    const target = slides.value[next]
    if (!target) return
    stop()
    player = undefined
    bookmarks.set(scopeKey.value, { path: target.key, remainingMs: 1000 * carouselDuration(settings.value?.durations?.[target.key] ?? settings.value?.intervalSeconds) })
    start()
  }
  watch(() => JSON.stringify([slides.value, scopeKey.value, settings.value?.durations, settings.value?.intervalSeconds]), start, { immediate: true })
  watch([decorativeActive, paused], start)
  onScopeDispose(() => { stop(); alive = false })
  return { slides, current, index, paused, select, fail }
}
