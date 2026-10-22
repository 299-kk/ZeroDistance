# ZeroDistance

面向 Windows 的 Minecraft Java 版启动器，基于 [KAMUCL](https://github.com/YUN-SAN3/KAMUCL) 开发。当前版本 **0.3.0 Preview**，从 2026 年 10 月 22 日开始预览测试。

保留原有 Vue 界面、主题、3D 皮肤预览和资源管理体验，使用 C# / .NET Framework 4.8 与系统 WebView2 提供桌面窗口。游戏业务仍通过随附的 Node.js 引擎运行，尚未全部迁移为 C#。发行包不内置 Electron 或 Chromium。

## 使用

需要 Windows 10/11 x64、.NET Framework 4.8 和 Microsoft Edge WebView2 Runtime。Java 和游戏文件按需下载。

- ZeroDistance-0.3.0-Setup.exe：安装向导可选择目录，默认创建桌面快捷方式，可取消。
- ZeroDistance-0.3.0-windows-x64.zip：完整解压后运行 ZeroDistance.exe，请保留随附文件。

安装包由 [Windows 构建流程](https://github.com/299-kk/ZeroDistance/actions/workflows/build.yml) 生成，测试产物不代表稳定版。首次打开需在前台阅读使用声明满三秒并主动同意。卸载默认删除启动器账号、设置、缓存、日志和软件注册信息，保留游戏与存档。

## 功能

- Microsoft 正版登录与离线账号；离线皮肤支持经典、纤细模型，游戏内显示需兼容的皮肤模组。
- Minecraft、Fabric、Forge、NeoForge、Quilt 安装；版本分组、实例大小、进程状态和独立设置。
- 资源检索与模组、整合包、资源包、光影和数据包下载，前置检查可在后台进行。
- FRP 内网穿透、VoxLink 房间和基于 EasyTier 的虚拟局域网；版本设置提供局域网主机验证开关。
- 高清启动动画、青柠默认主题、照片轮播、本地资源管理与皮肤编辑器。

服务可用性和网络环境会影响登录、下载与联机。自动更新尚未接入，更新时使用新的安装包。详细使用条件及测试边界见 [产品说明](docs/PRODUCT.md) 与 [测试说明](docs/TESTING.md)。

## 构建

使用 Windows x64、Node.js 24、npm、JDK 21，以及系统 .NET Framework 编译器：

~~~powershell
$env:ELECTRON_SKIP_BINARY_DOWNLOAD = '1'
npm ci
npm test
npm run license:check
npm run check:docs
npm run build:native
npm run package:native
~~~

成品位于 native-launcher/release/。构建依赖有固定版本与校验和；打包脚本自动取得 NSIS，也可设置 ZERO_DISTANCE_MAKENSIS。完整流程见 [开发说明](docs/DEVELOPMENT.md) 和 [发布检查](docs/RELEASING.md)。旧 Electron 构建入口仍保留供开发对照。

## 素材与许可

本机版本中的四张影视飓风照片由用户提供。尚未取得允许在公开仓库再分发的授权证明，因此公开源码和由它生成的安装包不包含照片本体，缺图时显示主题底色。来源、校验和及导入说明见 [视觉素材](docs/VISUAL_ASSETS.md)。本机已导入的照片不受影响。

保留 KAMUCL 版权与第三方许可。MIT 适用范围见 [LICENSE](LICENSE)，其他组件分别遵循 [第三方声明](THIRD_PARTY_NOTICES.md) 中列出的许可，包括 VoxLink 的 LGPL 条款。Minecraft、Microsoft、Mojang 及素材相关权利归各自权利人所有，本项目不代表这些主体。

## 文档与反馈

[文档目录](docs/README.md) · [更新历史](native-launcher/CHANGELOG.md) · [开发约定](CONTRIBUTING.md) · [安全问题](SECURITY.md) · [对应源码](docs/CORRESPONDING_SOURCE.md)

普通问题请提交 [Issue](https://github.com/299-kk/ZeroDistance/issues)，附版本、复现步骤与脱敏日志。请勿上传账号令牌、联机密钥或完整个人数据目录。
