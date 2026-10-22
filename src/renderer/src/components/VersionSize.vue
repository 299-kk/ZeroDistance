<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { formatBytes } from '@shared/versionPresentation'
import type { InstalledVersion } from '@shared/types'
import { getInstanceSize, getVersionDownloadSize } from '../api'
import { store } from '../store'
import { queueSize } from '../sizeQueue'
const props = defineProps<{ version?: InstalledVersion; remote?: string }>()
const root = ref<HTMLElement>(), text = ref('计算大小…'), detail = ref(''), failed = ref(false)
let observer: IntersectionObserver | undefined, request = 0, visible = false
async function load() {
  if (!visible) return
  const revision = ++request; text.value = '计算大小…'; failed.value = false
  try {
    if (props.version) {
      const version = props.version
      const size = await queueSize(() => getInstanceSize(version.id, version.folder))
      if (revision !== request) return
      text.value = `${size.partial ? '≥ ' : ''}${formatBytes(size.bytes)}`
      detail.value = `实例文件占用，${size.files} 个文件；共享 libraries、assets 与共享游戏目录不重复计入。${size.partial ? '部分文件无法读取或扫描达到上限，可点击重试。' : '点击重新计算。'}`
    } else if (props.remote) {
      const id = props.remote
      const size = await queueSize(() => getVersionDownloadSize(id))
      if (revision !== request) return
      text.value = `${size.partial ? '≥ ' : '约 '}${formatBytes(size.bytes)}`
      detail.value = '原版完整下载估算：客户端、当前系统依赖库及资源；已缓存文件会复用。加载器、Java 与模组另计。'
    }
  } catch {
    if (revision !== request) return
    text.value = '大小暂不可用'; detail.value = '点击重试'; failed.value = true
  }
}
watch(() => [props.version?.folder, props.version?.id, props.remote, store.fsRefreshTick], () => void load())
onMounted(() => {
  observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { visible = true; observer?.disconnect(); void load() } }, { rootMargin: '60px' })
  if (root.value) observer.observe(root.value)
})
onUnmounted(() => { request++; observer?.disconnect() })
</script>
<template><button ref="root" class="version-size" :class="{ unavailable: failed }" :title="detail" :aria-label="`${version ? '实例占用' : '预计下载'}：${text}，点击刷新`" @click.stop="load">{{ text }}</button></template>
<style scoped>.version-size{font:inherit;font-size:11px;font-variant-numeric:tabular-nums;color:var(--text-dim);background:var(--card-2);border:1px solid var(--border);border-radius:6px;padding:4px 8px;white-space:nowrap;cursor:pointer}.version-size:hover{color:var(--accent);border-color:var(--accent)}.unavailable{opacity:.7}</style>
