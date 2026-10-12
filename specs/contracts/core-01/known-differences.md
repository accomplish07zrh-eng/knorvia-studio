# core-01 已知差异（known-differences.md）

> 本文件按块增量补齐；当前记录 `mcp` / `embedded-search` 块（M1–M5、E1–E2）的边界与既有语义。

## 1. 不在本包合同内、由谁覆盖（平台相关与外部依赖）

| 不在本包合同内的行为 | 覆盖方 | 原因 |
| --- | --- | --- |
| Windows Computer Use 的**真实窗口接管**（枚举/请求访问/观测/操作/停止在真实桌面上的效果） | `core-runtime-*` 合同 + 桌面冒烟 | 需要真实 Windows 会话与宿主权限；本包只冻结传输上限、受信判定与借用策略（M5） |
| PNG 几何校验与观测身份（帧像素、缩放质量、宿主侧校验） | 宿主实现 + 桌面冒烟 | 本包按契约**不缩放、不丢帧**，只守上限（M5） |
| 官方 CUA 帧的保留与完整性（`preserveOfficialCuaFrameResult`） | `@knorvia/cua` 的 `frame-contract` + 桌面冒烟 | 依赖 `@knorvia/cua` 的帧契约与真实像素；本包只做转交判定（M3 的 `hasOfficialCuaFrameAuthority`） |
| 真实桌面环境下超大截图的压缩质量与落盘路径 | `core-runtime-*`（artifact store 实现）+ 桌面冒烟 | 本包只冻结阈值与文案（M3），压缩器由注入的 `imageProcessorPort` 提供 |
| 内嵌搜索分支在真实 shell 中的 `find()`/`grep()` 注入效果 | `core-runtime-*` + 工具层（`tool/executor/invocation/context.ts`） | 本包只冻结判定与 dialect 白名单（E1/E2） |

## 2. 包根入口在源码入口（tsx）下不可加载（属 core-03 范围）

`apps/cli/packages/core/src/index.ts:21` 把**类型** `ToolExecutor` 当值再导出：

```ts
export { createToolExecutor, ToolExecutor, ToolExecutorImpl } from "./tool/executor.js";
```

`tsc` 构建时会省略纯类型说明符（dist 入口正常），但契约测试源码入口走 `tsx` 逐文件转译，无法判断该名字是类型 → import 包根会抛
`SyntaxError: The requested module './tool/executor.js' does not provide an export named 'ToolExecutor'`。

处置：本包（core-01）的契约测试改用**区域桶** `src/mcp/index.ts` 做黑盒入口，并把该问题登记在此；`src/index.ts` 属 **core-03** 范围，修法是在该行拆出 `export type { ToolExecutor }`。这是本包发现、留给 core-03 的**跨包问题**，不是本包 38 个文件的缺陷。

## 3. 只有内部可达的导出（间接覆盖）

`mcp` 区经区域桶公开的运行时导出只有 6 个：`toMcpToolName`、`MCP_IMAGE_INLINE_BASE64_BYTES`、`MCP_IMAGE_INLINE_RAW_BYTES`、`HOST_NODE_REPL_IMAGE_MAX_DIMENSION`、`registerMcpTools`、`McpToolOutputJsonSchema`。
以下导出**只被包内调用方使用**，因此不做黑盒断言，其阈值与文案在替换阶段用内部单测逐字冻结（同 contracts-03 的做法）：

- `normalizeMcpToolResultForModel`（`tool/executor/invocation/outcome.ts`、`runtime/methods/browser-turn-screenshot.ts`）
- `toModelVisibleMcpNamePart`、`matchesModelVisibleMcpServerName`（`subagent/mcp-config.ts`、`subagent/computer-use-policy.ts`）
- `formatMcpToolResult`、`asDataUrl`、`base64PayloadFromMcpImageData`、`hasOfficialCuaFrameAuthority`（工具执行层）
- `isTrustedWindowsComputerUseTool`、`restrictBorrowedWindowsComputerUse`、`preserveWindowsComputerUseFrames`（`runtime/methods/subagent-authority.ts`）
- `embedded-search/capability.ts`、`embedded-search/shell.ts` 的全部导出（`runtime/methods/subagent.ts`、`runtime/methods/embedded-search-branch.ts`、`tool/executor/invocation/context.ts`）

## 4. 必须保留的既有语义（不是缺陷）

1. **名称 sanitize**：非 `[A-Za-z0-9_-]` → `_`、连续 `_` 压成一个、空结果 → `"unknown"`；`toMcpToolName` 优先用 `descriptor.name`。
2. **错误形态固定**：`MCP tool returned an error.`（windows 帧追加）、`MCP tool returned an error:\n…`（默认）、`message_only` 时原样返回内容；`Computer Use is unavailable to subagents`；`Computer Use frame exceeds the single PNG image limit`；`Computer Use result exceeds the text limit`。
3. **阈值逐字冻结**：`MCP_IMAGE_INLINE_BASE64_BYTES = 204800`、`MCP_IMAGE_INLINE_RAW_BYTES = 153600`、`HOST_NODE_REPL_IMAGE_MAX_DIMENSION = 2048`、`WINDOWS_COMPUTER_USE_MAX_IMAGE_BYTES = 8388608`、`WINDOWS_COMPUTER_USE_MAX_TEXT_BYTES = 65536`、压缩路径 `maxDimension = 2000`。
4. **未变化时返回同一对象**：`normalizeMcpToolResultForModel` 在内容未变时返回入参本身（不是副本）；`preserveWindowsComputerUseFrames` 通过时返回入参本身。
