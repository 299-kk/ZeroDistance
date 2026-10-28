import { httpFetch } from './httpClient'
import { CF_BUILTIN_KEY } from './curseforgeKey'
import { usesSystemProxy } from './systemDownload'

type NativeProxyResolver = (url: string) => Promise<string | undefined>
let nativeProxyResolver: NativeProxyResolver | undefined
/** The native host supplies Windows proxy/PAC resolution; Electron keeps its own transport. */
export function setNativeDownloadProxyResolver(resolver?: NativeProxyResolver): void {
  nativeProxyResolver = resolver
}

async function nativeRequest(url: string, init: Parameters<typeof httpFetch>[1]): Promise<Response> {
  init?.signal?.throwIfAborted()
  let proxyUrl: string | undefined
  try {
    const route = await nativeProxyResolver?.(url)
    if (route) {
      const parsed = new URL(route)
      if (['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password && !parsed.search && !parsed.hash) proxyUrl = parsed.href
    }
  } catch { /* Failed proxy lookup falls back to direct access. */ }
  init?.signal?.throwIfAborted()
  if (proxyUrl) {
    const connect = new AbortController(), timer = setTimeout(() => connect.abort(), 5000)
    try {
      return await httpFetch(url, { ...init, proxyUrl, signal: init?.signal ? AbortSignal.any([init.signal, connect.signal]) : connect.signal })
    } catch (error) {
      if (init?.signal?.aborted) throw error
    } finally { clearTimeout(timer) }
  }
  return httpFetch(url, init)
}

export function needsCurseForgeKey(url: string): boolean {
  const u = new URL(url)
  return u.protocol === 'https:' && u.hostname === 'edge.forgecdn.net' && /^\/files\/\d+\/\d+\//.test(u.pathname)
}

/** Recompute credentials at every redirect; an application key never reaches a mirror. */
export async function downloadFetch(url: string, init: Parameters<typeof httpFetch>[1],
  getKey = async () => process.versions.electron ? (await import('./community')).cfChannel().key : (process.env.KAMUCL_CF_API_KEY || CF_BUILTIN_KEY),
  fetcher = httpFetch): Promise<Response> {
  for (let hop = 0; hop < 10; hop++) {
    // Use the player's configured proxy/PAC immediately; keep direct transfer
    // when this URL resolves to DIRECT. Re-evaluate after every redirect.
    const requestInit = { ...init, systemProxy: init?.systemProxy || (fetcher === httpFetch && await usesSystemProxy(url)) }
    const headers = { ...init?.headers }
    if (needsCurseForgeKey(url)) headers['x-api-key'] = await getKey()
    let response: Response
    try {
      const request = { ...requestInit, headers, redirect: 'manual' as const }
      response = fetcher === httpFetch && nativeProxyResolver ? await nativeRequest(url, request) : await fetcher(url, request)
    }
    catch (error) {
      init?.signal?.throwIfAborted()
      // Node does not use the desktop's PAC/proxy/certificate store. Retry a failed
      // connection through Electron's system transport, retaining Range + validation.
      if (fetcher !== httpFetch || !process.versions.electron || requestInit.systemProxy || !(error instanceof TypeError)) throw error
      response = await httpFetch(url, { ...init, headers, redirect: 'manual', systemProxy: true })
    }
    if (![301,302,303,307,308].includes(response.status)) return response
    const location = response.headers.get('location'); await response.body?.cancel()
    if (!location) throw new Error('下载跳转缺少地址')
    const next = new URL(location, url)
    if (!['https:', 'http:'].includes(next.protocol) || (new URL(url).protocol === 'https:' && next.protocol !== 'https:')) throw new Error('下载跳转地址不安全')
    url = next.href
  }
  throw new Error('下载跳转次数过多')
}
