# core-02 调用方（合同阶段实测）

范围见 `README.md`。调用点用入口级文本搜索（ripgrep over `apps/`、`packages/`、`scripts/`）得到，另用 `pnpm dep:refs` 抽样核对导出名的引用面。

## 1. 区域桶与模块入口

| 入口                                | 主要调用点                                                                                                      |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `memory/*`（无桶）                  | `apps/cli/packages/core/src/runtime/**`、`bootstrap/src/app/**`（记忆注入与提取）、`core/test/memory-*.test.ts` |
| `memory/recall/index.ts`            | `apps/cli/packages/core/src/runtime/**`（召回清单）、`bootstrap/src/app/**`                                     |
| `model/auxiliary-model-options.ts`  | `core/src/runtime/methods/auxiliary-*.ts`、`bootstrap/src/app/**`（辅助调用与压缩）                             |
| `permission/index.ts`               | `core/src/runtime/**`、`bootstrap/src/app/**`、`apps/cli/packages/cli/src/**`（确认窗与权限中转）               |
| `permission/workflow-draft-path.ts` | `core/src/tool/handlers/**`（Edit/Write 免确认判定）                                                            |
| `plugin-reference/index.ts`         | `core/src/runtime/methods/**`（回合末提醒）、`core/test/plugin-reference-*.test.ts`                             |
| `runtime-task/index.ts`             | `core/src/runtime/**`、`bootstrap/src/app/**`（后台任务注册表与通知）                                           |
| `session-context/*`                 | `core/src/tool/handlers/**`（ReadSessionContext）、`core/src/runtime/**`（提醒注入）                            |
| `subagent/index.ts`                 | `core/src/tool/handlers/agent*.ts`、`core/src/runtime/**`、`core/test/subagent-*.test.ts`                       |
| `subagent/tool-policy.ts`           | `core/src/tool/handlers/agent*.ts`（子代理工具面装配）                                                          |
| `subagent/runtime-task-registry.ts` | 再导出 `../runtime-task/registry.js`（子代理路径的别名入口）                                                    |

## 2. 包根再导出

`core/src/index.ts` 再导出本区若干符号（`resolveProjectMemoryRoot`、`permission/*`、`plugin-reference/index`、`runtime-task/index`、`subagent/index` 等）。这些符号同时属于包根公开面（core-03 的合同范围），替换本区时**不得改名或改变签名**。

## 3. `dep:refs` 抽样核对

```
pnpm dep:refs --list-exports apps/cli/packages/core/src/memory/extraction.ts
pnpm dep:refs --list-exports apps/cli/packages/core/src/subagent/profile.ts
pnpm dep:refs --list-exports apps/cli/packages/core/src/runtime-task/registry.ts
```

已知陷阱（记在合同里，替换阶段照此判断）：`dep:refs` 对「包名入口 + 桶再导出」有**假阴性**——一个名字可能只经 `@knorvia/core` 包名在别包使用，而在文件级引用里看不到；经 `runtime/deps.ts` 再导出的符号属别包公开面，**不删**。
