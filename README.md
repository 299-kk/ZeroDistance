# ZeroDistance

面向 Windows 的 Minecraft Java 版启动器，基于 [KAMUCL](https://github.com/YUN-SAN3/KAMUCL) 开发。当前版本为 **0.3.4 Preview**，仍在预览测试中。

保留原有 Vue 界面、主题、3D 皮肤预览和资源管理体验，使用 C# / .NET Framework 4.8 与系统 WebView2 提供桌面窗口。游戏业务仍通过随附的 Node.js 引擎运行，尚未全部迁移为 C#。发行包不内置 Electron 或 Chromium。

**AI 制作说明：ZeroDistance 的二次开发部分全部由 AI 制作，包括桌面迁移、界面修改、产品文档和新增默认背景；用户提供需求、选择与测试反馈。项目仍包含 KAMUCL 上游代码和第三方依赖，其作者、版权与许可保持不变。**

## 使用

需要 Windows 10/11 x64、.NET Framework 4.8 和 Microsoft Edge WebView2 Runtime。Java 和游戏文件按需下载。

- [Windows 安装版](https://github.com/299-kk/ZeroDistance/releases/download/v0.3.4/ZeroDistance-0.3.4-Setup.exe)：安装向导可选择目录，默认创建桌面快捷方式，可取消。
- [Windows ZIP 版](https://github.com/299-kk/ZeroDistance/releases/download/v0.3.4/ZeroDistance-0.3.4-windows-x64.zip)：完整解压后运行 ZeroDistance.exe，请保留随附文件。

安装包可从 [GitHub Releases](https://github.com/299-kk/ZeroDistance/releases) 下载，本地保留同一版本及 SHA-256。预览版仍在测试。首次打开需在前台阅读使用声明满三秒并主动同意；声明更新后需重新同意。卸载默认删除启动器账号、设置、缓存、日志和软件注册信息，保留游戏与存档。

## 功能

- Microsoft 正版登录与离线账号；离线皮肤支持经典、纤细模型，游戏内显示需兼容的皮肤模组。
- Minecraft、Fabric、Forge、NeoForge、Quilt 安装；版本分组、实例大小、进程状态和独立设置。
- 资源检索与模组、整合包、资源包、光影和数据包下载，前置检查可在后台进行。
- FRP 内网穿透、VoxLink 房间和基于 EasyTier 的虚拟局域网；版本设置提供局域网主机验证开关。
- 高清启动动画、青柠默认主题、照片轮播、本地资源管理与皮肤编辑器。

设置 → 行为与登录可手动进入低占用模式，或选择游戏启动后自动进入。该模式释放 WebView2，保留已有联机核心，恢复后回到原界面。无活动核心时本机私有内存约 30 MiB，持续 TCP 测试约 72 MiB；含共享页的总工作集和真实联机子进程可能超过 100 MB。详见 [内存测试及使用](docs/MEMORY_2026-10-27.md)。

本版接入 GitHub 签名更新与镜像回退，后台下载，正常退出后静默替换，下次打开生效；0.3.1 及更早版本需先手动升级一次。见 [更新流程](docs/NATIVE_UPDATES.md)。服务可用性和网络环境会影响登录、下载与联机，详细边界见 [产品说明](docs/PRODUCT.md) 与 [测试说明](docs/TESTING.md)。

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

默认轮播包含四张 AI 生成的 Minecraft 风格方块世界背景：樱花山谷、雪山湖畔、月下营地、海岸落日。源码和安装包均包含 WebP 文件，合计约 1 MB；不再使用旧默认照片。生成提示、处理方式和校验记录见 [视觉素材](docs/VISUAL_ASSETS.md) 与 [AI 制作说明](docs/AI_PROVENANCE.md)。

保留 KAMUCL 版权与第三方许可。MIT 适用范围见 [LICENSE](LICENSE)，其他组件分别遵循 [第三方声明](THIRD_PARTY_NOTICES.md) 中列出的许可，包括 VoxLink 的 LGPL 条款。Minecraft、Microsoft、Mojang 及素材相关权利归各自权利人所有，本项目不代表这些主体。

## 文档与反馈

[文档目录](docs/README.md) · [更新历史](native-launcher/CHANGELOG.md) · [开发约定](CONTRIBUTING.md) · [安全问题](SECURITY.md) · [对应源码](docs/CORRESPONDING_SOURCE.md)

普通问题请提交 [Issue](https://github.com/299-kk/ZeroDistance/issues)，附版本、复现步骤与脱敏日志。请勿上传账号令牌、联机密钥或完整个人数据目录。
