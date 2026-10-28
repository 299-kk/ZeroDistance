# 对应源码与重新构建

ZeroDistance 的公开源码位于 [299-kk/ZeroDistance](https://github.com/299-kk/ZeroDistance)，0.3.2 的对应源码包随发行物提供。原始来源为 [YUN-SAN3/KAMUCL](https://github.com/YUN-SAN3/KAMUCL) 1.1.9，来源记录见 [UPSTREAM.md](UPSTREAM.md)。

源码包含应用、LGPL 部分、C# 辅助程序、Java 桥接模组与局域网补丁、原始投影注册表、构建脚本、依赖锁文件及许可。允许修改和重新构建 LGPL 部分并与应用组合；不禁止为调试这些修改而逆向工程，无需 ZeroDistance 私有密钥。

Windows x64 使用 Node.js 24、npm、JDK 21 与系统 .NET Framework 编译器。运行 npm ci、npm run build:native、npm run package:native。完整环境、输出路径和验证命令见 [开发说明](DEVELOPMENT.md)。公开源码不包含账号、游戏、个人配置、下载缓存或未取得再分发许可的照片。四张 AI 默认背景随源码提供，构建和打包核验其哈希。

lan-agent/src/ 编译为 Java 8 字节码，bridge/src/ 通过 JDK 构建桥接模组。脚本下载固定版本、校验哈希的编译依赖，下载缓存不进入发行包。投影注册表使用 Brotli 无损压缩并核对解压结果，原始 JSON 与生成脚本完整保留。

依赖由 package-lock.json 和 native-launcher/dependencies.lock.json 固定。Java 和官方联机工具按需下载，未内嵌于启动器。许可证范围及第三方条款见根目录 LICENSE、THIRD_PARTY_NOTICES.md 与 licenses/。
