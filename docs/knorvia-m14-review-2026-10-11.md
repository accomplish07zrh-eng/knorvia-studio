# M0-14 无可测保留表达的继承文件复核（2026-10-11）

主仓提交：`6ea4cbe7`（执行基线 `beff12b5`）　认领 issue：#100

依据《Knorvia 独立替换任务计划书》M0-14：「48 个已无可测保留表达的继承文件逐个复核；供应商标志按来源清单登记」，完成标准「每个文件写明两道相似度实测值；结构仍沿用上游的退回替换包」。

## 1. 口径与实测结果

比较对象与验收一致：**当前文件 × 整个上游固定提交 `872ad960`**（M0-8 的 `scripts/provenance/similarity.mjs`，门槛常量写死后不再调）：行门槛 = 规范化行数 ≥ 10 时包含率 < 0.20 且最长相同段 < 8、< 10 行时必须为 0；结构门槛 = 结构相似度 < 0.40。「已无可测保留表达」= **行包含率为 0 且结构相似度为 0**。

| 口径                                            | 数量 |
| ----------------------------------------------- | ---- |
| `upstream-modified` 候选文件                    | 2414 |
| 其中二进制                                      | 32   |
| 行包含率为 0 且结构为 0（**本项登记**）         | 23   |
| 行包含率为 0 但结构仍沿用上游（**退回替换包**） | 1    |

登记的 23 个文件合计 见下表；两个指标都写进 `licensing/reviews.json` 的 basis。

| 路径                                                             | 规范化行数 | 行包含率 | 结构相似度         | 上游同路径                            |
| ---------------------------------------------------------------- | ---------- | -------- | ------------------ | ------------------------------------- |
| `.env.development`                                               | 1          | 0.00     | 不适用（非脚本类） | 保留在 `licensing/current-files.json` |
| `.env.example`                                                   | 10         | 0.00     | 不适用（非脚本类） | 保留在 `licensing/current-files.json` |
| `.env.production`                                                | 1          | 0.00     | 不适用（非脚本类） | 保留在 `licensing/current-files.json` |
| `NOTICE.md`                                                      | 16         | 0.00     | 不适用（非脚本类） | 保留在 `licensing/current-files.json` |
| `README.md`                                                      | 31         | 0.00     | 不适用（非脚本类） | 保留在 `licensing/current-files.json` |
| `apps/cli/packages/browser-use-plugin/README.md`                 | 3          | 0.00     | 不适用（非脚本类） | 保留在 `licensing/current-files.json` |
| `apps/cli/packages/browser-use-plugin/docs/overview.md`          | 4          | 0.00     | 不适用（非脚本类） | 保留在 `licensing/current-files.json` |
| `apps/cli/packages/browser-use-plugin/docs/recording.md`         | 3          | 0.00     | 不适用（非脚本类） | 保留在 `licensing/current-files.json` |
| `apps/cli/packages/browser-use-plugin/docs/workflow.md`          | 8          | 0.00     | 不适用（非脚本类） | 保留在 `licensing/current-files.json` |
| `apps/cli/packages/cli/src/command-center/slash-command-help.ts` | 3          | 0.00     | 0.0000             | 保留在 `licensing/current-files.json` |
| `apps/cli/packages/cli/src/index.ts`                             | 1          | 0.00     | 0.0000             | 保留在 `licensing/current-files.json` |
| `apps/cli/packages/core/src/workflow/scheduler/graph.ts`         | 0          | 0.00     | 0.0000             | 保留在 `licensing/current-files.json` |
| `apps/cli/packages/node-repl-host/README.md`                     | 3          | 0.00     | 不适用（非脚本类） | 保留在 `licensing/current-files.json` |
| `apps/cli/packages/tui/src/app-locale.ts`                        | 1          | 0.00     | 0.0000             | 保留在 `licensing/current-files.json` |
| `config/default.json`                                            | 0          | 0.00     | 不适用（非脚本类） | 保留在 `licensing/current-files.json` |
| `packages/desktop/src/host/windowHostControllerService.ts`       | 1          | 0.00     | 0.0000             | 保留在 `licensing/current-files.json` |
| `packages/desktop/src/host/windowHostSessionsIndexObserver.ts`   | 2          | 0.00     | 0.0000             | 保留在 `licensing/current-files.json` |
| `packages/desktop/src/main/desktopArchitectureGuard.ts`          | 2          | 0.00     | 0.0000             | 保留在 `licensing/current-files.json` |
| `packages/provider-node/src/index.ts`                            | 0          | 0.00     | 0.0000             | 保留在 `licensing/current-files.json` |
| `packages/services/src/storage-startup.ts`                       | 0          | 0.00     | 0.0000             | 保留在 `licensing/current-files.json` |
| `packages/ui/src/hooks/useDynamicWorkflowAvailability.ts`        | 4          | 0.00     | 0.0000             | 保留在 `licensing/current-files.json` |
| `packages/ui/src/hooks/useWorkspacePrepare.ts`                   | 0          | 0.00     | 0.0000             | 保留在 `licensing/current-files.json` |
| `packages/ui/src/workspace-file-search/workspaceFileSearch.ts`   | 0          | 0.00     | 0.0000             | 保留在 `licensing/current-files.json` |

### 1.1 退回替换包的文件（结构仍沿用上游）

| 路径                                      | 规范化行数 | 行包含率 | 结构相似度 |
| ----------------------------------------- | ---------- | -------- | ---------- |
| `packages/ui/src/lib/providerCliIcon.tsx` | 3          | 0.00     | 1.0000     |

## 2. 与计划书「48 个约 3,100 行」的差异（如实说明）

计划书写的是「48 个（约 3,100 行）」。用今天可复现的验收口径实测得到 **23 个**（另 1 个退回替换包），差异原因：

1. **口径细节**：如果把「保留」理解为只与**同路径**的上游实现比较（不看整个上游树），同一批候选里行包含率为 0 的有 44 个，规模与计划书的 48 接近；验收口径要求比较整个上游固定提交，比较面更大、包含率只会更高，所以 0 的集合更小（本项采用验收口径，**更保守**）。
2. **状态漂移**：计划书写作时的 `upstream-modified` 集与今天不同（快照 `1ac688f7` 之后有改动），候选数与文件内容都变过。
3. 计划书没有记录当时的规范化实现细节，无法逐字节复现那 48 个；本文用 M0-8 的认证工具重做，数值可复现（第 3 节命令）。

**保守处理**：没有被本文口径覆盖的其余 `upstream-modified` 文件**仍按继承处理**，照常随对应替换包写合同、重写；本项只把「两道指标都为 0」的文件登记为 original，不扩大豁免范围。

## 3. 复现命令

```text
node scripts/provenance/similarity.mjs --repo <本工作树> --classification upstream-modified \
  --upstream-dir <仓库外上游树> --upstream-rev 872ad960de7ec172591f7e1952f7849229f94521 \
  --json lead/m14-similarity.json
node lead/m14-register.mjs lead/m14-similarity.json <本工作树> --apply
pnpm provenance:report
```

## 4. 声明

- 只追加 `licensing/reviews.json`，不改代码、不改资产；`licensing/current-files.json` 由 `pnpm provenance:report` 重生成。
- 每个登记文件的 basis 写明行包含率与结构相似度两个实测值，以及「不重写」这个结论的依据。
- 供应商标志按来源清单登记属于本项范围，但 M0-6 已把第三方标志部分登记完毕（`model-provider-logo-sources.json` 的官方来源），本项没有重复登记。
