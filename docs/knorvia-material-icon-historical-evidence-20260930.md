<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# Material Icon Theme 固定历史来源复核

只读研究提交的映射在唯一写入环境独立重现，产品 SVG 未改变。原参考仍为 `cb1dfb6d9cb73b15681a93939983d75dbba7bf5b`，保留原导入版本未知的声明；补充 [v5.24.0 固定提交](https://github.com/material-extensions/vscode-material-icon-theme/tree/1ce779521ad70ee653c46d95b3ec50d48884e536/icons) 的 238 个 open-folder 名称 × 两份，共 476 份精确字节/Git blob 匹配；另两份 agent 精确匹配 [原添加提交](https://github.com/material-extensions/vscode-material-icon-theme/blob/146ded17af5d4a77aa416fd86699aac50fba900f/icons/agent.svg)，blob `b5dfc4d7cca3bc7cc9266f43869710fd8a2f668c`。

三个固定参考的 LICENSE 均逐字节等于现有 Material Extensions MIT 文本，SHA256 `cdab3014d4f69b49dde2b85e81792208c72de613aa6aed7f7a9b5c6609b89670`；[出版者 LICENSE](https://raw.githubusercontent.com/material-extensions/vscode-material-icon-theme/1ce779521ad70ee653c46d95b3ec50d48884e536/LICENSE)。版权出处判断不包括商标/品牌授权，不能把这些图标认定为 Knorvia 原创。原 NOTICE 和第三方声明全文保持原字节。

`material-icon-theme.json` 现在是 schema 2：匹配 2284，未决 8。原 486 项记录仍见 `a26cde548b40fe271c22e7213e938c0d3aa43ff1` 下该文件和 `third-party-reconciliation-20260930.json`；八条未决逐字段与旧记录相同。两资产根 `packages/desktop/src/renderer/public/material-icons/`、`packages/web/public/material-icons/` 中各有 `folder.svg`、`docx.svg`、`pptx.svg`、`xlsx.svg`。仅已知它们来自固定 ZCode 基线；缺少对应出版者精确来源或修改作者权属。可提供原设计/修改授权记录，或在保留当前布局交互的单独授权变更中替换成权属明确的素材；本批不改设计。

补充参考由复制来源登记拥有，名称范围分别为 open-folder 与 agent。审计逐项核对 sourceCommit/path/blob、原始/归一摘要和许可，校验声明投影及全部目录覆盖。未知提交、缺少提交、错路径/blob/许可/摘要、旧 schema 隐藏补充声明均拒绝。新测试先取得 1 通过、8 失败，后实现这些门；Git 对象重现测试还验证未知资产不被匹配，以及额外参考 LICENSE 改变必须失败。

重现：在仓外准备包含三个固定提交的出版者 Git 对象库，运行 `node scripts/provenance/material-icons.mjs --source-repo <源对象库> <仓外输出.json>`。生成器验证每个 commit 的 LICENSE 与真实源对象，不下载、不修改资产。输出必须与提交的来源证据相同。离线日常门绑定已验证证据和当前字节，不能代替重新从出版者对象验证 commit 包含对应 blob。

严格材料义务剩余 27：15 npm 版本例外、React 技能/Skia/QuickJS-NG/Rust 标准库四项及八份资产。来源专项和通常一致性门可以通过；严格门继续失败。完整独立实现、原生 UI、实际发布产物及上述权属未完成，不能宣布全库 MIT 就绪。
