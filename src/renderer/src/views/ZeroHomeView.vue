<script setup lang="ts">
import { computed, ref } from 'vue'
import { updateNotes } from '@shared/updateNotes'
import ZeroIcon from '../components/ZeroIcon.vue'
import InstanceIcon from '../components/InstanceIcon.vue'
import VersionSize from '../components/VersionSize.vue'
import { selectedInstance, selectInstance, displayVersionName, fmtLastPlayed, store, toast, progressMono } from '../store'
import { errText, launchGame, openGameFolder, selectFile } from '../api'
import { openInstanceCenter } from '../instanceCenter'
import type { CommunityKind, InstalledVersion } from '@shared/types'
import { useLaunchGallery } from '../composables/useLaunchGallery'

const appVersion = __APP_VERSION__
const releasePhase = updateNotes.find(note => note.version === appVersion)?.phase
const releaseLabel = releasePhase === 'preview' ? '预览测试' : releasePhase === 'validation' ? '迁移验证' : 'Preview'
const current = selectedInstance
const { slides, current: photo, index: photoIndex, paused: galleryPaused, select: selectPhoto, fail: photoFailed } = useLaunchGallery()
const launchPending = ref(false)
const launching = computed(() => launchPending.value || store.launchState?.status === 'launching')
const launchPercent = computed(() => store.progress ? Math.round(progressMono(store.progress) * 100) : 0)
const recent = computed(() => [...store.allInstalled].sort((a, b) => (store.lastPlayed[b.id] || 0) - (store.lastPlayed[a.id] || 0)).slice(0, 3))
const accountType = computed(() => store.selectedAccount?.type === 'microsoft' ? '微软正版' : store.selectedAccount?.type === 'offline' ? '离线模式' : store.selectedAccount ? '外置认证' : '尚未选择账号')
const running = computed(() => Object.values(store.launchStates).filter(s => s.status === 'running'))
const runningCount = computed(() => new Set(running.value.map(s => `${s.folder}/${s.versionId}`)).size)
const currentRunning = computed(() => running.value.some(s => s.versionId === current.value?.id && s.folder === current.value?.folder))
const launchLabel = computed(() => launching.value ? `正在启动 ${launchPercent.value}%` : current.value ? currentRunning.value ? '新开一个窗口' : '启动游戏' : store.allInstalled.length ? '选择游戏' : '安装游戏')
function install() { store.gamePageTab = 'download'; store.currentView = 'game' }
function discover(kind: CommunityKind = 'mod') { store.communityKind = kind; store.currentView = 'community' }
function connect(method: typeof store.connectMethod = 'choose') { store.connectMethod = method; store.currentView = 'friends' }
async function launch(version: InstalledVersion | undefined = current.value) {
  if (launching.value) return
  if (!version) { if (store.allInstalled.length) { store.gamePageTab = 'installed'; store.currentView = 'game' } else install(); return }
  if (!store.selectedAccount) { store.currentView = 'accounts'; toast('添加或选择一个账号，即可开始游戏', 'info'); return }
  launchPending.value = true
  try {
    await selectInstance(version.id, version.folder)
    store.launchingVersionId = version.id
    store.launchingFolder = version.folder
    store.launchState = { status: 'launching', text: '正在准备启动…' }
    await launchGame(version.id, undefined, version.folder)
  } catch (e) { store.launchState = { status: 'error', text: errText(e) }; toast(errText(e), 'error') }
  finally { launchPending.value = false }
}
async function importPack() {
  try { const file = await selectFile(); if (file) store.importHandler?.(file) }
  catch (e) { toast(errText(e), 'error') }
}
async function openFolder() {
  try { if (store.settings?.activeFolder) await openGameFolder(store.settings.activeFolder) }
  catch (e) { toast(errText(e), 'error') }
}
const shortcuts = [
  { title: '模组与资源包', text: '下载模组、光影、资源包和数据包。', tag: 'MODRINTH', icon: 'spark', kind: 'mod' as CommunityKind, style: 'green' },
  { title: '整合包', text: '按游戏版本筛选并安装整合包。', tag: 'MODPACKS', icon: 'cube', kind: 'modpack' as CommunityKind, style: 'blue' },
]
</script>

