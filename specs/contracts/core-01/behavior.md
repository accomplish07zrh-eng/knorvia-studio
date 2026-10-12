# core-01 行为规格（behavior.md）

每条编号 `M1`、`M2`…（`M` = mcp/embedded-search 块）、`A`（agent）、`C`（compact）、`X`（context），发布后编号不重用。每条写：输入、输出、错误语义、时序与并发、幂等、资源释放、平台差异、状态所有者、日志级别；不适用的项写「不适用」。每条至少被 `tests/` 里一个断言覆盖（末尾标注）。

本包范围：`apps/cli/packages/core/src` 下 `agent`（11 继承）、`compact`（6）、`context`（14）、`embedded-search`（2）、`mcp`（5），共 38 个继承文件。**本文件按块增量补齐**：已写 `mcp` + `embedded-search`（M1–M5、E1–E2）与 `compact`（C1–C6）两块；`agent` / `context` 两块在后续步骤补入（补入前不得合并合同）。

## M1 模型可见 MCP 名称（`mcp/name.ts`）

- 输入：`toModelVisibleMcpNamePart(name)`；`toMcpToolName({name?, serverName, toolName})`；`matchesModelVisibleMcpServerName(requiredName, serverName)`。
- 输出：`toModelVisibleMcpNamePart` 把非 `[A-Za-z0-9_-]` 的字符替换为 `_`、把连续 `_` 压成一个，**结果为空串时返回 `"unknown"`**；`toMcpToolName` 优先返回 `descriptor.name`（已给时原样），否则返回 `` `mcp__${server}__${tool}` ``（两段各自过 sanitize）；`matchesModelVisibleMcpServerName` 先对两侧 `trim().toLowerCase()`，`requiredName` 为空 → `false`，否则 raw 或 sanitized 形式满足**相等或包含**即为 `true`。
- 错误语义：三个函数都不抛错（`null`/`undefined` 入参在类型层被拒）。时序与并发：纯函数。幂等：是。资源释放：不适用。平台差异：不适用。状态所有者：无。日志级别：不适用。
- 常量（兼容面）：名称前缀 `mcp__`、分隔符 `__`、未知占位 `"unknown"`。
- （测试：tests/mcp.test.mjs「M1 模型可见 MCP 名称与匹配」）

## M2 MCP 结果投影（`mcp/result-format.ts`）

- 输入：`formatMcpToolResult(output, preserveWindowsFrame = false)`，`output` 为任意值。
- 输出：非 MCP 形状（没有 `content` 数组）→ `JSON.stringify(output, null, 2)`（不可序列化时 `String(value)`）。MCP 形状逐块投影：`text` 非空保留、空串**丢弃**；`image` 且 `data`/`mimeType` 都是字符串 → `{type:"image", mediaType, dataUrl: "data:<mime>;base64,<data>", source:{id:"mcp-image", kind:"inline", mimeType, placeholder:"MCP image", sizeBytes: floor(base64长度*3/4)}}`，`preserveWindowsFrame` 时额外带 `detail:"original"`；`image` 缺字段 → `[MCP image content omitted: <mimeType|unknown>]`；`audio` → `[MCP audio content omitted: <mimeType|unknown>]`；`resource` → `MCP resource content:\n<JSON>`；其它 → 该块的 JSON。`structuredContent` **有内容**（非 null/undefined、数组非空、对象键非空、标量）才追加 `Structured content:\n<JSON>`。全部块都是 text 时用 `\n\n` 连接成一个字符串，否则保持块数组；块数组为空 → 回落到整个 output 的 JSON。
- 错误语义：`isError` 为真时：`preserveWindowsFrame` 且内容是数组 → 追加 `{type:"text", text:"MCP tool returned an error."}`；`_meta["knorvia/errorPresentation"] === "message_only"` → 原样返回内容；否则返回 `MCP tool returned an error:\n<内容的纯文本>`。函数不抛错。
- 时序与并发：纯函数（`flatMap` 顺序即输入顺序）。幂等：是。资源释放：不适用。平台差异：`preserveWindowsFrame` 只影响 `detail` 与错误追加方式，不改变图片字节。状态所有者：无。日志级别：不适用。
- 常量（兼容面）：`Structured content:\n`、`MCP tool returned an error.`、`MCP tool returned an error:\n`、`[MCP image content omitted: …]`、`[MCP audio content omitted: …]`、`MCP resource content:\n`、meta 键 `knorvia/errorPresentation` 与取值 `message_only`。
- （测试：tests/mcp.test.mjs「M2 结果投影：文本/图片/音频/资源/结构化与错误形态」）

