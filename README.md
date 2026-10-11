# ui-baseline

UI 截图基线（孤立分支，不进 main）。

- 最近一次写入来自提交：`a89c2627708ace13f70cb6397493edc179f54a47`（M0-11 截图工具与页面清单（夹具确定性修复中））
- 生成时间：2026-10-11T12:38:40.427Z
- 页面清单：`scripts/ui-baseline/pages.json`（sha256 `f5e86af6b1b0f1e0973fadb49e2cde9fd5d5d04e71cf92589b57e6d8d8e3dcd3`）
- 渲染环境：win32/x64，Chromium 148.0.7778.96

每张图旁边有一份同名 JSON：记录生成时的提交、几何快照与页面信号。
比较方式：`node scripts/ui-baseline/compare.mjs --baseline <本目录>/ui-baseline --current <新截图目录>`。
