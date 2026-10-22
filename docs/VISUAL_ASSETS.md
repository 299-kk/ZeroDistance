# 默认背景与启动图标

0.3.1 起默认使用四张 AI 生成的 Minecraft 风格方块世界插画，随公开源码和安装包提供。旧默认照片已从运行资源移除，本机原片与旧版本归档保留，不进入本版分发。

| 名称 | 发布文件 | 字节数 |
| --- | --- | --- |
| 樱花山谷 | src/renderer/src/assets/launch/landscape-ai-cherry-valley.webp | 322824 |
| 雪山湖畔 | src/renderer/src/assets/launch/landscape-ai-alpine-lake.webp | 281818 |
| 月下营地 | src/renderer/src/assets/launch/landscape-ai-night-camp.webp | 177828 |
| 海岸落日 | src/renderer/src/assets/launch/landscape-ai-coastal-village.webp | 214266 |

四张合计 996,736 字节，原始尺寸均为 1672×941，WebP quality 84、effort 6，不放大、不添加文字或水印。启动台和设置共用图库，支持排序、停留时间、暂停与手动切图；用户自定义图片保留。全部停用时使用主题背景。

通过内置 OpenAI image_gen 各生成一张，无参考图；最终提示集见 [AI_BACKGROUND_PROMPTS.json](AI_BACKGROUND_PROMPTS.json)，来源和 SHA-256 见 src/shared/landscape-images.json。制作范围见 [AI_PROVENANCE.md](AI_PROVENANCE.md)，使用权限见 [AI-BACKGROUNDS.txt](../licenses/AI-BACKGROUNDS.txt)。不表示 Mojang 或 Microsoft 的官方素材、认可或授权。

启动图标继续使用 src/renderer/src/assets/zero-mark.svg。通过 scripts/build-brand-assets.cjs 生成 1024 像素启动图与 Windows 图标，原有动画、DPI 处理和主题不变。
