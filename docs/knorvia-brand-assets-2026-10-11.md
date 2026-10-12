# Knorvia 品牌图标登记与冻结证据例外（M0-7）

日期：2026-10-11　主仓提交：`6ea4cbe7`（执行基线 `beff12b5`）　认领 issue：#98

依据《Knorvia 独立替换任务计划书》M0-7：「29 个品牌图标登记 original；`docs/evidence` 中 1 个上游类型摘录归入例外」，完成标准「依据写『用户提供的 Knorvia 品牌资产』」，以及选择 11「品牌图标登记为自有」与「归零」口径的第三类例外。

## 1. 判据

判据取自来源清单自身的事实，不按文件名或目录推定：**内容与上游固定提交 `872ad960` 不同的图标类文件**（`classification: upstream-modified`，扩展名 `.png/.svg/.ico/.icns/.jpg/.jpeg/.webp`）。含义是「路径仍是上游原路径，内容已换成用户提供的 Knorvia 图标」。命中 29 个文件，与计划书的 29 一致；合计 2103253 字节（约 2.01 MB）。

- 支付图标、`packages/ui/src/assets/Z.svg`、dmg 背景等仍是上游原样字节（`upstream-unchanged`），不属于本项，按 M0-5「无引用的上游残留资产」处理。
- material-icons 与模型供应商标志分别由 M0-6 按第三方来源登记；品牌标志（GLM、飞书）保留并按品牌标志登记。

## 2. 登记为 original 的 29 个品牌图标

| 路径                                         | 字节   | 上游同路径                                   | 可测内容差异              |
| -------------------------------------------- | ------ | -------------------------------------------- | ------------------------- |
| `packages/desktop/build/icon.icns`           | 250593 | `packages/desktop/build/icon.icns`           | 不同（upstream-modified） |
| `packages/desktop/build/icon.ico`            | 123497 | `packages/desktop/build/icon.ico`            | 不同（upstream-modified） |
| `packages/desktop/build/icon.png`            | 112325 | `packages/desktop/build/icon.png`            | 不同（upstream-modified） |
| `packages/desktop/build/icon_installer.icns` | 250593 | `packages/desktop/build/icon_installer.icns` | 不同（upstream-modified） |
| `packages/desktop/build/icon_installer.ico`  | 123497 | `packages/desktop/build/icon_installer.ico`  | 不同（upstream-modified） |
| `packages/desktop/build/icon_installer.png`  | 112325 | `packages/desktop/build/icon_installer.png`  | 不同（upstream-modified） |
| `packages/desktop/build/icon_windows.png`    | 112325 | `packages/desktop/build/icon_windows.png`    | 不同（upstream-modified） |
| `packages/desktop/build/icons/1024x1024.png` | 112325 | `packages/desktop/build/icons/1024x1024.png` | 不同（upstream-modified） |
| `packages/desktop/build/icons/128x128.png`   | 9624   | `packages/desktop/build/icons/128x128.png`   | 不同（upstream-modified） |
| `packages/desktop/build/icons/16x16.png`     | 754    | `packages/desktop/build/icons/16x16.png`     | 不同（upstream-modified） |
| `packages/desktop/build/icons/24x24.png`     | 1329   | `packages/desktop/build/icons/24x24.png`     | 不同（upstream-modified） |
| `packages/desktop/build/icons/256x256.png`   | 21347  | `packages/desktop/build/icons/256x256.png`   | 不同（upstream-modified） |
| `packages/desktop/build/icons/32x32.png`     | 1962   | `packages/desktop/build/icons/32x32.png`     | 不同（upstream-modified） |
| `packages/desktop/build/icons/48x48.png`     | 3146   | `packages/desktop/build/icons/48x48.png`     | 不同（upstream-modified） |
| `packages/desktop/build/icons/512x512.png`   | 49240  | `packages/desktop/build/icons/512x512.png`   | 不同（upstream-modified） |
| `packages/desktop/build/icons/64x64.png`     | 4366   | `packages/desktop/build/icons/64x64.png`     | 不同（upstream-modified） |
| `packages/web/public/favicon.ico`            | 123497 | `packages/web/public/favicon.ico`            | 不同（upstream-modified） |
| `public/icon_512@2x.png`                     | 112325 | `public/icon_512@2x.png`                     | 不同（upstream-modified） |
| `public/logo/icons/1024x1024.png`            | 112325 | `public/logo/icons/1024x1024.png`            | 不同（upstream-modified） |
| `public/logo/icons/128x128.png`              | 9624   | `public/logo/icons/128x128.png`              | 不同（upstream-modified） |
| `public/logo/icons/16x16.png`                | 754    | `public/logo/icons/16x16.png`                | 不同（upstream-modified） |
| `public/logo/icons/24x24.png`                | 1329   | `public/logo/icons/24x24.png`                | 不同（upstream-modified） |
| `public/logo/icons/256x256.png`              | 21347  | `public/logo/icons/256x256.png`              | 不同（upstream-modified） |
| `public/logo/icons/32x32.png`                | 1962   | `public/logo/icons/32x32.png`                | 不同（upstream-modified） |
| `public/logo/icons/48x48.png`                | 3146   | `public/logo/icons/48x48.png`                | 不同（upstream-modified） |
| `public/logo/icons/512x512.png`              | 49240  | `public/logo/icons/512x512.png`              | 不同（upstream-modified） |
| `public/logo/icons/64x64.png`                | 4366   | `public/logo/icons/64x64.png`                | 不同（upstream-modified） |
| `public/logo/icons/icon.icns`                | 250593 | `public/logo/icons/icon.icns`                | 不同（upstream-modified） |
| `public/logo/icons/icon.ico`                 | 123497 | `public/logo/icons/icon.ico`                 | 不同（upstream-modified） |