## M3 图像内联阈值与超大图投影（`mcp/image-normalization.ts`）

- 输入：常量 `MCP_IMAGE_INLINE_BASE64_BYTES`、`MCP_IMAGE_INLINE_RAW_BYTES`、`HOST_NODE_REPL_IMAGE_MAX_DIMENSION`；纯函数 `asDataUrl(data, mimeType)`、`base64PayloadFromMcpImageData(data)`、`hasOfficialCuaFrameAuthority(result)`；异步 `normalizeMcpToolResultForModel(input)`。
- 输出（**阈值逐字冻结**）：`MCP_IMAGE_INLINE_BASE64_BYTES = 200 * 1024 = 204800`；`MCP_IMAGE_INLINE_RAW_BYTES = floor(204800 * 3 / 4) = 153600`；`HOST_NODE_REPL_IMAGE_MAX_DIMENSION = 2048`。`asDataUrl`：已以 `data:` 开头原样返回，否则拼 `data:<mime>;base64,<data>`；`base64PayloadFromMcpImageData`：非 `data:` 原样返回，`data:` 且有逗号时取逗号后内容，无逗号原样返回。`normalizeMcpToolResultForModel`：base64 长度 ≤ 204800 的 image 块**原样通过**（返回同一对象）；超限且 `compressOversizedImages` 为真 → 先交给 `imageProcessorPort.prepareForModel`（`maxBase64Bytes=204800`、`maxRawBytes=153600`、`maxDimension=2000`），压缩结果 ≤ 204800 且 `mediaType` 以 `image/` 开头才替换，否则回落；回落时若无 `artifactStore` → 文本 `MCP image content omitted: <mime>, base64=<n> exceeds inline limit <n>.` + `No artifact store is configured, so the original image could not be saved.`；有 store → 写 artifact 后文本 `MCP image content saved instead of being inlined: …` + `Artifact: <path|uri>` + `Artifact URI: <uri>`；被 `_meta["knorvia/browserScreenshotContentIndices"]` 标记且可写的截图会先落盘并在其后追加 `Browser screenshot saved to: <path>`；官方 CUA 帧（`preserveOfficialCuaFrames` 或 node_repl 上下文 + `_meta` 帧完整性键 + 图片后紧跟 `isOfficialCuaImageRefText` 文本）整体交给 `@knorvia/cua` 的 `preserveOfficialCuaFrameResult`；内容未变化时返回**原对象**。
- 错误语义：`hasOfficialCuaFrameAuthority` 对非对象/无 content/无帧完整性 meta/没有"图片+引用文本"配对一律 `false`；`normalizeMcpToolResultForModel` 仅在 `abortSignal.aborted` 时把底层错误原样抛出，否则吞掉处理器/存储失败并回落为省略文案。
- 时序与并发：按 `content` 顺序逐个 await（顺序确定）；同一输入重复调用结果一致（除依赖 store 生成的 artifact 路径/URI）。幂等：是（未变化时返回同一引用）。资源释放：artifact 以 `retention:"session"` 写入，由 artifact store 负责清理；本函数不持有句柄。平台差异：`isAbsolute`/`resolve` 只用于把 artifact 路径规范化为绝对路径，Windows 与 POSIX 都走 Node 的 `path`。
- 状态所有者：artifact store（由调用方注入）；本函数无状态。日志级别：不适用（无日志调用）。
- 平台边界：**真实像素与 CUA 帧完整性**（缩放质量、像素保留、真实截图大小）不在本包合同内，见 `known-differences.md`。
- （测试：tests/mcp.test.mjs「M3 阈值常量与 base64 工具」「M3 超大图：无 store 的省略文案」「M3 超大图：有 store 的保存文案」「M3 小图原样通过」）

## M4 MCP 桶与公开入口（`mcp/index.ts`）

- 输入：`@knorvia/core` 包根入口与 `mcp/` 桶。
- 输出：`mcp` 区的运行时导出（`toMcpToolName`、`toModelVisibleMcpNamePart`、`matchesModelVisibleMcpServerName`、`formatMcpToolResult`、`normalizeMcpToolResultForModel`、`asDataUrl`、`base64PayloadFromMcpImageData`、`hasOfficialCuaFrameAuthority`、`isTrustedWindowsComputerUseTool`、`restrictBorrowedWindowsComputerUse`、`preserveWindowsComputerUseFrames`、三个图像常量）都能从包根取到，形态与 `interface.md` 一致。
- 错误语义：入口缺失或形态不符即违约。时序与并发：模块求值一次。幂等：重复 import 返回同一命名空间。资源释放：不适用。平台差异：不适用。状态所有者：模块自身。日志级别：不适用。
- （测试：tests/mcp.test.mjs「M4 MCP 区导出面与形态」）

