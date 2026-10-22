import { app, BrowserWindow, ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { join } from 'node:path'
import { ConsentReadingGate } from '../shared/consent'
import { hasAcceptedDisclaimer, saveDisclaimerAcceptance } from './core/consentStore'

let pending: Promise<boolean> | undefined
let consentWindow: BrowserWindow | undefined
export function ensureFirstUseConsent(): Promise<boolean> {
  const file = join(app.getPath('userData'), 'consent.json')
  return hasAcceptedDisclaimer(file) ? Promise.resolve(true) : showDisclaimerWindow()
}
export function showDisclaimerWindow(review = false, parent?: BrowserWindow): Promise<boolean> {
  if (pending) { consentWindow?.show(); consentWindow?.focus(); return pending }
  const window = consentWindow = new BrowserWindow({
    width: 760, height: 730, minWidth: 620, minHeight: 560, show: false, backgroundColor: '#121713',
    title: 'ZeroDistance · 使用声明', autoHideMenuBar: true,
    ...(parent ? { parent, modal: true } : {}),
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  const gate = new ConsentReadingGate()
  pending = new Promise<boolean>(resolve => {
    let finished = false
    const active = () => !window.isDestroyed() && window.isVisible() && !window.isMinimized() && window.isFocused()
    const state = () => gate.state(performance.now(), active(), review)
    const valid = (event: IpcMainInvokeEvent) => event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame
    const broadcast = () => { if (!window.isDestroyed()) window.webContents.send('consent:state', state()) }
    const cleanup = () => { clearInterval(timer); for (const channel of ['consent:ready', 'consent:accept', 'consent:reject']) ipcMain.removeHandler(channel) }
    const finish = (accepted: boolean) => {
      if (finished) return
      finished = true; cleanup(); resolve(accepted)
      if (!window.isDestroyed()) window.destroy()
    }
    ipcMain.handle('consent:ready', event => {
      if (!valid(event)) throw new Error('无效的声明窗口')
      gate.present(performance.now(), active()); return state()
    })
    ipcMain.handle('consent:accept', event => {
      if (!valid(event)) return { ok: false, error: '无效的声明窗口' }
      if (review) { finish(true); return { ok: true } }
      if (!state().canAccept) return { ok: false, error: '请先阅读声明，显示满 3 秒后才能同意。' }
      try { saveDisclaimerAcceptance(join(app.getPath('userData'), 'consent.json'), app.getVersion()) }
      catch { return { ok: false, error: '无法保存同意记录，请检查应用数据目录的写入权限后重试。' } }
      finish(true); return { ok: true }
    })
    ipcMain.handle('consent:reject', event => { if (valid(event)) finish(false) })
    const timer = setInterval(broadcast, 100)
    window.webContents.on('did-start-loading', () => gate.reset())
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', event => event.preventDefault())
    window.on('show', broadcast); window.on('hide', broadcast); window.on('minimize', broadcast)
    window.on('restore', broadcast); window.on('focus', broadcast); window.on('blur', broadcast)
    window.once('closed', () => finish(false))
    window.once('ready-to-show', () => { window.show(); window.focus() })
    const loading = process.env.ELECTRON_RENDERER_URL
      ? window.loadURL(new URL('consent.html', process.env.ELECTRON_RENDERER_URL).toString())
      : window.loadFile(join(__dirname, '../renderer/consent.html'))
    void loading.catch(() => finish(false))
  }).finally(() => { pending = undefined; consentWindow = undefined })
  return pending
}