<template>
  <div class="zd-home">
    <header class="zd-home-head">
      <div><p class="zd-eyebrow">ZERODISTANCE</p><h1>启动台</h1><p class="zd-head-sub">{{ store.selectedAccount ? `当前账号：${store.selectedAccount.username} · ${accountType}` : '添加账号，安装或选择游戏版本。' }}</p></div>
      <span class="zd-build-tag"><i></i> ZeroDistance <span>{{ appVersion }} · {{ releaseLabel }}</span></span>
    </header>

    <section class="zd-hero" :class="{ 'no-photo': !photo }" aria-label="游戏启动">
      <Transition name="photo-fade"><img v-if="photo" :key="photo.key" :data-photo-key="photo.key" class="zd-hero-art" :src="photo.src" :alt="photo.title" :style="{ objectFit: photo.fit as 'cover' | 'contain' | 'fill', objectPosition: photo.position }" fetchpriority="high" @error="photoFailed(($event.target as HTMLImageElement).dataset.photoKey || '')" /></Transition>
      <div class="zd-hero-shade"></div>
      <div class="zd-hero-copy"><span class="zd-hero-label"><span class="zd-tiny-block"></span> MINECRAFT: JAVA EDITION</span><h2>{{ current ? displayVersionName(current) : 'Minecraft Java 版' }}</h2><p>{{ current ? `${current.mcVersion} · ${current.loader || '原版'}` : store.allInstalled.length ? '从下方选择游戏版本，即可启动。' : '安装游戏后，在这里选择并启动。' }}</p></div>
      <span v-if="photo" class="zd-hero-caption"><a v-if="photo.sourceUrl" :href="photo.sourceUrl" target="_blank" rel="noopener noreferrer">{{ photo.title }}<span v-if="photo.credit"> · {{ photo.credit }}</span></a><span v-else>{{ photo.title }}<span v-if="photo.credit"> · {{ photo.credit }}</span></span></span>
      <div v-if="slides.length > 1" class="zd-gallery-controls" aria-label="启动台图片轮播"><button aria-label="上一张图片" @click="selectPhoto((photoIndex - 1 + slides.length) % slides.length)">‹</button><span class="zd-photo-count">{{ photoIndex + 1 }} / {{ slides.length }}</span><button aria-label="下一张图片" @click="selectPhoto((photoIndex + 1) % slides.length)">›</button><button :aria-label="galleryPaused ? '播放图片轮播' : '暂停图片轮播'" :aria-pressed="galleryPaused" @click="galleryPaused = !galleryPaused"><ZeroIcon :name="galleryPaused ? 'play' : 'pause'" :size="13" /></button></div>
      <div class="zd-launch-bar">
        <button class="zd-selected-game" @click="store.gamePageTab = 'installed'; store.currentView = 'game'">
          <span class="zd-game-symbol"><ZeroIcon name="cube" :size="24" /></span>
          <span><strong>{{ current ? displayVersionName(current) : '未选择游戏' }}</strong><small>{{ current ? `${current.mcVersion} · ${current.loader || '原版'} · ${accountType}` : store.allInstalled.length ? '选择已导入的游戏' : '安装原版，或导入整合包' }}</small></span>
          <ZeroIcon name="chevron" :size="15" />
        </button>
        <div class="zd-launch-actions"><button v-if="current" class="zd-launch-settings" aria-label="实例设置" title="实例设置" @click="openInstanceCenter(current)"><ZeroIcon name="settings" /></button><button class="zd-play-button" :disabled="launching" @click="launch()"><ZeroIcon :name="current ? 'play' : 'plus'" :size="17" />{{ launchLabel }}<span v-if="!launching">↗</span></button></div>
      </div>
    </section>

    <div class="zd-session-strip" role="status" :class="{ active: runningCount }"><span class="zd-session-dot"></span><strong>{{ runningCount ? `目前已启动 ${runningCount} 个游戏版本` : launching ? "正在准备游戏" : "当前没有运行中的游戏" }}</strong><span>{{ runningCount ? `${running.length} 个游戏进程 · 退出后会自动更新` : "启动结果会显示在这里" }}</span><button v-if="runningCount" @click="store.currentView = 'game'">查看游戏 →</button></div>
    <div class="zd-dashboard">
      <section class="zd-library">
        <div class="zd-section-head"><h2>我的游戏 <span>{{ store.allInstalled.length.toString().padStart(2, '0') }}</span></h2><button class="zd-text-link" @click="store.gamePageTab = 'installed'; store.currentView = 'game'">管理游戏 <ZeroIcon name="right" :size="14" /></button></div>
        <div v-if="!recent.length" class="zd-empty-library"><span class="zd-empty-icon"><ZeroIcon name="cube" :size="28" /></span><div><h3>还没有游戏</h3><p>安装 Minecraft，或导入本地整合包。</p></div><div class="zd-empty-actions"><button class="zd-outline-button" @click="install"><ZeroIcon name="plus" :size="15" />安装游戏</button><button class="zd-text-link" @click="importPack">导入整合包</button></div></div>
        <div v-else class="zd-instance-list"><div v-for="version in recent" :key="version.folder + version.id" class="zd-instance" :class="{ selected: current?.id === version.id && current?.folder === version.folder }"><button class="zd-instance-select" @click="selectInstance(version.id, version.folder)"><InstanceIcon :version="version" :size="33" /><span><strong>{{ displayVersionName(version) }}</strong><small>{{ version.mcVersion }} · {{ version.loader || 'Vanilla' }}<span>· {{ fmtLastPlayed(store.lastPlayed[version.id]) }}</span></small><VersionSize :version="version" /></span></button><button class="zd-instance-play" :disabled="launching" :aria-label="`启动 ${displayVersionName(version)}`" @click="launch(version)"><ZeroIcon name="play" :size="16" /></button><button class="zd-instance-more" :aria-label="`管理 ${displayVersionName(version)}`" @click="openInstanceCenter(version)">···</button></div></div>
        <div class="zd-library-footer"><span><ZeroIcon name="shield" :size="13" />实例占用不重复计入共享库与资源</span><button title="打开游戏目录" aria-label="打开游戏目录" @click="openFolder"><ZeroIcon name="folder" :size="16" /></button></div>
      </section>

      <section class="zd-connect-card">
        <div class="zd-connect-top"><span class="zd-connect-icon"><ZeroIcon name="users" :size="21" /></span><span class="zd-card-tag">MULTIPLAYER</span><ZeroIcon name="arrow" :size="17" /></div>
        <h2>好友联机</h2><p>创建房间，或加入好友的游戏。</p>
        <div class="zd-connect-methods"><span><i></i>内网穿透</span><span><i></i>虚拟局域网</span><span><i></i>房间码联机</span></div>
        <button class="zd-connect-button" @click="connect()">选择联机方式 <ZeroIcon name="right" :size="16" /></button>
      </section>
    </div>

    <section class="zd-explore">
      <div class="zd-section-head"><h2>下载资源</h2><button class="zd-text-link" @click="discover()">发现资源 <ZeroIcon name="right" :size="14" /></button></div>
      <div class="zd-explore-grid"><button v-for="item in shortcuts" :key="item.tag" class="zd-explore-card" :class="item.style" @click="discover(item.kind)"><div class="zd-explore-illustration"><ZeroIcon :name="item.icon" :size="34" /><i></i><b></b></div><div><small>{{ item.tag }}</small><h3>{{ item.title }}</h3><p>{{ item.text }}</p></div><ZeroIcon name="arrow" :size="18" /></button></div>
    </section>
    <footer class="zd-home-footer"><span><span class="zd-footer-dot"></span>游戏和账号数据保存在本机</span><span>ZeroDistance <i>·</i> {{ appVersion }} · {{ releaseLabel }}</span></footer>
  </div>
