<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import { DISCLAIMER, CONSENT_READING_MS, type ConsentState } from '@shared/consent'
import mark from '../assets/zero-mark.svg'
const state = ref<ConsentState>({ version: DISCLAIMER.version, remainingMs: CONSENT_READING_MS, canAccept: false, review: false })
const busy = ref(false), error = ref('')
let off: (() => void) | undefined
async function accept() {
  if (busy.value || (!state.value.review && !state.value.canAccept)) return
  busy.value = true; error.value = ''
  try { const result = await window.kamucl.invoke('consent:accept') as { ok: boolean; error?: string }; if (!result.ok) error.value = result.error || '暂时无法保存，请重试。' }
  catch { error.value = '暂时无法保存，请重试。' }
  finally { busy.value = false }
}
const reject = () => void window.kamucl.invoke('consent:reject')
const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') reject() }
onMounted(async () => {
  off = window.kamucl.on('consent:state', value => { state.value = value as ConsentState })
  window.addEventListener('keydown', escape)
  await nextTick(); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  try { state.value = await window.kamucl.invoke('consent:ready') as ConsentState }
  catch { error.value = '无法读取使用声明，请关闭窗口后重新打开软件。' }
})
onUnmounted(() => { off?.(); window.removeEventListener('keydown', escape) })
</script>

<template>
  <main class="consent-page">
    <header><img :src="mark" alt="" /><div><small>ZERODISTANCE</small><h1>{{ DISCLAIMER.title }}</h1></div><span>版本 {{ DISCLAIMER.version }}</span></header>
    <p class="consent-intro">{{ DISCLAIMER.introduction }}</p>
    <article class="consent-body" tabindex="0" aria-label="使用声明正文">
      <section v-for="section in DISCLAIMER.sections" :key="section.title" :class="{ important: section.important }"><h2>{{ section.title }}</h2><p>{{ section.text }}</p></section>
    </article>
    <p v-if="error" class="consent-error" role="alert">{{ error }}</p>
    <footer>
      <p aria-live="polite">{{ state.review ? '本次查看不会修改已保存的同意记录。' : state.canAccept ? '请确认已阅读以上内容，再选择是否同意。' : `请阅读声明，${Math.ceil(state.remainingMs / 1000)} 秒后可以同意。切换到其他窗口会暂停计时。` }}</p>
      <div><button v-if="!state.review" class="secondary" @click="reject">不同意并退出</button><button class="primary" :disabled="busy || (!state.review && !state.canAccept)" @click="accept">{{ state.review ? '关闭' : busy ? '正在保存…' : state.canAccept ? '同意并继续' : `同意并继续（${Math.ceil(state.remainingMs / 1000)} 秒）` }}</button></div>
    </footer>
  </main>
</template>

<style>
*{box-sizing:border-box}html,body,#app{margin:0;width:100%;height:100%}body{font-family:'Segoe UI','Microsoft YaHei',sans-serif;background:#121713;color:#edf1e9;color-scheme:dark}.consent-page{height:100%;padding:28px 30px 22px;display:flex;flex-direction:column;gap:18px}.consent-page header{display:flex;align-items:center;gap:13px}.consent-page header img{width:43px;height:43px}.consent-page small{font-size:10px;letter-spacing:2px;color:#9ba794}.consent-page h1{font-size:23px;line-height:1.4;margin:3px 0 0;font-weight:650}.consent-page header>span{margin-left:auto;font-size:10px;color:#93a08f}.consent-intro{font-size:13px;line-height:1.9;margin:0;color:#b6c1b1}.consent-body{flex:1;min-height:0;overflow:auto;border:1px solid #2b342b;border-radius:11px;padding:6px 22px 20px;background:#1b211c;scrollbar-color:#4e5e48 transparent}.consent-body section{padding-top:15px}.consent-body h2{font-size:14px;line-height:1.5;margin:0 0 7px;color:#e5ebdf}.consent-body p{font-size:12px;line-height:1.9;margin:0;color:#b5c0b0}.consent-body .important{border-left:2px solid #c5f277;padding-left:13px;margin-left:-14px}.consent-body .important h2{color:#d2f79e}.consent-body .important p{color:#e0e9d9}.consent-page footer{flex-shrink:0}.consent-page footer>p{min-height:32px;margin:0 0 10px;color:#93a08f;font-size:11px;line-height:1.6}.consent-page footer>div{display:flex;justify-content:flex-end;gap:11px}.consent-page button{font:600 13px 'Segoe UI','Microsoft YaHei',sans-serif;border-radius:8px;padding:11px 20px;border:1px solid #354131;cursor:pointer}.consent-page .primary{background:#c5f277;color:#1c2c12;min-width:170px;border-color:transparent}.consent-page .primary:disabled{background:#34422d;color:#879a79;cursor:not-allowed}.consent-page .secondary{background:transparent;color:#bcc6b5}.consent-page button:focus-visible,.consent-body:focus-visible{outline:2px solid #c5f277;outline-offset:3px}.consent-error{font-size:12px;color:#ff9191;margin:0}
</style>
