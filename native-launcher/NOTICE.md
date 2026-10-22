# ZeroDistance附加说明

本地分支保留 KAMUCL 的版权、项目 LICENSE 和第三方声明。界面和业务代码延续原项目，新增 C# 桌面层受本仓库 LICENSE 约束。

本运行包实际包含 Vue 3.5.42、Three.js 0.185.1、skinview-utils 0.7.1、Node.js 24.22.1、WebView2 SDK 1.0.4258.31 的桌面加载组件及原后端的依赖。Koffi 3.2.1 用于 Windows 原生进程创建。相关许可保存在 licenses 和 engine/node_modules 中。原有第三方许可完整保留。

Microsoft Edge WebView2 Runtime 和 .NET Framework 由系统提供。Node.js、WebView2 SDK 的下载地址及 SHA-256 固定在对应源码包的 native-launcher/dependencies.lock.json 中。壁纸文件和署名沿用原发行物，出处见 legal/VISUAL_ASSETS.md。

对应源码随同版本的 source.zip 提供。构建步骤见 native-launcher/README.md；该源码包保留复用前端、共享类型、原业务后端、Java 代理与构建脚本之间的相对路径。
