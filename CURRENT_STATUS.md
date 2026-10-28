# ZeroDistance 0.3.2 Preview

内置四张 AI 生成的方块世界背景，公开源码和安装包均包含同一组素材，使用声明及制作说明已更新。产品名统一为 ZeroDistance，安装程序、快捷方式和对外版本号去掉迁移后缀。既有数据目录与桥接协议保持兼容。

桌面窗口使用 C# / .NET Framework 4.8 与系统 WebView2，业务后端保留 Node.js 兼容引擎。安装程序与 ZIP 均以低于 100 MB 为打包检查条件，精确体积以本次构建的 native-launcher/release/SIZE.json 为准。

0.3.2 作为预览版发布。新增手动/游戏启动后自动低占用模式，释放 WebView2，保留核心连接并支持恢复原界面。本机低占用私有提交约 30 MiB，无活动核心时总工作集约 48 MiB；持续 TCP 核心测试约 72 MiB 私有提交、117 MiB 总工作集，正常完整界面未达到 100 MB。

GitHub 签名更新及镜像回退已实现，并提供更新清单。使用及边界见 [内存报告](docs/MEMORY_2026-10-27.md)、[更新流程](docs/NATIVE_UPDATES.md)、[产品文档](docs/PRODUCT.md) 和 [测试说明](docs/TESTING.md)。历史测试记录只证明其标注版本的结果。
