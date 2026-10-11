# M0-7：品牌图标登记与证据例外

日期：2026-10-11。分支：`m0/7-brand-icons`。对应《Knorvia 独立替换任务计划书》M0-7 与「已定的关键选择」第 11 条。

## 1. 已登记的 29 个品牌图标

依据：`docs/knorvia-icon-provenance.md`（用户选定并提供的图标素材，`scripts/generate-product-icons.py` 从批准的主图派生应用与安装器资产）。这些文件位于上游原路径，但内容是用户提供的 Knorvia 图标，按计划书第 11 条登记为 `original`，license 按仓库根许可写 `Apache-2.0`，evidence 指向上述说明与计划书副本。

| 路径                                         | 登记前            | 登记后   |
| -------------------------------------------- | ----------------- | -------- |
| `public/icon_512@2x.png`                     | upstream-modified | original |
| `public/logo/icons/16x16.png`                | upstream-modified | original |
| `public/logo/icons/24x24.png`                | upstream-modified | original |
| `public/logo/icons/32x32.png`                | upstream-modified | original |
| `public/logo/icons/48x48.png`                | upstream-modified | original |
| `public/logo/icons/64x64.png`                | upstream-modified | original |
| `public/logo/icons/128x128.png`              | upstream-modified | original |
| `public/logo/icons/256x256.png`              | upstream-modified | original |
| `public/logo/icons/512x512.png`              | upstream-modified | original |
| `public/logo/icons/1024x1024.png`            | upstream-modified | original |
| `public/logo/icons/icon.icns`                | upstream-modified | original |
| `public/logo/icons/icon.ico`                 | upstream-modified | original |
| `packages/desktop/build/icon.png`            | upstream-modified | original |
| `packages/desktop/build/icon.ico`            | upstream-modified | original |
| `packages/desktop/build/icon.icns`           | upstream-modified | original |
| `packages/desktop/build/icon.svg`            | unreviewed        | original |
| `packages/desktop/build/icon_installer.png`  | upstream-modified | original |
| `packages/desktop/build/icon_installer.ico`  | upstream-modified | original |
| `packages/desktop/build/icon_installer.icns` | upstream-modified | original |
| `packages/desktop/build/icon_windows.png`    | upstream-modified | original |
| `packages/desktop/build/icons/16x16.png`     | upstream-modified | original |
| `packages/desktop/build/icons/24x24.png`     | upstream-modified | original |
| `packages/desktop/build/icons/32x32.png`     | upstream-modified | original |
| `packages/desktop/build/icons/48x48.png`     | upstream-modified | original |
| `packages/desktop/build/icons/64x64.png`     | upstream-modified | original |
| `packages/desktop/build/icons/128x128.png`   | upstream-modified | original |
| `packages/desktop/build/icons/256x256.png`   | upstream-modified | original |
| `packages/desktop/build/icons/512x512.png`   | upstream-modified | original |
| `packages/desktop/build/icons/1024x1024.png` | upstream-modified | original |

合计 29 个，全部为图片/图标文件；登记依据同一句：Owner-provided Knorvia brand asset（用户提供的品牌资产）。

## 2. 清单数量前后对比

数字取自 `licensing/current-files.json` 的 summary。

| 分类                      | 登记前 | 登记后 | 变化 |
| ------------------------- | ------ | ------ | ---- |
| `generated-report`        | 1      | 1      | 0    |
| `independent-replacement` | 439    | 439    | 0    |
| `original`                | 4206   | 4235   | 29   |
| `reviewed-retained`       | 8      | 8      | 0    |
| `third-party`             | 2408   | 2408   | 0    |
| `unreviewed`              | 5729   | 5728   | -1   |
| `upstream-modified`       | 2414   | 2386   | -28  |
| `upstream-unchanged`      | 1369   | 1369   | 0    |

`reviewProblems` 均为 0；登记后 `missingReviews` 为空。内容与上游字节一致的文件不允许登记为 `original`（工具会判为 conflict），本次 29 个文件全部通过该检查，说明它们确实与上游内容不同。

## 3. 证据例外（书面列出，不登记为 original）

计划书「归零」口径允许保留“冻结证据包里的上游摘录（不随产品发布，书面列出）”。本轮实际存在下列与上游字节一致的文件，保持上游关系，**不**登记为 original：

| 证据文件                                                                                 | 对应上游路径                                                                                              | 收工分类           | 处理                            |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------- |
| `docs/evidence/desktop-data-preview-root-packet-20261003/dataSizeWorker-public-api.d.ts` | `packages/zcode-cua/pip-session.js`                                                                       | upstream-unchanged | 保持上游关系，不登记为 original |
| `docs/evidence/native-source-notices-20261003/msvc-spectre-package/LICENSE`              | `third-party/native-search/licenses/c2cfccb812fe482101a8f04597dfc5a9991a6b2748266c47ac91b6a5aae15383.txt` | upstream-unchanged | 保持上游关系，不登记为 original |
| `docs/evidence/root-data-preview-20261003/packet/dataSizeWorker-public-api.d.ts.txt`     | `packages/zcode-cua/pip-session.js`                                                                       | upstream-unchanged | 保持上游关系，不登记为 original |

计划书 M0-7 原文写“1 个上游类型摘录”；实测为 2 个同源类型摘录文件（`.d.ts` 与 `.d.ts.txt`）加 1 个第三方许可正文摘录。此处按实测逐一列出，数字与计划书不一致时以实测为准。

## 4. 声明

- 本轮只追加 `licensing/reviews.json` 并重新生成 `licensing/current-files.json`，未改动任何产品代码、图标文件或第三方材料。
- 证据例外文件不随产品发布，仅作为来源核验证据留在仓库里。