## M5 Windows Computer Use 的传输与借用策略（`mcp/windows-computer-use.ts`）

- 输入：`isTrustedWindowsComputerUseTool(descriptor, trustedServerNames)`；`restrictBorrowedWindowsComputerUse(borrowed, trustedServerNames)`；`preserveWindowsComputerUseFrames(result)`。
- 输出（**阈值逐字冻结**）：受信工具集 = `computer_list_windows`、`computer_request_access`、`computer_observe`、`computer_action`、`computer_stop`；只有 `trustedServerNames` 含该 `serverName` **且** `toolName` 在集合内才为受信；`restrictBorrowedWindowsComputerUse` 从 `snapshot.tools` 中过滤掉受信工具，返回的 port 对受信工具的 `callTool` **抛错** `Computer Use is unavailable to subagents`，其余调用原样透传（`close`/`connect*`/`disconnect*`/`status` 同样透传），`listTools()` 返回过滤后的快照。`preserveWindowsComputerUseFrames`：图片块必须**恰好 1 个**、`mimeType === "image/png"`、`data` 为字符串且 base64 字节 ≤ `8 * 1024 * 1024 = 8388608`，否则抛 `Computer Use frame exceeds the single PNG image limit`；非图片块与 `structuredContent` 的 JSON 字节合计 ≤ `64 * 1024 = 65536`，否则抛 `Computer Use result exceeds the text limit`；通过时**返回同一对象**（不缩放、不丢帧）。
- 错误语义：两个上限都以 `Error` 抛出且文案固定；不做截断或降级。
- 时序与并发：纯函数（同步）。幂等：是。资源释放：不适用。平台差异：判定本身与平台无关（本包只守传输上限与借用策略）；**真实 Windows 窗口接管、PNG 几何与观测身份校验由宿主/`core-runtime-*` 负责**，见 `known-differences.md`。状态所有者：调用方注入的 port 与 trusted 集合。日志级别：不适用。
- （测试：tests/mcp.test.mjs「M5 受信判定与借用限制」「M5 帧上限与错误形态」）

## E1 内嵌搜索分支判定（`embedded-search/capability.ts`）

- 输入：`resolveEmbeddedSearchBranchCapability({bashAvailable, embeddedSearchBranchEnabled?})`。
- 输出：全局开关默认 `ENABLE_EMBEDDED_SEARCH_BRANCH = true`；判定优先级：开关为假 → `{reason:"disabled_by_global_flag", useEmbeddedSearchBranch:false}`；否则 `bashAvailable` 为假 → `{reason:"bash_unavailable", useEmbeddedSearchBranch:false}`；否则 `{reason:"supported", useEmbeddedSearchBranch:true}`。
- 错误语义：不抛错。时序与并发：纯函数。幂等：是。资源释放：不适用。平台差异：不适用（bash 可用性由调用方给）。状态所有者：无。日志级别：不适用。
- 覆盖方式：本文件**不经公开入口导出**（`@knorvia/core` 根只转出 agent/context/compact/mcp），调用方是 `runtime/methods/subagent.ts`、`runtime/methods/embedded-search-branch.ts`、`tool/executor/invocation/context.ts`（属 `core-runtime-*`/工具层）→ 本包只冻结判定语义，行为由上述调用方的测试间接覆盖（`acceptance.md` 未覆盖项登记）。
- （测试：无直接断言；间接覆盖登记在 acceptance.md §未覆盖项）

## E2 内嵌搜索 shell 注入开关（`embedded-search/shell.ts`）

- 输入：`shouldInjectEmbeddedSearchBashPrelude()`；`supportsEmbeddedSearchShellSelection(selection)`。
- 输出：`ENABLE_EMBEDDED_SEARCH_BASH_PRELUDE = true`（恒真）；`supportsEmbeddedSearchShellSelection` 仅当 `selection?.dialect` 为 `"posix"` 或 `"git-bash"` 时为真，`undefined` 或其它 dialect 为假。
- 错误语义：不抛错。时序与并发：纯函数。幂等：是。资源释放：不适用。平台差异：dialect 判定覆盖 POSIX 与 Git Bash 两类；Windows 上的 `cmd`/`powershell` 一律为假（这正是"不因 shell 不支持 function 注入而改变模型看到的 tool surface"的边界）。状态所有者：无。日志级别：不适用。
- 覆盖方式：同 E1，不经公开入口导出 → 间接覆盖登记。
- （测试：无直接断言；间接覆盖登记在 acceptance.md §未覆盖项）

