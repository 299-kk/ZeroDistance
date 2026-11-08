# ZeroDistance 0.3.7 Preview

0.3.7 修复整合包导入时单个文件断连导致整批下载失败的问题：失败文件会等待后自动重试，已完成并校验的文件继续保留。下载源保持“国内镜像优先”：Minecraft 资源走 BMCLAPI，CurseForge 与 Modrinth 文件先尝试 MCIM 国内缓存，未缓存或不可用时回退官方 CDN；Modrinth 同时保留 cdn.modrinth.com 与 cdn-raw.modrinth.com 两个入口。

内置四张 AI 生成的方块世界背景，公开源码和安装包均包含同一组素材，使用声明及制作说明已更新。产品名统一为 ZeroDistance，安装程序、快捷方式和对外版本号去掉迁移后缀。既有数据目录与桥接协议保持兼容。

桌面窗口使用 C# / .NET Framework 4.8 与系统 WebView2，业务后端保留 Node.js 兼容引擎。安装程序与 ZIP 均以低于 100 MB 为打包检查条件，精确体积以本次构建的 native-launcher/release/SIZE.json 为准。

GitHub 签名更新及镜像回退已实现，并提供更新清单。使用及边界见 [下载源实测](docs/DOWNLOAD_RESILIENCE_0307.md)、[内存报告](docs/MEMORY_2026-10-27.md)、[更新流程](docs/NATIVE_UPDATES.md)、[产品文档](docs/PRODUCT.md) 和 [测试说明](docs/TESTING.md)。历史测试记录只证明其标注版本的结果。
