# M0-15 unreviewed 归零收尾（2026-10-11）

主仓提交：`6ea4cbe7`（执行基线 `beff12b5`）　认领 issue：#109

M0 任务清单没有单列本项；依据是计划书 **M0 退出条件**「unreviewed 只剩书面列出、各有理由的例外」。合并现有 PR 后 `unreviewed` 剩 2,713 个，除本文覆盖的 5 个外全部已有归属（M0-2、M0-3、M0-14）。

## 1. 登记的 4 个文件

| 路径                                              | 性质             | 依据要点                                                                   |
| ------------------------------------------------- | ---------------- | -------------------------------------------------------------------------- |
| `docs/knorvia-independent-replacement-plan.md`    | Knorvia 自写文档 | 计划书副本；列出范围、决策、里程碑与验收标准，不含上游源码正文             |
| `docs/knorvia-provenance-bookkeeping-20261010.md` | Knorvia 自写文档 | 第一轮记账报告；只含路径与原因，不含上游源码正文                           |
| `licensing/frozen-evidence.json`                  | 生成的审计数据   | 冻结证据包的完整性清单（路径 + sha256 + 字节数），由来源工具生成与显式刷新 |
| `licensing/upstream-baseline.json`                | 生成的审计数据   | 固定上游提交 872ad960 的清单（路径、mode、blob、摘要），不含上游文件内容   |

4 条都登记为 `original`，license 按仓库根许可 `Apache-2.0`，evidence 指向规格、工具与本文件。

## 2. 书面列出的自引用例外（1 个）

| 路径                                                                                                                                                                                                                                                                                                                                                                                             | 原因 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| `licensing/reviews.json`,Self-reference: adding a review record for this file changes its own digest, so the record would be stale immediately and provenance:check would report reviewProblems. The file is the editable source of provenance decisions described in specs/knorvia-independent-implementation.md; it is listed in writing as an accepted exception instead of being registered. |

这与计划书「归零口径」允许的第三类例外一致：该文件是**来源决定本身**，给它加记录会让摘要立即过期（`reviewProblems` 变 1、`provenance:check` 失败），因此只能在书面清单里列出，而不是登记。

## 3. 声明

- 只追加 `licensing/reviews.json` 与新增文档；`licensing/current-files.json` 由 `pnpm provenance:report` 重生成。
- 登记后 `pnpm provenance:check` 必须 `reviewProblems: 0`；若自引用文件被误登记会立刻失败，这是一道天然护栏。
