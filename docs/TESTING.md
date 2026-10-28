# 测试与验证

自动测试、GUI 集成、本机游戏和公网联机是不同层级，不互相替代。每次修改只运行与风险相关的检查，发布前完成当前版本的构建与许可审查。

## 可从干净源码运行

```powershell
npm ci
npm test
npm run license:check
npm run check:docs
npm run check:public
npm run build:native
node native-launcher/scripts/verify-services.cjs
```

核心测试涵盖目录发现、隔离、资源兼容、下载流程、Microsoft TLS、轮播、皮肤和声明等。四张 AI 默认背景是必需资产，检查其文件、AI 来源及 SHA-256；缺少或损坏应使测试失败。

原生服务检查验证当前 Windows 用户的 DPAPI、图像像素与编码，不需要 Minecraft 账号或游戏客户端。

## 需要交互桌面的检查

先安装 Playwright 开发工具：`npm install --no-save --package-lock=false playwright`。这是测试工具，不是运行包依赖。

```powershell
node native-launcher/scripts/verify.cjs
npm run package:native
node native-launcher/scripts/verify-uninstall.cjs
```

完整 GUI 脚本使用实际前台三秒声明门禁，并检查当前版本更新历史、界面、主题、资源菜单宽度、离线账号、皮肤动画、资源授权及正常退出。0.3.1 起检查随源码提供的 AI 默认背景、署名与轮播，并确认使用声明没有旧照片来源声明。

卸载脚本会编译并运行安装程序，使用独立的 QA 注册表和快捷方式身份，验证清理、失败重试、游戏保护、目录链接、旧副本和失效注册记录。正式账号、注册项与快捷方式不得作为测试目标。

## 需要旧版本或本机样例

启动性能、旧地址 UI 偏好迁移、玩家行为和真实游戏脚本可能依赖 `.qa/player-behavior-current.json`、旧版 ZIP、本机游戏副本或特定 Java。这些私有测试输入不会进入仓库。运行前读脚本所需参数，并准备自己有权使用的客户端与测试账号。

真实游戏启动成功只表示创建了对应游戏进程和窗口，不自动证明进入世界、第二个实例或公网联机成功。取得 Microsoft 设备码不表示完整完成 Xbox / Minecraft 授权。

## 当前证据

2026-10-28 更新网络测试：20 组真实 HTTPS/受控故障检查通过；使用真实 Windows 系统代理成功访问 GitHub，真实镜像中断续传后完整下载公开的 0.3.1 ZIP，大小及 SHA-256 与本地留档一致。另在实际程序中验证，继承的 Node 关闭证书验证变量不会生效，伪造证书被拒绝。详情和真实/模拟边界见 [更新网络实测](UPDATE_NETWORK_TEST_2026-10-28.md)。

同日后续安全加固增加至 11 组助手、7 组来源、4 组下载、10 组安全/静默交接与 5 组真实包集成检查，合计 37 组。生产依赖已知漏洞为 0，完整开发依赖仍有 10 项。详见 [更新安全与静默测试](UPDATE_SECURITY_2026-10-27.md)。下方 23 项记录是此前一轮结果。

0.3.2 本地通过 86 项核心测试、TypeScript、许可及文档检查、15 组完整 GUI、2 组原生服务、9 组安装/卸载检查；ZIP 全部 217 个文件与构建目录一致。低占用通过 6 组，包括浏览器释放/恢复、未保存编辑保护、同一 TCP 连接保留和模拟游戏事件自动切换。签名更新通过 8 组应用/回滚、7 组来源/签名、3 组下载故障检查。

复测脚本 `verify-low-memory.cjs`、`verify-native-update.cjs`、`verify-update-source.cjs`、`verify-update-download.cjs` 均位于 native-launcher/scripts。每组结果以本机最新 `.qa` 报告为准；[内存报告](MEMORY_2026-10-27.md) 说明采样范围和限制。真实 Minecraft 自动切换及双机公网联机仍需继续验证。

另完成 5 项真实签名包集成检查：0.3.1 隔离副本升级到 0.3.2、217 个文件比对、重开与设置保留、实际 GitHub 检查及正常退出。与前述 18 项更新专项合计 23 项，范围和未覆盖的线上自动交接场景见 [更新测试记录](UPDATE_TEST_2026-10-27.md)。复测使用 `verify-update-integration.cjs --baseline <旧版完整程序目录>`；脚本不发布内容，也不修改正式用户配置。

0.3.1 的 82 项核心测试、TypeScript、15 组 GUI、2 组原生服务和 9 组安装/卸载检查通过。ZIP 与构建文件逐一比对，并核对四张 AI 背景、更新声明、源码包分发边界及 SHA-256。该轮没有进行新的完整微软登录或双机公网联机测试。

0.3.0 发布前重新通过 82 项核心测试、TypeScript 检查、15 组完整 GUI 检查、2 组原生服务检查，以及 9 组安装/卸载专项检查；新增对外名称与旧快捷方式清理验证。不含照片、账号、旧构建和工具缓存的独立源码副本已完成 npm ci、核心测试、完整构建、原生服务检查和安装程序/ZIP 打包。对应记录为 [启动测试](STARTUP_TEST_2026-10-22.md)、[玩家行为测试](PLAYER_TEST_2026-10-22.md)、[卸载测试](UNINSTALL_TEST_2026-10-22.md) 和 [当前验证](../native-launcher/RESULT.md)。历史记录保留当时的版本名，不倒改为新版本。

跨电脑性能、完整微软授权、双机公网联机、高 DPI 和多显示器仍需追加实际环境证据。CI 的源码构建成功只证明该提交能构建，不意味着全部手动场景都重新通过。
