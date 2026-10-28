# 更新网络测试 · 2026-10-28

本轮测试发生在公开发布前，使用独立 `.qa` 数据目录；当时未上传 GitHub，也未更改用户正式安装。测量是本机当时的网络状态，不代表所有网络或地区都能得到相同结果。

## 真实网络结果

- GitHub Releases API：HTTP 200，约 0.7 秒。
- GitHub 原始文件：不使用系统代理时连接重置；启用本机已有 Windows 系统代理后，实际更新客户端取得 HTTP 200。
- 默认镜像：元数据路径可以访问。一次完整 ZIP 下载在约 17.4 MB 后被对端中断；后续检查确认服务器支持字节范围请求。
- GitHub 发布附件：不使用系统代理时完整下载了公开的 0.3.1 ZIP（39,036,944 字节），约 57 秒，SHA-256 与本地 0.3.1 留档一致。
- 默认镜像续传：实际更新任务连接公开镜像，在约 1 MB 处人为中断，接着发送 `Range` 请求；完整 0.3.1 ZIP 下载成功，约 86 秒，大小和 SHA-256 均与本地留档一致。

真实镜像续传使用临时 QA 签名密钥、测试元数据和隔离目录，将测试用的逻辑版本地址映射到公开的 0.3.1 附件；没有使用发布私钥或发布假版本。真实连接、系统代理、流式下载、续传、长度和哈希检查均由当前更新代码执行。0.3.2 仍未公开，不能将此结果说成已完成未来正式版本的线上升级。

## 实测后调整

更新请求读取 Windows 系统代理及绕过规则。代理建立连接失败或 5 秒内没有响应时尝试直连，GitHub 失败后仍按设置尝试镜像。代理使用 HTTP CONNECT 时，目标 HTTPS 证书仍要正常验证；不关闭 TLS 检查或签名检查。需要用户名密码或非 HTTP(S) 的系统代理不会自动处理，企业代理认证场景尚未验证。

实际程序负向测试还发现，若父进程环境设置了 `NODE_TLS_REJECT_UNAUTHORIZED=0`，旧构建会继承它并关闭 Node TLS 证书验证。签名验证仍会阻止无签名更新，但 TLS 保护失效。本版在启动业务后端时移除该变量；使用同样环境启动实际测试程序后，未受信任证书被拒绝。测试不会改动用户的系统环境变量。

单次下载任务在来源中断后最多重试三次，服务端支持时继续请求剩余字节；当前来源不可用时可将同一临时片段续传至下一来源。忽略 `Range` 的来源会从头下载，错误的 `Content-Range` 会被拒绝并重新开始。所有片段组合后仍须匹配签名清单的完整长度和 SHA-256。正常退出会取消任务、关闭连接并删除未完成片段；重开后重新下载，不承诺跨重启续传。

## 受控网络检查

本机 HTTPS 测试服务采用单独生成的临时证书，仅供测试子进程信任；没有更改 Windows 全局证书、降低 TLS 检查或使用真实发布私钥。本轮原始 20 组检查通过：

- 合法 HTTPS 重定向、HTTP 降级拒绝、重定向次数限制、伪造证书拒绝。
- 即使传输连接被信任，伪造签名与过大的更新清单仍被拒绝。
- 元数据连接 10 秒无响应后切换镜像、源站 HTTP 503 回退、下载连接中断。
- 同源多次续传、切换来源续传、忽略范围时重下、错误范围拒绝。
- 两个来源返回损坏内容时保留已验证旧包，取消与正常退出均关闭连接并清理临时文件。
- HTTP CONNECT 代理、代理下的证书验证、代理要求认证或不可用时直连、代理卡住约 5 秒后直连。

## 切源修复复测（同日）

针对国内直连不稳，下载在连接无响应、传输停滞或持续低速时切换内置镜像。加入切源修复后重新执行，累计 26 组受控 HTTPS 检查通过，新增覆盖：连接不响应且忽略取消时仍能切源、响应体停滞后续传切源、持续低速切源并给出提示、镜像也失败时重试较慢的原来源、用户暂停期间不触发切源、仅 GitHub 模式容忍低速下载。

另做一次真实网络故障注入：GitHub 侧被模拟为不可用，客户端从公开镜像 `https://gh-proxy.org/` 读取已签名的 0.3.3 清单，并下载完整 ZIP（39,118,254 字节）；签名、大小和 SHA-256 与本地留档一致。该结果说明镜像能取到真实发布包，但不代表所有运营商或时段都可用。

复测入口：

```powershell
node native-launcher/scripts/verify-update-network.cjs
node native-launcher/scripts/verify-update-real-fallback.cjs
node native-launcher/scripts/verify-update-live-network.cjs
node native-launcher/scripts/verify-update-system-proxy.cjs
node native-launcher/scripts/verify-update-real-mirror-resume.cjs
node native-launcher/scripts/verify-update-tls-env.cjs
```

测试需要 Windows、项目构建产物和 OpenSSL。实时测试下载公开文件，不上传内容；耗时取决于网络速度。隔离测试原始结果保存在本机 `.qa/update-network-result.json`、`.qa/update-live-network-result.json`、`.qa/update-system-proxy-result.json` 与 `.qa/update-real-mirror-result.json`；不会将代理地址或凭据写入报告。
