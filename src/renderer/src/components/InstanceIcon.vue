<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { InstalledVersion } from '@shared/types'
import { versionIconUrl } from '../store'
import ZeroIcon from './ZeroIcon.vue'
const props = withDefaults(defineProps<{ version: InstalledVersion; size?: number }>(), { size: 32 })
const src = computed(() => versionIconUrl(props.version))
const failed = ref(false)
watch(src, () => { failed.value = false })
</script>

<template>
  <span class="instance-avatar" :style="{ width: `${size}px`, height: `${size}px` }" aria-hidden="true">
    <img v-if="src && !failed" :src="src" alt="" :class="{ pixel: version.icon?.startsWith('mob:') }" @error="failed = true" />
    <ZeroIcon v-else name="cube" :size="size * .78" />
  </span>
</template>

<style scoped>
.instance-avatar{display:inline-grid;place-items:center;flex-shrink:0;color:var(--accent);border-radius:5px;overflow:hidden;background:var(--accent-soft)}
.instance-avatar img{display:block;width:100%;height:100%;object-fit:contain;image-rendering:auto}
.instance-avatar img.pixel{image-rendering:pixelated}
</style>
