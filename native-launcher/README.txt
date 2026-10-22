ZeroDistance 0.3.0 · 预览版

预览测试开始日期：2026 年 10 月 22 日。
更新历史和测试说明见 CHANGELOG.md，或启动台右上角“更新日志”。

请完整解压 ZIP 后运行 ZeroDistance.exe；不要只复制 EXE。
需要 Windows x64、.NET Framework 4.8、Microsoft Edge WebView2 Runtime。

本版本保留原有界面、主题和启动动画。公开构建不包含未获再分发许可的影视飓风照片，可自行导入获准使用的图片。
默认主题恢复 0.1.4 青柠。设置 → 外观可关闭启动动画，下次启动生效。
安装时默认创建桌面快捷方式，可在组件选择页取消。
本地资源展开不再挤压文字；缩短启动等待，并将目录发现移到后台。
C# 接管桌面窗口与系统能力；启动、下载和联机暂由随包提供的 Node.js 兼容引擎运行。
这不是已经完成全部后端移植的纯 C# 版本。

配置保存在 %APPDATA%\ZeroDistance-Native。
卸载会清除此版本账号、设置、日志、缓存和临时文件，并清理快捷方式及安装注册表。Minecraft 游戏目录和存档保留。
旧安装需先用本版安装程序覆盖更新，才能使用新的卸载清理流程。
不会覆盖 0.2.2 的账号和配置；已有游戏目录仍可发现或手动登记。
使用声明需在前台阅读三秒后同意。

请使用 ZeroDistance 安装程序更新，不能套用旧 Electron 更新包。
许可和壁纸署名见 LICENSE、THIRD_PARTY_NOTICES.md、licenses 和 legal 文件夹。
验证范围和剩余迁移事项见 MIGRATION_STATUS.md。
