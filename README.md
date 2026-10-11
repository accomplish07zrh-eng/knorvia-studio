# ui-baseline

UI 截图基线（孤立分支，不进 main）。

- 最近一次写入来自提交：`6ea4cbe751a3d4b35d08460151eed758f5a76ac8`（docs: 计划书副本写明执行基线 beff12b5）
- 生成时间：2026-10-11T08:05:06.629Z
- 页面清单：`scripts/ui-baseline/pages.json`（sha256 `3c58d9dce874d640ead75f956009bf62326880667ad97b512f99a76a54c204bb`）
- 渲染环境：win32/x64，Chromium 148.0.7778.96

每张图旁边有一份同名 JSON：记录生成时的提交、几何快照与页面信号。
比较方式：`node scripts/ui-baseline/compare.mjs --baseline <本目录>/ui-baseline --current <新截图目录>`。
