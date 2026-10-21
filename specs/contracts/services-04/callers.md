# services-04 调用方清单

实测 2026-10-21。**本文件由脚本生成**（`tests/gen-callers.mjs`）；数字与 `dependencies.test.mjs` 的 B10 断言一致。

## 一、两种引用口径（⚠️ 只读口径 A 会误判「大部分是死代码」）

| 口径 | 含义 | 实测 | 用途 |
| :--- | :--- | ---: | :--- |
| **A. 直接引用** | 外部文件 `import` 本层 46 个实现文件之一 | **18 处** | 判断「哪些是内部实现细节」 |
| **B. 经聚合桶间接使用** | 外层通过 `@knorvia/services` 或 `@knorvia/services/node` 使用 | **379 个文件** | 说明「本层是包公开面的主体」 |

**⚠️ 关键事实**：**38 / 46 个模块零直接引用**（口径 A），
但它们全部通过聚合桶暴露给外层 —— 若只看口径 A，会得出「82.6% 是死代码」的错误结论。

### 口径 B 的明细

扫描 5927 个 `.ts`/`.tsx` 文件（排除 `node_modules` 与 `dist`）：

| 入口 | 引用文件数 |
| :--- | ---: |
| `@knorvia/services`（browser-safe 入口 → `index.ts`） | **345** |
| `@knorvia/services/node`（Node 入口 → `node.ts`） | **34** |

**两个聚合桶合计 144 条转发**（`index.ts` 56 条 + `node.ts` 88 条），
把本层 145 个导出中的公开部分暴露出去。见 `behavior.md` B6 的「转发面完整性断言」。

## 二、口径 A：按引用方分层

| 引用方 | 处数 |
| :--- | ---: |
| services/test | **15** |
| packages/desktop | **3** |
| **合计** | **18** |

## 三、口径 A：按被引用模块（降序，仅列有引用的）

| 模块 | 组 | 总引用 | services/test | packages/desktop |
| :--- | :--- | ---: | ---: | ---: |
| `paths.ts` | . | **4** | 4 | 0 |
| `terminal/terminal.ts` | terminal | **4** | 4 | 0 |
| `storage-startup.ts` | . | **3** | 0 | 3 |
| `terminal/terminalProfileTypes.ts` | terminal | **3** | 3 | 0 |
| `descriptors.ts` | . | **1** | 1 | 0 |
| `subagents/subagentStorage.ts` | subagents | **1** | 1 | 0 |
| `system/integratedTerminalShells.ts` | system | **1** | 1 | 0 |
| `usage-stats/usageStatsService.ts` | usage-stats | **1** | 1 | 0 |

## 四、零直接外部引用的模块（38 个）

以下模块**没有任何包外直接引用**（口径 A），但它们**都通过聚合桶暴露**或**是纯内部实现**：

- `accessor.ts`（.）
- `collection.ts`（.）
- `dataLocationOwner.ts`（.）
- `memoryDiagnostics.ts`（.）
- `subagents/subagentMarkdown.ts`（subagents）
- `subagents/subagentModelSelection.ts`（subagents）
- `subagents/subagentServiceFiles.ts`（subagents）
- `subagents/subagentServicePlugins.ts`（subagents）
- `subagents/subagentServiceState.ts`（subagents）
- `subagents/subagents.ts`（subagents）
- `subagents/subagentsService.ts`（subagents）
- `system/ssh-alias/configuration.ts`（system）
- `system/ssh-alias/fallback.ts`（system）
- `system/ssh-alias/query.ts`（system）
- `system/ssh-alias/tokens.ts`（system）
- `system/sshConfigAlias.ts`（system）
- `system/system-probe/contracts.ts`（system）
- `system/system-probe/defaultAdapters.ts`（system）
- `system/system-probe/targetLifecycle.ts`（system）
- `system/system.ts`（system）
- `system/systemService.ts`（system）
- `system/systemServiceOwner.ts`（system）
- `terminal/terminalProfile.ts`（terminal）
- `terminal/terminalProfileMacOs.ts`（terminal）
- `terminal/terminalProfileMacOsDecode.ts`（terminal）
- `terminal/terminalProfileMacOsPlist.ts`（terminal）
- `terminal/terminalProfilePortableFormats.ts`（terminal）
- `terminal/terminalProfilePortablePlan.ts`（terminal）
- `terminal/terminalProfilePortableRead.ts`（terminal）
- `terminal/terminalService.ts`（terminal）
- `terminal/terminalServiceInstanceOwner.ts`（terminal）
- `terminal/terminalServiceLaunchPlan.ts`（terminal）
- `usage-stats/usageStats.ts`（usage-stats）
- `window-controller/node.ts`（window-controller）
- `window-controller/windowController.ts`（window-controller）
- `window-controller/windowHostControllerProjection.ts`（window-controller）
- `window-controller/windowHostControllerService.ts`（window-controller）
- `window-controller/windowHostSessionsIndexObserver.ts`（window-controller）

**⚠️ 不得因为「零直接引用」而删除任何一个** ——
它们要么经聚合桶被外部使用，要么被本层其他模块依赖（见 `scope.mjs` 的 `internalEdges()`）。

## 五、口径说明

- **口径 A（直接引用）** = 引用方不在本包 46 个实现文件之列（含同包其他层、其他 workspace 包、`apps/cli`）；
- **层内依赖**（46 个文件互相引用）见 `scope.mjs` 的 `internalEdges()` / `.frozen.json` 的 `edgeList`（64 条），本文件不重复统计；
- 两个包级聚合桶（`index.ts` / `node.ts`）的转发**不计入口径 A** —— 它们是公开面出口，
  见口径 B 与 `behavior.md` B6。