## C1 自动压缩阈值与计算（`compact/policy.ts`）

- 输入：常量；`getEffectiveContextWindowSize(config?)`、`getAutoCompactOutputReserveTokens(config?)`、`getAutoCompactThreshold(config?)`。
- 输出（**逐字冻结**）：`DEFAULT_COMPACT_CONTEXT_WINDOW = 200000`、`DEFAULT_AUTOCOMPACT_OUTPUT_RESERVE_TOKENS = 32000`、`MAX_OUTPUT_TOKENS_FOR_SUMMARY = 20000`、`AUTOCOMPACT_BUFFER_TOKENS = 13000`、`DEFAULT_AUTOCOMPACT_THRESHOLD_PERCENT = 100`、`MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES = 3`。输出预留 = `min(maxOutputTokens ?? 32000, 21000)`（**内部上限 21000**）→ 默认 21000；有效上下文窗口 = `max(0, contextWindow - min(预留, contextWindow))` → 默认 `200000 - 21000 = 179000`；阈值 = `max(0, 有效窗口 - bufferTokens)` → 默认 `179000 - 13000 = 166000`。负数/非有限/未给的配置项一律回落默认值（`normalizeNonnegativeInteger`，向下取整）。
- 错误语义：不抛错（非法值静默回落）。时序与并发：纯函数。幂等：是。资源释放：不适用。平台差异：不适用。状态所有者：无（配置由调用方给）。日志级别：不适用。
- （测试：tests/compact.test.mjs「C1 自动压缩阈值常量与计算（逐字冻结）」）

## C2 `shouldAutoCompact` 五分支与决策字段（`compact/policy.ts`）

- 输入：`{messages, config?, consecutiveFailures?, tokenOverride?}`。
- 输出：按**固定优先级**返回 `AutoCompactDecision`——① `config.enabled === false` → `reason:"disabled"`；② `!hasEnoughMessagesToCompact(messages)` → `"not_enough_messages"`；③ `consecutiveFailures >= (config.maxConsecutiveFailures ?? 3)` → `"circuit_breaker"`；④ `tokenCount < threshold` → `"below_threshold"`；⑤ 否则 → `"above_threshold"` 且 `shouldCompact:true`（**达到阈值即压缩**）。`tokenCount` = `tokenOverride.tokenCount ?? estimateMessageTokens(messages)`；`tokenSource` = `tokenOverride.source ?? "estimate"`；`thresholdPercent` 恒为 100；`modelContextBudgetStrategy` 取 `@knorvia/shared` 的默认策略；`providerBaseTokenCount`/`providerCacheReadTokens`/`providerCacheWriteTokens`/`providerContextUsageTokenCount`/`providerIncrementalTokenCount`/`providerOutputTokens` 原样透传（未给即 `undefined`）。
- 错误语义：不抛错。时序与并发：纯函数（同输入同输出）。幂等：是。资源释放：不适用。平台差异：不适用。状态所有者：无。日志级别：不适用。
- （测试：tests/compact.test.mjs「C2 shouldAutoCompact 五分支与决策字段」）

## C3 轮次分组语义（`compact/rounds.ts`，经 `hasEnoughMessagesToCompact` 间接覆盖）

- 输入：`groupByAssistantStartedRounds(items, roleOf, assistantIdOf?)`（**不经桶导出**）；公开可见的消费方是 `hasEnoughMessagesToCompact(messages)`。
- 输出：**助手起始新组**——遇到 `role==="assistant"` 且当前组非空且（未提供 id 或 id 与上一个助手不同）时，先把当前组收尾、再以该消息开新组；否则追加到当前组。首个助手之前的 user 自成一组。因此 `hasEnoughMessagesToCompact` 的判定是"分组数 ≥ 2 **且**存在 assistant"：`[]`/`[user]`/`[assistant]` → `false`；`[user, assistant]` → **`true`**（2 组）。
- 错误语义：不抛错。时序与并发：纯函数。幂等：是。资源释放：不适用。平台差异：不适用。状态所有者：无。日志级别：不适用。
- （测试：tests/compact.test.mjs「C3 轮次分组语义（经 hasEnoughMessagesToCompact 间接覆盖）」）

