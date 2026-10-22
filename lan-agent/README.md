# 局域网主机验证设置

ZeroDistance 自有补丁，使用项目根目录的许可。只在用户为某个实例主动启用设置后，作为该次游戏进程的 Java agent 加载；取消设置后不传入 agent 参数。游戏 JAR 不作修改，无需安装联机 MOD。

补丁只改变 `MinecraftServer.usesAuthentication()` 对 `IntegratedServer` 及其子类的返回值。原字段为 false 时保持 false；独立服务端对象保持原值。客户端加入远程服务器的认证逻辑不受此开关影响。

启动器先读取真实客户端 JAR，校验布尔 getter 的字节码形状；混淆版本通过校验 SHA1 的 Mojang 官方映射，以及对应的 Fabric intermediary / Forge MCP 映射解析运行时名称。26.3 等无混淆客户端直接匹配具名方法。未能识别时拒绝启用，不显示成功；后续加载中若方法被其他补丁改变，agent 保留原类并输出明确错误，启动器提示用户。

Java agent 本身仅使用 Java 8 标准库。`scripts/build-lan-agent.cjs` 需要 Java 17+ 运行固定、校验散列的开发编译器，生成 Java 8 字节码。`.qa/` 的开发编译器不随程序或源码压缩包分发。

验证入口：`npm run test:lan`（JVM 作用域和本机 26.3 真实服务器对象）、`npm run test:lan:mappings`（1.20.1 官方映射）、`npm run test:fixes:desktop`（隔离实例的真实设置读写与恢复）。真实对象使用隔离的反射测试，不创建世界或开放端口；这些检查不代表已经完成两台机器间的游戏联机验收。
