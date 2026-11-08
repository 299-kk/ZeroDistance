# 0.3.7 整合包下载源与断线重试

## 结论

导入整合包时，清单文件来自 CurseForge 或 Modrinth。启动器在此前版本已经默认使用国内镜像优先，但有两个问题会让“断连”变成整包失败：

1. 单个文件在一轮里通常只尝试两个地址（镜像、官方）各一次，随后 `downloadAll` 直接中止整批任务。一个文件遇到瞬时断连，整个整合包就报“下载失败”。
2. Modrinth 的国内线路会被区域跳转到 `cdn-alt.modrinth.com`；该域名在部分网络无法解析。此前没有回退到 `cdn.modrinth.com` 同一对象。

0.3.7 让失败文件自动等待并重试，其他文件继续下载；已完成并通过大小、SHA1/SHA512 校验的缓存文件保留，重试只补齐缺失部分。

## 当前下载源

| 内容 | 国内镜像优先（默认） | 回退 |
| --- | --- | --- |
| Minecraft 版本、资源、依赖库、加载器 | BMCLAPI（`bmclapi2.bangbang93.com`） | Mojang / Fabric / Forge / NeoForge 官方 |
| CurseForge 文件信息 | MCIM（`mod.mcimirror.top/curseforge/v1`） | `api.curseforge.com`（需要 API Key 时只发给官方域名） |
| CurseForge 文件本体 | MCIM（命中缓存时 301 到 OpenMCIM 国内节点） | `mediafilez.forgecdn.net`、`edge.forgecdn.net` |
| Modrinth 文件信息 | MCIM（`mod.mcimirror.top/modrinth/v2`） | `api.modrinth.com/v2` |
| Modrinth 文件本体 | MCIM（命中缓存时 301 到 OpenMCIM 国内节点） | `cdn.modrinth.com`、`cdn-raw.modrinth.com`；区域跳转 `cdn-alt` 解析失败时回到 `cdn.modrinth.com` |

设置 → 下载 → 下载镜像 可在“国内镜像优先（推荐）”和“官方源（海外，可能较慢）”之间切换。两种模式都会校验文件大小和哈希，镜像不能改变可信内容。

## 本机实测（2026-11-07，当前网络）

只测量单次连接，不代表所有运营商或时段：

- CurseForge 文件：`mediafilez.forgecdn.net` 约 0.58 MB/s；经 MCIM 入口重定向后约 0.98 MB/s。MCIM 对已缓存的 CurseForge 文件会转到国内对象存储。
- Modrinth 文件：`cdn.modrinth.com` 约 15–39 KB/s，`cdn-raw.modrinth.com` 约 25–45 KB/s；未缓存文件的 MCIM 入口会 302 回 `cdn.modrinth.com`，不能加速。
- `cdn-alt.modrinth.com` 在本机公共 DNS 与本地 DNS 均无解析结果；0.3.7 在连接失败时自动改写为 `cdn.modrinth.com`。
- MCIM 说明其只缓存 Mod 等文件，未缓存内容回源；大型整合包、资源包和光影仍可能依赖官方 CDN。见 [MCIM 文档](https://docs.mcimirror.top/)。

因此国内源可以覆盖 Minecraft 本体、依赖库、已缓存的 CurseForge 文件和部分热门 Modrinth 模组；未缓存的 Modrinth 大文件仍可能很慢。0.3.7 不承诺固定速度，只保证瞬时断连不再让整包直接失败。

## 实现

- `downloadCandidates`：Modrinth 版本文件同时给出 MCIM、`cdn.modrinth.com`、`cdn-raw.modrinth.com`；CurseForge 保留 mediafilez/edge 两个同对象入口。
- `downloadFile`：按“源列表轮次”重试，瞬时错误不会被永久跳过，404/403 等确定性失败只在该源上跳过。
- `downloadAll`：按轮次重跑失败文件，默认最多三轮，轮间退避；取消仍立即中断。进度中心显示等待重试的文件数。
- `downloadFetch`：遇到 `cdn-alt.modrinth.com` 连接失败时回到 `cdn.modrinth.com`，不改变路径、Range 或校验。
- `exactModrinthDownload`：按 SHA1 精确匹配时接受 `cdn-raw.modrinth.com` 的地址。

## 验证

- 新增 `tests/download-resilience-0307.test.ts`：镜像/双 CDN 候选、`cdn-alt` 回退、连续 5 次 503 后整批重试成功、单文件失败不中断其他文件、磁盘错误不重试。
- 下载相关回归 63 项通过，包含取消、暂停、限速、Range 回退、慢速切源、缓存复用和 CurseForge 认证跳转。
- `npm test` 91 项通过；`tests/download-resilience-0307.test.ts` 已加入该发布检查列表。
- TypeScript 类型检查通过。
- 聚合入口 `tests/all.test.ts` 仍包含指向本分支已移除的上游界面组件与吉祥物素材的旧测试，本版未把它作为发布门禁；发布门禁为 `npm test` 与下载定向回归。

## 边界

- 镜像为第三方服务，可用性和速度随地区、运营商和时段变化；未缓存的大文件仍可能较慢或失败。
- 重试会增加失败场景的总耗时；用户取消、关闭启动器或磁盘/权限错误不会继续重试。
- 本版没有替用户修改系统代理、DNS 或网络设置。
