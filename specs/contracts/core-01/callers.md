# core-01 调用方（callers.md）

> 本文件按块增量补齐。当前记录第一块（`mcp` + `embedded-search`）的调用方与 `dep:refs` 核对结果。

方法：入口级文本搜索（ripgrep，`apps/`、`packages/`、`scripts/`，排除 `node_modules`、`dist`、本地工具目录）+ `pnpm dep:refs <file>:<export>` 抽样核对。同一文件多次命中只记一行。

## 1. 第一块的调用方

### `@knorvia/core`（包根）

包根是本包唯一的全量入口（`agent`/`context`/`compact`/`mcp` 四个区都从这里转出）。**注意**：包根在源码入口（tsx）下当前不可加载（见 `known-differences.md` §2，属 core-03 范围）；本包契约测试因此用区域桶。

### `mcp/name.ts`

- `apps/cli/packages/core/src/subagent/mcp-config.ts:2` — `matchesModelVisibleMcpServerName`
- `apps/cli/packages/core/src/subagent/computer-use-policy.ts:7` — `toMcpToolName`、`toModelVisibleMcpNamePart`
- `apps/cli/packages/core/src/mcp/index.ts:15,22` — `toMcpToolName`（并再导出）

### `mcp/image-normalization.ts`

- `apps/cli/packages/core/src/mcp/index.ts:14,23-27` — `normalizeMcpToolResultForModel`（内部使用）+ 三个阈值常量（再导出）
- `apps/cli/packages/core/src/tool/executor/invocation/outcome.ts:12` — `hasOfficialCuaFrameAuthority`
- `apps/cli/packages/core/src/runtime/methods/browser-turn-screenshot.ts:8` — `HOST_NODE_REPL_IMAGE_MAX_DIMENSION`

### `mcp/result-format.ts`

- `apps/cli/packages/core/src/mcp/index.ts:20` — `formatMcpToolResult`（仅内部使用，不经桶导出）

### `mcp/windows-computer-use.ts`

- `apps/cli/packages/core/src/mcp/index.ts:16-19` — 三个函数（内部使用）
- `apps/cli/packages/core/src/runtime/methods/subagent-authority.ts:6` — `restrictBorrowedWindowsComputerUse`

### `embedded-search/capability.ts`

- `apps/cli/packages/core/src/runtime/methods/subagent.ts:21,64,91` — `resolveEmbeddedSearchBranchCapability`
- `apps/cli/packages/core/src/runtime/methods/embedded-search-branch.ts:4,13` — 同上
- `apps/cli/packages/core/src/tool/executor/invocation/context.ts:4,22` — 同上

### `embedded-search/shell.ts`

- `apps/cli/packages/core/src/tool/handlers/bash.ts:26-28,395,398` — `shouldInjectEmbeddedSearchBashPrelude`、`supportsEmbeddedSearchShellSelection`

**结论**：第一块的 7 个文件都有真实调用方（包内），没有"无去向"的文件；`embedded-search/*` 与 `mcp` 的部分导出不经公开入口，属"间接覆盖"（见 `acceptance.md` §4.1）。

## 2. `dep:refs` 抽样核对（含两条"knip 说未使用但有去向"）

| 查询                                                             | dep:refs 结果                                        | 文本搜索/复核                      | 结论                                   |
| ---------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------- | -------------------------------------- |
| `compact/manual.ts:getMessagesToSummarize`                       | 1 处（本文件内）+ 2 处再导出（`compact/index.ts:9`） | **`runtime/deps.ts:299` 也再导出** | knip 报"未使用"但实际有去向 → **不删** |
| `agent/read-file-state-hydrator.ts:ReadFileStateHydrationResult` | 2 处（本文件内类型标注）                             | **`runtime/deps.ts:255` 再导出**   | 同上 → **不删**                        |

**工具局限（如实记录）**：`dep:refs` 只做按文件路径的静态符号解析，不跟随"包名入口 + 桶再导出"（issue #116 记录过同类问题），对 `@knorvia/core` 这类入口会有**假阴性**；本包判定以入口级文本搜索为主、`dep:refs` 用于看包内实现引用，两者不一致时以上表为准并记录在案。这一条与 `contracts-03` 的 `callers.md` 末节一致。
