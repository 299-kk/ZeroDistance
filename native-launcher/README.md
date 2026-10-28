# ZeroDistance Windows 构建

这是从 0.2.2 开始的正式迁移分支，当前版本为 **0.3.2**。它保留完整的原版 Vue 界面，由 C# / .NET Framework 4.8 和系统 WebView2 提供桌面窗口。没有安装 Electron 或 Chromium 副本。

**预览测试从 2026 年 10 月 22 日开始。** 本版本用于收集实际使用中的问题。更新历史与测试说明见 [CHANGELOG.md](CHANGELOG.md)，也可在启动台右上角“更新日志”中离线查看全部版本记录。

当前采用分阶段迁移：窗口、声明计时、文件对话框、Windows 凭据保护、图片编解码、拖入文件和本地图片通道由 C# 实现；游戏启动、安装、账号授权和联机继续复用经过验证的 TypeScript 后端，通过随程序提供的 Node.js 兼容引擎运行。**这不是已经完成全部后端移植的纯 C# 版本。**

安装程序与 ZIP 位于 `release/`。ZIP 必须完整解压，然后运行 `ZeroDistance.exe`，不能只复制 EXE。

安装向导提供默认勾选的“创建桌面快捷方式”，可取消。后台目录发现不再阻塞首帧；启动动画改用快速聚拢，并去掉固定停留。展开本地资源时保留独立滚动条空间，按钮宽度及 13px 字体不变。

默认主题恢复 0.1.4 的“零距·青柠”，其他主题与布局保留。设置 → 外观新增“关闭启动动画”，默认不勾选，下次启动生效；关闭后不创建启动图标或动画窗口。未关闭时继续遵循应用和系统的减少动态效果偏好。

卸载默认清除本版本账号、设置、日志、缓存、临时文件、快捷方式和安装注册表；游戏目录和存档保留。旧安装需先覆盖更新，才能执行新版卸载规则。文件被占用时提示重试，不把部分清理报告为完成。

需要 Windows x64、.NET Framework 4.8 和 Microsoft Edge WebView2 Runtime。WebView2 使用系统的运行时，不计入安装包体积。Java、Minecraft、模组和联机引擎仍按需下载。

## 界面与数据

- 完整使用 `../src/renderer/src/App.vue` 和原页面、组件、CSS、启动动画、皮肤编辑器、主题及四张 AI 方块世界背景及壁纸轮播。构建阶段只替换桌面桥和本地资源 URL，不重做视觉设计。
- 使用 `%APPDATA%\ZeroDistance-Native` 保存账号与配置。0.2.2 的账号、配置和使用声明不被覆盖；首次运行仍须前台阅读三秒并同意声明。
- 游戏根目录发现、版本隔离和默认 D 盘安装规则沿用原实现；已有目录可在“我的游戏”登记。实际启动游戏会像原版一样写入相应游戏实例的日志、配置和皮肤文件。
- 原有 Electron 更新包不能用于此版本；0.3.2 新增完整目录签名更新，GitHub 失败后尝试镜像，见 [更新流程](../docs/NATIVE_UPDATES.md)。
- 设置 → 行为与登录提供手动/游戏启动后自动低占用模式，释放 WebView2，保留核心联机，恢复原界面。内存口径及限制见 [本机报告](../docs/MEMORY_2026-10-27.md)。

## 构建

在仓库根目录执行 `npm ci`，然后运行：

```powershell
npm run build:native
node native-launcher/scripts/verify.cjs
npm run package:native
```

构建器使用 Windows .NET Framework 的 C# 编译器、锁定校验和的 WebView2 SDK 与 Node.js。开发依赖可包含旧版 Electron 构建工具；它们不进入本版本运行包。完整构建命令自动生成 `out/main/GameWindowFocus.exe` 和 `out/main/zero-distance-lan-agent.jar`，可通过根项目的构建流程生成。启动场景由 `../native/StartupFeedback.cs` 直接编译。NSIS 3 用于制作安装程序；可设置 `ZERO_DISTANCE_MAKENSIS` 指定 `makensis.exe`。

测试只在 `.qa/` 下建立独立配置。真实游戏集成测试还需在 `.qa/native-real-game/game` 中准备自有的 Minecraft 26.3 客户端、库和资源副本，并设置 `ZERO_DISTANCE_VERIFY_REAL_GAME=1`；Java 路径可由 `ZERO_DISTANCE_VERIFY_JAVA` 指定。测试不读取正式账号令牌，也不创建测试世界。

QA 模式仅在同时传入 `--qa --data-dir <.qa 内的目录> --cdp-port <端口>` 时开放本机调试端口。普通运行不开放调试端口或 HTTP 服务。

保留根目录 LICENSE、上游版权、第三方许可、壁纸署名以及 Node.js/WebView2/Koffi 许可。不得将本地迁移包发布到 KAMUCL 上游仓库。
