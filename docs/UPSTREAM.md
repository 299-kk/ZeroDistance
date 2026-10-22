# ZeroDistance 来源记录

- 基础仓库：https://github.com/YUN-SAN3/KAMUCL
- 获取地址：https://codeload.github.com/YUN-SAN3/KAMUCL/zip/refs/heads/main
- 获取时间：2026-10-21（Asia/Shanghai）
- 获取时版本：1.1.9
- 原始 ZIP 的 SHA256：`3dc0f6eac9d7719a9ce69fb4549f61924a4beb6bf094fae9394047ff1400fd32`
- 本项目版本：0.3.0 Preview
- 参考项目：Modrinth（https://github.com/modrinth/code）、PCL（https://github.com/Meloong-Git/PCL）。未新增复制这些项目的实现。

ZeroDistance 修改包括独立产品与打包标识、隔离数据目录、关闭上游更新渠道、新启动台与统一侧栏、默认青柠主题、安装/资源分类导航及联机入口。

内部 `kamucl` IPC、文件格式、模组桥接与部分日志标识保留，以避免破坏已有实现。上游历史更新日志与仓库操作说明存档于 `docs/upstream/`；上游的发布目标与发布授权不适用于本项目。

0.1.1 已移除生成封面和上游装饰素材；默认轮播使用用户提供的照片，资产位置和来源见 `VISUAL_ASSETS.md`。品牌图标为项目内 SVG。