</template>

<style scoped>
.zd-home{max-width:1400px;margin:0 auto;color:var(--text)}
.zd-home-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:25px}.zd-eyebrow{font-size:9px;letter-spacing:2px;color:var(--text-dim);margin-bottom:8px}.zd-home-head h1{font-size:27px;font-weight:650;letter-spacing:-.8px;line-height:1.3}.zd-greeting-dot{color:var(--accent);margin-left:3px}.zd-head-sub{font-size:11px;color:var(--text-dim);margin-top:6px}.zd-build-tag{display:flex;align-items:center;gap:7px;font-size:10px;color:var(--text-dim)}.zd-build-tag>span{font-size:8px;letter-spacing:1px;margin-left:3px;opacity:.6}.zd-build-tag i,.zd-footer-dot{width:5px;height:5px;border-radius:50%;background:var(--accent);display:inline-block}
.zd-hero{height:309px;position:relative;overflow:hidden;border-radius:13px;border:1px solid #b6d3b52a;background:#192c25}.zd-hero-art{width:100%;height:100%;object-fit:cover;object-position:center 45%;position:absolute;inset:0}.zd-hero-shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(7,23,17,.83),rgba(7,20,15,.45) 42%,transparent 75%),linear-gradient(0deg,rgba(9,19,14,.55),transparent 60%)}.zd-hero-copy{position:absolute;top:29px;left:31px}.zd-hero-label{display:flex;gap:7px;align-items:center;font-size:9px;letter-spacing:1.8px;color:#e0e9d7}.zd-tiny-block{width:8px;height:8px;background:#c5f277;box-shadow:3px -3px 0 #c5f27766}.zd-hero-copy h2{font-size:35px;line-height:1.35;font-weight:680;letter-spacing:1px;color:white;margin-top:16px}.zd-hero-copy p{font-size:11px;color:#d2dccc;margin-top:12px;letter-spacing:.5px}.zd-hero-caption{position:absolute;right:27px;top:30px;color:#e6eee1a3;font-size:8px;letter-spacing:2px}.zd-launch-bar{display:flex;justify-content:space-between;align-items:center;gap:12px;position:absolute;bottom:0;left:0;right:0;padding:14px 23px;background:rgba(13,24,17,.82);border-top:1px solid #c5e9ce25;backdrop-filter:blur(20px)}.zd-selected-game{border:0;background:transparent;color:#f0f4eb;display:flex;align-items:center;gap:12px;min-width:0;text-align:left;cursor:pointer}.zd-selected-game>span:nth-child(2){display:grid;gap:5px;min-width:0}.zd-selected-game strong{font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:330px}.zd-selected-game small{font-size:9px;color:#99a795}.zd-selected-game>svg{color:#99a795;margin-left:14px}.zd-game-symbol{display:grid;place-items:center;width:39px;height:39px;color:#c5f277;background:#c5f27713;border:1px solid #c5f27720;border-radius:9px}.zd-launch-actions{display:flex;gap:10px;flex-shrink:0}.zd-launch-settings{width:43px;border:1px solid #ffffff20;border-radius:8px;background:#ffffff08;display:grid;place-items:center;color:#dbe5d3;cursor:pointer}.zd-play-button{border:0;border-radius:8px;background:#c5f277;color:#1b2c11;font-size:12px;font-weight:700;height:43px;padding:0 18px;display:flex;align-items:center;gap:10px;cursor:pointer;transition:background .15s,transform .15s}.zd-play-button>span{margin-left:20px}.zd-play-button:hover{background:#d6ff9c;transform:translateY(-1px)}.zd-play-button:disabled{opacity:.6;cursor:wait;transform:none}
.zd-dashboard{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(265px,1fr);gap:23px;margin-top:27px}.zd-section-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:15px}.zd-section-head h2{font-size:14px;font-weight:600;display:flex;align-items:center;gap:9px}.zd-section-head h2>span{font-family:Consolas,monospace;font-weight:400;font-size:10px;color:var(--text-dim);border:1px solid var(--border);padding:1px 5px;border-radius:4px}.zd-text-link{border:0;background:transparent;color:var(--text-dim);font-size:10px;display:inline-flex;gap:7px;align-items:center;cursor:pointer;padding:3px 0}.zd-text-link:hover{color:var(--accent)}.zd-empty-library{min-height:140px;border:1px dashed color-mix(in srgb,var(--border) 65%,var(--text-dim));border-radius:10px;display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:14px;padding:20px;background:color-mix(in srgb,var(--card) 25%,transparent)}.zd-empty-icon{width:48px;height:48px;border:1px solid var(--border);background:var(--card);border-radius:12px;display:grid;place-items:center;color:var(--text-dim)}.zd-empty-library h3{font-size:12px;font-weight:500}.zd-empty-library p{font-size:10px;color:var(--text-dim);margin-top:7px}.zd-empty-actions{display:flex;align-items:center;justify-content:center;gap:16px;flex-basis:100%}.zd-outline-button{border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--text);padding:7px 10px;display:flex;align-items:center;gap:6px;font-size:10px;cursor:pointer}.zd-outline-button:hover{border-color:var(--accent);color:var(--accent)}.zd-library-footer{display:flex;justify-content:space-between;align-items:center;margin-top:9px}.zd-library-footer>span{display:flex;align-items:center;gap:6px;font-size:9px;color:var(--text-dim);opacity:.7}.zd-library-footer>button{border:0;background:transparent;color:var(--text-dim);cursor:pointer;padding:3px}.zd-instance-list{display:grid;gap:7px}.zd-instance{display:flex;align-items:center;border:1px solid var(--border);border-radius:8px;background:var(--card);padding:10px 12px;gap:8px}.zd-instance.selected{border-color:color-mix(in srgb,var(--accent) 40%,var(--border))}.zd-instance-select{border:0;background:transparent;color:var(--text);display:flex;align-items:center;gap:11px;text-align:left;flex:1;min-width:0;cursor:pointer}.zd-instance-select>img{width:33px;height:33px;image-rendering:pixelated}.zd-instance-select>span{display:grid;gap:5px;min-width:0}.zd-instance-select strong{font-size:11px;font-weight:500;text-overflow:ellipsis;overflow:hidden;white-space:nowrap}.zd-instance-select small{font-size:9px;color:var(--text-dim)}.zd-instance-select small span{margin-left:5px}.zd-instance-play,.zd-instance-more{background:transparent;border:0;display:grid;place-items:center;color:var(--text-dim);padding:7px;cursor:pointer}.zd-instance-play:hover{color:var(--accent)}.zd-instance-more{font-size:18px}
.zd-connect-card{border:1px solid var(--border);border-radius:11px;padding:19px 20px 16px;background:radial-gradient(ellipse at top right,var(--accent-soft),transparent 80%)}.zd-connect-top{display:flex;align-items:center;gap:10px}.zd-connect-icon{width:32px;height:32px;border-radius:8px;background:var(--accent-soft);display:grid;place-items:center;color:var(--accent)}.zd-card-tag{font-size:8px;letter-spacing:1.7px;color:var(--text-dim);flex:1}.zd-connect-top>svg{color:var(--text-dim);opacity:.5}.zd-connect-card h2{font-size:20px;font-weight:600;letter-spacing:.4px;margin-top:13px}.zd-connect-card p{font-size:10px;color:var(--text-dim);margin-top:7px}.zd-connect-methods{display:flex;gap:12px;margin-top:16px}.zd-connect-methods>span{font-size:8px;color:var(--text-dim);display:flex;align-items:center;gap:4px}.zd-connect-methods i{width:3px;height:3px;border-radius:50%;background:var(--accent);opacity:.7}.zd-connect-button{margin-top:17px;display:flex;justify-content:space-between;align-items:center;width:100%;height:33px;border:1px solid color-mix(in srgb,var(--accent) 23%,var(--border));border-radius:6px;background:var(--accent-soft);color:var(--accent);padding:0 11px;font-size:10px;cursor:pointer}.zd-connect-button:hover{border-color:var(--accent)}
.zd-explore{margin-top:23px}.zd-explore-grid{display:grid;grid-template-columns:1fr 1fr;gap:15px}.zd-explore-card{position:relative;display:flex;align-items:center;text-align:left;gap:16px;border:1px solid var(--border);border-radius:10px;background:var(--card);color:var(--text);padding:17px 19px;cursor:pointer;overflow:hidden;transition:border-color .15s}.zd-explore-card:hover{border-color:var(--text-dim)}.zd-explore-card>svg{color:var(--text-dim);margin-left:auto;flex-shrink:0}.zd-explore-illustration{width:56px;height:58px;flex-shrink:0;display:grid;place-items:center;position:relative;color:#bbde86;border-radius:10px;background:linear-gradient(145deg,#89bc5b22,#89bc5b05)}.zd-explore-illustration>svg{position:relative;z-index:1}.zd-explore-illustration i{position:absolute;width:25px;height:25px;border:1px solid #b5df7b25;transform:rotate(30deg);bottom:3px;right:0}.zd-explore-illustration b{position:absolute;width:5px;height:5px;background:#c5f277;top:7px;right:8px;opacity:.6}.blue .zd-explore-illustration{color:#8dbacb;background:linear-gradient(145deg,#8dbacb22,#8dbacb05)}.blue .zd-explore-illustration i{border-color:#8dbacb25}.blue .zd-explore-illustration b{background:#8dbacb}.zd-explore-card small{font-size:8px;letter-spacing:1.6px;color:var(--text-dim)}.zd-explore-card h3{font-size:12px;font-weight:600;margin-top:6px}.zd-explore-card p{font-size:9px;color:var(--text-dim);margin-top:6px;line-height:1.6}.zd-home-footer{display:flex;justify-content:space-between;align-items:center;margin-top:25px;color:var(--text-dim);opacity:.55;font-size:8px}.zd-home-footer>span:first-child{display:flex;align-items:center;gap:6px}.zd-footer-dot{width:4px;height:4px}.zd-home-footer i{margin:0 5px;font-style:normal}
@media(min-width:1500px){.zd-hero{height:360px}.zd-hero-copy{top:40px}.zd-hero-copy h2{font-size:42px}.zd-hero-copy p{font-size:13px}.zd-dashboard{grid-template-columns:1.65fr 1fr}.zd-empty-library{min-height:150px}.zd-explore-card{padding:22px}.zd-explore-card h3{font-size:14px}}
@media(max-width:1100px){.zd-build-tag{display:none}.zd-hero{height:290px}.zd-hero-copy{left:25px}.zd-hero-copy h2{font-size:31px}.zd-dashboard{gap:16px;grid-template-columns:minmax(0,1.3fr) minmax(250px,1fr)}.zd-empty-library{padding:16px 10px;gap:12px}.zd-empty-library p{font-size:9px}.zd-selected-game strong{max-width:230px}.zd-hero-caption{font-size:7px}.zd-explore-card{padding:15px 12px;gap:11px}.zd-explore-card p{font-size:8px}.zd-explore-illustration{width:44px}.zd-home-head{margin-bottom:21px}.zd-connect-card{padding:17px}.zd-connect-methods{gap:8px}}
@media(prefers-reduced-motion:reduce){.zd-play-button{transition:none}.zd-play-button:hover{transform:none}}
.zd-hero-copy h2{font-size:28px;max-width:650px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;letter-spacing:0}.zd-hero-caption{letter-spacing:0;font-size:10px}.zd-hero-caption a{color:inherit;text-decoration:none}.zd-gallery-controls{position:absolute;right:23px;bottom:86px;display:flex;align-items:center;gap:7px;background:#101a16a8;border:1px solid #ffffff25;border-radius:8px;padding:3px 5px;color:#f1f4ee;backdrop-filter:blur(12px)}.zd-gallery-controls button{width:26px;height:25px;border:0;background:transparent;border-radius:4px;color:inherit;font-size:17px;cursor:pointer}.zd-gallery-controls button:hover{background:#ffffff20}.zd-photo-count{font-size:10px;min-width:35px;text-align:center;font-variant-numeric:tabular-nums}.photo-fade-enter-active,.photo-fade-leave-active{transition:opacity .5s ease}.photo-fade-enter-from,.photo-fade-leave-to{opacity:0}@media(prefers-reduced-motion:reduce){.photo-fade-enter-active,.photo-fade-leave-active{transition:none}}
.zd-hero.no-photo{background:var(--card-solid,var(--bg))}.no-photo .zd-hero-shade{display:none}.no-photo .zd-hero-copy h2,.no-photo .zd-hero-label{color:var(--text)}.no-photo .zd-hero-copy p{color:var(--text-dim)}
.zd-hero-caption{top:15px;right:16px;padding:5px 8px;border-radius:5px;background:#101a167a;border:1px solid #ffffff20;color:#eef2ea}.zd-gallery-controls button{display:grid;place-items:center}
@media(max-height:900px) and (min-width:1101px){.zd-hero{height:275px}.zd-home-head{margin-bottom:21px}.zd-home-head h1{font-size:25px}.zd-eyebrow{margin-bottom:6px}.zd-head-sub{margin-top:4px}.zd-dashboard{margin-top:22px}.zd-connect-card{padding:16px 18px 14px}.zd-connect-icon{width:28px;height:28px}.zd-connect-card h2{font-size:18px;margin-top:10px}.zd-connect-methods{margin-top:12px}.zd-connect-button{margin-top:13px;height:30px}.zd-explore{margin-top:20px}.zd-explore-card{padding:13px 17px}.zd-home-footer{margin-top:19px}}
</style>
