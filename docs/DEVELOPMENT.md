# 开发指南与注意事项

本仓库发布 ZeroDistance，当前对外版本为 0.3.0 Preview。`native-launcher/` 是现行桌面实现的源码目录名称；名称保留用于维护，不是产品后缀。旧 Electron 实现保留为参考和兼容工具。

## 环境和首次构建

- Windows 10/11 x64、Node.js 24 LTS 与 npm。
- JDK 21 或更新版本，`java`、`javac`、`jar` 可用；可用 JAVA_HOME 指向 JDK。只有 JRE 不能编译 Bridge。
- 系统 .NET Framework 4.8 及其 C# 编译器、WebView2 Runtime。
- 下载开发依赖需要访问 npm、Maven、NuGet、Node.js 和 GitHub。代理仅在开发环境配置，不写入项目源码。

```powershell
git clone https://github.com/299-kk/ZeroDistance.git
cd ZeroDistance
npm ci
npm run build:native
.\native-launcher\out\ZeroDistance.exe
```

`build:native` 从源码生成品牌图标、声明、Windows 辅助程序、Java 局域网代理和 Bridge，再构建当前 UI 与兼容业务引擎。不要求事先存在 `out/` 或本机 `.qa` 测试配置。下载的开发工具校验固定摘要；依赖和工具缓存不提交 Git。

公开仓库不含影视飓风照片，主题背景是正常的回退状态。有明确使用授权后，可通过设置导入自己的照片，或按 [素材说明](VISUAL_ASSETS.md) 准备本机素材。不要把“可下载”当成“可上传到开源仓库”。

## 代码地图

| 路径 | 职责 |
| --- | --- |
| native-launcher/native | WinForms、WebView2、安全桥、窗口、声明和资源授权 |
| native-launcher/backend | Node.js 业务兼容层及 JSON 传输 |
| native-launcher/frontend | 当前桌面桥的浏览器端实现 |
| src/renderer | 共用 Vue 页面、CSS、Three.js 和皮肤编辑器 |
| src/main/core | 游戏、账号、下载、资源和联机业务 |
| src/shared | IPC 类型、格式、主题、声明和公共逻辑 |
| native-launcher/uninstall | 有路径边界的卸载清理组件 |
| native、lan-agent、bridge | 原生辅助程序、局域网 JVM 代理和 Bridge MOD |
| scripts、native-launcher/scripts | 构建、打包、审查及测试入口 |

详细边界见 [架构说明](ARCHITECTURE.md)。

## 必须保持的约束

1. 内部 `kamucl` IPC、桥接 MOD、资源协议和 `%APPDATA%\ZeroDistance-Native` 标识有兼容用途。不要为了改名全局替换；必须同时更新两端并补兼容测试。
2. 声明同意前不得启动账号加载、游戏扫描或网络联机。三秒是前台阅读门槛，不是用户已经理解内容的证明。
3. 渲染器不能直接取得任意文件或调用私有资源授权通道。文件路径来自选择、授权或注册的游戏目录；本地资源地址只能由宿主生成。
4. UI 静态页面使用 `.test` 虚拟主机。不要未经实测改回 `.local`，已有启动测试记录了约一秒的解析前等待。不要让变化重新引入首帧黑框、隐藏窗口绘制等待或 HWND 重建。
5. 减少动态效果、窗口隐藏暂停和手动播放皮肤动画分别处理；修复一个入口不能让另一入口失效。
6. 下载要校验实际文件、版本、加载器及哈希，取消要释放资源。实例运行时不得直接写入其模组或存档。
7. 正常关闭启动器不应结束 Minecraft。卸载只清理自身数据，保护游戏和目录链接目标；文件占用必须报告失败并保留重试入口。
8. 保留上游和第三方许可，尤其是 VoxLink 的 LGPL 文件、皮肤模型的 MIT 署名和对应源码。不向 KAMUCL 上游仓库推送本项目产物。

## 调试和验证

`npm run dev` 仍是旧 Electron 开发容器，可帮助迭代共用 UI，但不能据此宣布当前桌面宿主验证通过。当前版本需重新 `npm run build:native` 并运行实际 EXE。QA 端口只在显式传入 `--qa --data-dir <.qa 内目录> --cdp-port <端口>` 时开放，普通启动不开放调试服务。

```powershell
npm test
npm run license:check
npm run check:docs
npm run check:public
node native-launcher/scripts/verify-services.cjs
node native-launcher/scripts/verify.cjs
```

测试数据只能放在独立 `.qa` 配置，不能把本机账号、令牌或游戏上传到仓库。GUI、旧版迁移和真实游戏脚本的准备条件见 [测试指南](TESTING.md)，不要把缺少私有样例的脚本直接当成 CI 必跑任务。

## 打包与贡献

```powershell
npm run package:native
```

该命令使用锁定开发依赖中的 NSIS 工具集并校验下载，或使用 ZERO_DISTANCE_MAKENSIS 指定现有编译器。成品输出到 `native-launcher/release/`，包括安装程序、ZIP、对应源码、SIZE.json 与 SHA256SUMS.txt。安装程序和 ZIP 均检查低于 100,000,000 字节。

提交前查看 [贡献说明](../CONTRIBUTING.md)、[安全政策](../SECURITY.md) 和 [发布检查](RELEASING.md)。版本值、更新记录、安装器和文档必须一致；不要把增加文档描述当成实现已经完成。

## 依赖审计状态

2026-10-22 的 npm audit 快照报告 18 项（11 项中等、7 项高）。既包括旧 Electron 开发工具依赖，也包括 adm-zip、sharp、undici 等直接依赖，需要分别检查实际打包路径与适用条件。0.3.0 的回归和构建通过不代表这些公告已修复；不要以“全部安全检查通过”描述本版本。更新依赖应单独评估并回归下载、图片、压缩包和网络功能，禁止直接使用 npm audit fix --force 做未经验证的主版本升级。
