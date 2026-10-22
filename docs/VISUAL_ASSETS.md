# ZeroDistance 图片与启动图标

本机轮播使用用户提供的四张影视飓风照片。尚未取得允许公开再分发的授权证明，因此公开仓库、公开源码包与其构建产物不包含原片或压缩副本，只保留来源和哈希清单。本机照片不改动。缺图时使用主题底色，仍可导入自行获准使用的照片。

| 显示名称 | 打包副本 | 处理方式 |
| --- | --- | --- |
| 雾中山城 | src/renderer/src/assets/launch/landscape-07c317b750b9f6d5f5b7.webp | 原图等比压缩 |
| 雪山与云海 | src/renderer/src/assets/launch/landscape-2595334fcf62e77ca93a.webp | 原图等比压缩 |
| 岩石间的白鼬 | src/renderer/src/assets/launch/landscape-d3670bdf043ca142edd7.webp | 原图等比压缩 |
| 旋转楼梯 | src/renderer/src/assets/launch/landscape-8191bdd06f4245182fce.webp | 使用 ARW 内嵌高分辨率 JPEG 预览，原片保留 |

图片等比缩小至不超过 2400×1600，再以 WebP quality 85 压缩；四张合计 717,084 字节。照片内容和原有署名保留。ARW 使用 7008×4672 的内嵌 JPEG 预览，原片未修改。

用户已确认四张照片均来自影视飓风，图库与轮播统一署名“影视飓风”。来源页：https://www.ysjf.com/material 。照片许可独立于启动器的 MIT 代码许可。各图标题、来源、处理方式与 SHA256 记录于 src/shared/landscape-images.json。

使用 npm run assets:import 可从素材目录生成副本和清单，也可通过 node scripts/import-landscapes.cjs 指定其他目录。来源信息和默认顺序由素材/credits.json 提供。同一原文件保持稳定图片 ID。

启动台和设置共用图库。支持内置照片、自定义图片、排序、逐张停留时间、暂停及手动切图。全部停用时使用主题底色；实例专用封面优先。

0.1.0 的生成封面、上游七张插画、旧人物贴图和未使用的彩蛋组件已删除。0.1.1 默认不使用生成图片。

启动图标从 src/renderer/src/assets/zero-mark.svg 生成 1024×1024 的 zero-splash.png，Windows 图标源也是 1024 像素。网页启动动画直接绘制 SVG，并按设备像素比设置画布；原生动画使用高质量双三次插值与随 DPI 增长的碎片纹理。通过 scripts/build-brand-assets.cjs 可重新生成。
