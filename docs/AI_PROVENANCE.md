# AI 制作说明

ZeroDistance 的二次开发部分全部由 AI 制作，包括桌面迁移、界面修改、产品文档与四张新增默认背景。用户提供产品需求、素材选择和测试反馈，发布由用户授权。使用的工具包括 OpenAI Codex 和内置 image_gen；本文不推断未记录的具体模型版本。

这是一项基于 KAMUCL 的二次开发，包含上游和第三方作者已有成果。AI 制作范围不包括这些作者的原始代码，也不将其版权改署给 AI。完整来源和条款仍见根 LICENSE、THIRD_PARTY_NOTICES.md、licenses/ 与 [上游记录](UPSTREAM.md)。

## 背景

四张图片使用内置 image_gen 分别生成，没有输入参考照片或官方截图。主题分别为樱花山谷、雪山湖畔、月下营地与海岸落日。WebP 发布副本保留原始尺寸，只做 quality 84、effort 6 的压缩。生成提示完整保留在 [AI_BACKGROUND_PROMPTS.json](AI_BACKGROUND_PROMPTS.json)，发布哈希记录在 src/shared/landscape-images.json。

图片是 AI 生成的方块世界插画，不是官方 Minecraft 截图，也不是游戏内效果承诺。项目方在可授予的权利范围内允许使用和再分发，不声明对第三方名称和商标享有权利。

## GitHub 与维护责任

查阅日期：2026-10-22。GitHub 的 [服务条款](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service) 和 [可接受使用政策](https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies) 没有全面禁止托管 AI 生成代码；据此，本项目可以在遵守这些条款及第三方许可的前提下发布。AI 来源不会使许可、隐私、质量或安全要求失效。

GitHub 的社区 AI 指南针对社区互动，不能替代仓库适用的条款；本声明也不表示 GitHub 对本产品提供认可。维护者仍应审查、测试和处理缺陷。AI 制作不等于不存在漏洞，当前已知依赖审计状态见 [开发指南](DEVELOPMENT.md)。