## C4 可摘要消息与 token 估算（`compact/manual.ts`）

- 输入：`getMessagesToSummarize(messages)`、`estimateMessageTokens(messages)`。
- 输出：`getMessagesToSummarize` 过滤掉 `role === "system"` 与"`trimStart()` 后以 `<system-reminder>` 开头的 user 消息"，其余消息返回**浅拷贝**（不共享引用）。`estimateMessageTokens` 按消息累加：文本长度（string 内容原样；块数组取 reasoning 文本 + `modelMessageContentBlockToText`，用 `\n\n` 连接、过滤空串）+ 每个 `toolCalls` 的 `name + JSON.stringify(input ?? {})`（序列化失败回落 `"{}"`），每条消息 `Math.ceil(chars / ESTIMATED_TOKEN_CHAR_DIVISOR)`（除数是 `@knorvia/shared` 的常量）。
- 错误语义：不抛错。时序与并发：纯函数。幂等：是。资源释放：不适用。平台差异：不适用。状态所有者：无。日志级别：不适用。
- （测试：tests/compact.test.mjs「C4 可摘要消息与 token 估算」）

## C5 压缩提示词与摘要格式化（`compact/prompt.ts`）

- 输入：`buildCompactPrompt(customInstructions)`、`formatCompactSummary(text)`。
- 输出：`buildCompactPrompt` = `NO_TOOLS_PREAMBLE + BASE_COMPACT_PROMPT + [自定义块] + NO_TOOLS_TRAILER`，自定义块仅在 `customInstructions?.trim()` 非空时插入，形态固定为 `"\n\nAdditional Instructions:\n" + customInstructions`（**原文，不 trim**）。`formatCompactSummary`：`undefined`/空白 → `""`；否则删除 `<analysis>…</analysis>`、把 `<summary>…</summary>` 改写为 `Summary:\n<trim 后的内容>`、把连续空行压成一个空行、整体 trim。
- 错误语义：不抛错。时序与并发：纯函数。幂等：是（对已格式化文本再跑结果不变）。资源释放：不适用。平台差异：不适用。状态所有者：无。日志级别：不适用。
- （测试：tests/compact.test.mjs「C5 压缩提示词与摘要格式化」）

## C6 microcompact 阈值与文案（`compact/microcompact.ts`）

- 输入：常量；`buildDefaultMicrocompactThreshold(autoCompactThreshold)`。
- 输出（**逐字冻结**）：`MICROCOMPACT_CLEARED_TOOL_RESULT_PREFIX = MICROCOMPACT_CLEARED_TOOL_RESULT_MESSAGE = "[Old tool result content cleared]"`；`DEFAULT_MICROCOMPACT_KEEP_RECENT_TOOL_RESULTS = 5`；`DEFAULT_MICROCOMPACT_MIN_TOKEN_SAVINGS = 256`；`DEFAULT_MICROCOMPACT_THRESHOLD_RATIO = 0.9`；`DEFAULT_MICROCOMPACT_THRESHOLD_BUFFER_TOKENS = 2000`；`DEFAULT_MICROCOMPACT_COMPACTABLE_TOOLS = ["Read","Bash","Grep","Glob","WebFetch","WebSearch","Edit","Write","ApplyPatch"]`；`MAX_COMPACT_PROMPT_TOO_LONG_RETRIES = 3`；`COMPACT_PROMPT_TOO_LONG_RETRY_MARKER = "[earlier conversation truncated for compaction retry]"`；`COMPACT_PROMPT_TOO_LONG_USER_MESSAGE = "Conversation too long to compact automatically. Try /compact again after narrowing the active context."`。`buildDefaultMicrocompactThreshold(t) = max(0, min(floor(t * 0.9), t - 2000))` → `t=166000 → 149400`、`t=20000 → 18000`、`t=1000 → 0`。
- 错误语义：不抛错。时序与并发：纯函数。幂等：是。资源释放：不适用。平台差异：不适用。状态所有者：无。日志级别：不适用。
- 未覆盖：`maybeLocalMicrocompactMessages`（清理哪些工具结果、保留最近 N 条、最小节省 token、空闲阈值、错误结果策略）是**内部可达**的复杂逻辑，按 `acceptance.md` 登记为"替换阶段内部单测 + 调用方（runtime 压缩路径）覆盖"。
- （测试：tests/compact.test.mjs「C6 microcompact 阈值与常量（逐字冻结）」）
