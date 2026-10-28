# 发布检查

发布目标是 `299-kk/ZeroDistance`。本仓库是独立分支，禁止向 KAMUCL 上游推送代码、标签、附件或发布记录。

## 版本与内容

1. 统一根 package.json、native-launcher/package.json、LauncherWindow 的版本常量、更新记录与当前产品文档。当前是 0.3.3 Preview，保留预览状态，不使用“原生迁移版”产品后缀。
2. 检查 `.gitignore` 和 `npm run check:public`。不得提交账号、令牌、游戏、测试用户目录、原始素材、构建缓存或私有下载工具。
3. 检查 LICENSE、THIRD_PARTY_NOTICES、对应源码和素材来源。未取得再分发授权的照片不能进入公开源码、公开安装包、Release 附件或预览截图；已有本机含照片的历史包不直接上传。
4. 产品说明只描述实际实现及验证边界，不能把“可配置”写成“所有环境保证可用”。

## 构建与验收

```powershell
npm ci
npm test
npm run license:check
npm run check:docs
npm run check:public
npm run build:native
npm run package:native
```

公开成品从干净的 Git 检出构建，避免把本机额外照片带入。核对 BUILD.json、SIZE.json、SHA256SUMS.txt 和 ZIP 逐文件内容。安装程序和 ZIP 均须小于 100,000,000 字节；系统 WebView2、.NET 和按需下载的游戏内容不在此包体统计中。

按 [测试指南](TESTING.md) 完成相关服务、GUI、安装与卸载测试。检查旧快捷方式清理、桌面快捷方式选项、产品显示名、声明三秒门禁、数据目录兼容和卸载后游戏保留。发现失败必须修正或明确说明，不能仅因构建成功就标为正式稳定版。

## GitHub 交付

普通代码提交触发的工作流只运行检查并上传 CI 构建产物，不自动创建 Release、推送标签或修改上游。创建公开 Release 时使用对应提交构建的安装程序、ZIP、源码及校验文件，并标注 Preview / prerelease。

源码必须包含 LGPL 部分及其重新构建方式。不要用无法从该提交还原的私有二进制替代 Bridge、Java 代理或清理组件。发布说明应包含具体变化、验证范围、升级步骤和已知限制。

已实现签名完整目录更新及镜像回退；签名、私钥保管、feed 与最终 ZIP 一致性见 [原生更新](NATIVE_UPDATES.md)。普通构建不会自动发布，禁止将签名私钥提交仓库或打进源码包。