两类证据支持「用户提供的品牌资产」这一依据：

1. **来源清单事实**：路径与上游同路径、内容与上游字节不同，说明这些文件在上游路径上被换过内容。
2. **目视核对**：随机抽查 `public/logo/icons/256x256.png`（与 `packages/desktop/build/icons/256x256.png`、`public/logo/icons/1024x1024.png` 等同套），画面是 Knorvia 的黑白「K」图标（白色纸片底、深色圆角块、白色 K 字），与 ZCode/Z.ai 的原品牌无关。

登记内容见 `licensing/reviews.json`：29 条 `original`，license 按仓库根许可写 `Apache-2.0`，basis 明确写明「User-provided Knorvia brand asset（用户提供的 Knorvia 品牌资产）」，evidence 指向本文件与本计划书；上游路径关系仍由 `licensing/current-files.json` 如实保留。

## 3. 冻结证据包中的上游类型摘录（书面例外）

按计划书 M0-7 列出的 1 个类型摘录：

| 路径                                                                                     | 来源清单分类       | 上游同路径                          | 处置                           |
| ---------------------------------------------------------------------------------------- | ------------------ | ----------------------------------- | ------------------------------ |
| `docs/evidence/desktop-data-preview-root-packet-20261003/dataSizeWorker-public-api.d.ts` | upstream-unchanged | `packages/zcode-cua/pip-session.js` | 书面例外，不重写、不随产品发布 |

同类还有 2 个 `docs/evidence` 里的上游摘录，一并按同一类例外列出，避免漏账：

| 路径                                                                                 | 来源清单分类       | 上游同路径                                                                                                |
| ------------------------------------------------------------------------------------ | ------------------ | --------------------------------------------------------------------------------------------------------- |
| `docs/evidence/native-source-notices-20261003/msvc-spectre-package/LICENSE`          | upstream-unchanged | `third-party/native-search/licenses/c2cfccb812fe482101a8f04597dfc5a9991a6b2748266c47ac91b6a5aae15383.txt` |
| `docs/evidence/root-data-preview-20261003/packet/dataSizeWorker-public-api.d.ts.txt` | upstream-unchanged | `packages/zcode-cua/pip-session.js`                                                                       |

这些文件是以前独立替换留下的冻结证据（作者包、比对摘录），**不随产品发布**，按计划书「归零」口径书面列为例外：不重写，也不登记为 original。

编号 595 的更大一批冻结证据例外（`docs/evidence/`、`licensing/evidence/`、`docs/knorvia-*-author-inputs-*`）在 M0-3 的分诊表 `docs/knorvia-inherited-triage-2026-10-11.md` 第 4 节逐条列出。

## 4. 声明

- 本次只改 `licensing/reviews.json`（追加 29 条）并用 `pnpm provenance:report` 重新生成 `licensing/current-files.json`；不改任何产品代码、资产或界面。
- 图标本身没有改动，只是登记来源；差异是本次之前就已存在的。
- 两个摘要文件是共享生成物/追加文件：合并前 rebase 到最新 main 后重跑本文件的登记脚本与 `pnpm provenance:report` 即可，不要手工合并。
- 登记数字可复现：判据写在 `licensing/current-files.json` 的 `classification` 与 `upstream` 字段上。
