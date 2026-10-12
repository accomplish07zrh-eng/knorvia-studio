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

## X1 token 估算单位与前缀截断（`context/utils.ts`）

- 输入：`countTokenEstimateUnits(text)`、`tokenEstimatePrefixLength(text, maximumUnits)`、`estimateTokens(text)`。
- 输出（**权重逐字冻结**）：普通字符权重 1，CJK 区（U+4E00–U+9FFF）权重 2。`countTokenEstimateUnits("") = 0`、`("abc") = 3`、`("中文") = 4`、`("a中") = 3`；`tokenEstimatePrefixLength` 逐字累加权重，**一旦累计超过 `maximumUnits` 就返回当前下标**（不含越界字符），未越界返回全文长度：`("abcdef",3) = 3`、`("abcdef",0) = 0`、`("abc",99) = 3`、`("中中中",3) = 1`、`("",5) = 0`；`estimateTokens(text) = Math.ceil(units / ESTIMATED_TOKEN_CHAR_DIVISOR)`，实测除数为 **3**：`"" → 0`、`"a" → 1`、`"a"×4 → 2`、`"a"×8 → 3`、`"a"×100 → 34`、`"a"×1000 → 334`、`"中" → 1`。
- 错误语义：不抛错（空串返回 0）。时序与并发：纯函数。幂等：是。资源释放：不适用。平台差异：不适用（UTF-16 与 CJK 码点判定与平台无关）。状态所有者：无。日志级别：不适用。
- （测试：tests/context.test.mjs「X1 token 估算单位与前缀截断（逐字冻结权重）」）

## X2 CLI Prefix section（`context/sections/cli-prefix.ts`）

- 输入：无。
- 输出（**逐字冻结**）：`{name:"CLI Prefix", source:"cli_prefix", injectionTarget:"system", cacheHint:"stable", chars:51, tokens:17, content:"You are Knorvia Studio, an interactive coding agent", preview: content.slice(0,100)}`。
- 错误语义：不抛错。时序与并发：纯函数（常量内容）。幂等：是。资源释放：不适用。平台差异：不适用。状态所有者：无。日志级别：不适用。
- （测试：tests/context.test.mjs「X2 CLI Prefix section（逐字冻结）」）

## X3 Current Date section（`context/sections/current-date.ts`）

- 输入：`buildCurrentDateSection(currentDate: string | undefined)`。
- 输出（**逐字冻结**）：`undefined` 或空串 → `null`；否则 `{name:"Current Date", source:"current_date", injectionTarget:"meta_user", cacheHint:"dynamic", chars:41, tokens:14, content:"# currentDate\nToday's date is <currentDate>."}`（日期由调用方按本地日历日给出，本 section 不做时区换算）。
- 错误语义：不抛错（缺日期返回 `null` 让调用方跳过）。时序与并发：纯函数。幂等：是。资源释放：不适用。平台差异：不适用（日期字符串由调用方提供）。状态所有者：无。日志级别：不适用。
- （测试：tests/context.test.mjs「X3 Current Date section（逐字冻结）」）

## X4 Memory section（`context/sections/memory.ts`）

- 输入：`buildMemorySection(memoryRoot: string | undefined)`。
- 输出：`undefined`/空串 → `null`；否则 `{name:"Memory", source:"memory", injectionTarget:"system", cacheHint:"dynamic", chars, tokens, content, preview}`，其中 `content` 以 `# Memory\n\n` 开头，含 `persistent file-based memory at \`<memoryRoot>/\``、`do not run mkdir or check for its existence`、frontmatter 模板、四种记忆类型（`user`/`feedback`/`project`/`reference`）、`[[name]]` 关联写法、`\`MEMORY.md\`` 索引指引与 `- [Title](file.md) — hook` 行。`chars = content.length`、`tokens = estimateTokens(content)`。
- 错误语义：不抛错。时序与并发：纯函数。幂等：是。资源释放：不适用。平台差异：路径仅作文本插值（不做 `path.join`/分隔符改写），因此 Windows 与 POSIX 输出都按调用方给的字符串原样呈现。状态所有者：无。日志级别：不适用。
- （测试：tests/context.test.mjs「X4 Memory section（标题/路径插值/关键标记）」）

## X5 context 区公开面（`context/index.ts`）

- 输入：区域桶 `src/context/index.ts`。
- 输出（**集合逐字冻结**）：16 个运行时导出 —— `ContextBuilder`、`buildCliPrefixSection`、`buildContextMetaUserBody`、`buildCurrentDateSection`、`buildDesktopContextSection`、`buildEnvInfoSection`、`buildGitSystemContextSection`、`buildIdentitySection`、`buildMemorySection`、`buildSkillsMetaUserBody`、`buildSkillsSection`、`buildWorkflowActorIdentitySection`、`countTokenEstimateUnits`、`createContextBuilder`、`estimateTokens`、`tokenEstimatePrefixLength`（全部为函数形态）。
- 错误语义：入口缺失或形态不符即违约。时序与并发：模块求值一次。幂等：重复 import 返回同一命名空间。资源释放：不适用。平台差异：不适用。状态所有者：模块自身。日志级别：不适用。
- （测试：tests/context.test.mjs「X5 context 区公开面（区域桶）」）

> **context 子块 2（待补）**：`builder.ts`（`ContextBuilder`/`createContextBuilder`/`buildContextMetaUserBody`/`buildSkillsMetaUserBody` 的装配顺序与去重裁剪）、`sections/{identity,env-info,skills,desktop,workflow-actor,request-user-context}.ts` 的固定文案与顺序、`dynamic-sections.ts` 的四个动态 section、`types.ts` 的类型面。补齐前合同不得合并。

## X6 Agent Identity section（`context/sections/identity.ts`）

- 输入：`buildIdentitySection(outputStyle?: OutputStylePromptConfig)`。
- 输出（**逐字冻结**）：`{name:"Agent Identity", source:"identity", injectionTarget:"system", cacheHint:"stable"}`；无 output style 时 `chars = 1220`、`tokens = 407`，内容以 `"\nYou are an interactive Knorvia Studio agent that helps users with software engineering tasks.\n\n"` 开头；带 output style（`{name,prompt}`）时 `chars = 1246`、`tokens = 416`，首句换成 `"You respond to the user according to the active Output Style below while using Knorvia Studio's tools and instructions."`。两种形态都逐字包含同一条安全 IMPORTANT 行与 `# Harness` 五条要点（文本见测试常量）。
- 错误语义：不抛错。时序与并发：纯函数。幂等：是。资源释放：不适用。平台差异：不适用。状态所有者：无。日志级别：不适用。
- （测试：tests/context-sections.test.mjs「X6 Agent Identity section（逐字冻结 + output style 分支）」）

## X7 Desktop Context section（`context/sections/desktop.ts`）

- 输入：无。
- 输出（**逐字冻结**）：`{name:"Knorvia Studio Desktop Context", source:"desktop_context", injectionTarget:"system", cacheHint:"stable", chars:1109, tokens:370}`；内容以 `"# Knorvia Studio Desktop Context\n\n### Files & URLs\n"` 开头，含 `### Inline Code Comments`、`::code-comment{...}` 指令说明与示例行 `- Example: ::code-comment{title="[P2] Off-by-one" … start=10 end=11 priority=2}`。
- 错误语义：不抛错。时序与并发：纯函数（常量内容）。幂等：是。资源释放：不适用。平台差异：不适用（文案与平台无关）。状态所有者：无。日志级别：不适用。
- （测试：tests/context-sections.test.mjs「X7 Desktop Context section（逐字冻结）」）

## X8 Environment Info 与 git 上下文（`context/sections/env-info.ts`）

- 输入：`buildEnvInfoSection(envInfo, model?)`、`buildGitSystemContextSection(envInfo)`。
- 输出（**逐字冻结**）：最小 `envInfo`（`cwd:"/w"`、`platform:"linux"`、`isGitRepository:false`、`nodeVersion:"v24.0.0"`）下 `{name:"Environment Info", source:"env_info", injectionTarget:"system", cacheHint:"dynamic", chars:184, tokens:62}`；内容以 `"# Environment\nYou have been invoked in the following environment:\n"` 开头，逐行 `- Primary working directory: /w`、`- Is a git repository: no`、`- Platform: linux`、`- Shell: undefined`、`- OS Version: undefined`（**未给字段回落为字面 `undefined`**）。非 git 仓库时 `buildGitSystemContextSection` 返回 `null`（不产出 git 段）。
- 错误语义：不抛错。时序与并发：纯函数。幂等：是。资源释放：不适用。平台差异：`platform`/`cwd` 由调用方给，本 section 只做文本呈现（不做路径改写）。状态所有者：无。日志级别：不适用。
- （测试：tests/context-sections.test.mjs「X8 Environment Info 与 git 上下文（含 undefined 回落）」）

## X9 Workflow Actor Identity section（`context/sections/workflow-actor.ts`）

- 输入：`buildWorkflowActorIdentitySection(actor: WorkflowActorContext)`（`{name?, persona?}` 都可缺席）。
- 输出（**逐字冻结**）：`{name:"Workflow Actor Identity", source:"workflow_actor_identity", injectionTarget:"system", cacheHint:"stable", chars:2731, tokens:911}`；内容以 `"You are a subagent inside a dynamic workflow run."` 开头，含 `"There is no user in this conversation to talk to."`、**与 X6 逐字同一份**安全 IMPORTANT 行与 `# Harness` 五条要点、`# Working inside a workflow` 契约段，并含标记 `\`submit_result\``、`\`escalate\``、`path:line`、`not run`（"未执行就如实报未执行"）。
- 错误语义：不抛错（`{}` 也产出基座身份）。时序与并发：纯函数。幂等：是。资源释放：不适用。平台差异：不适用。状态所有者：无。日志级别：不适用。
- 说明：`buildSecurityNotice()` 与 `buildHarnessBlock()` **不经公开入口导出**（内部函数），其文本通过 X6/X9 的"逐字同一份"断言间接冻结。
- （测试：tests/context-sections.test.mjs「X9 Workflow Actor Identity section（共用安全行/Harness + 工作流契约）」）

> **context 子块 3（待补）**：`builder.ts`（`ContextBuilder` 装配顺序、`createContextBuilder` 默认列表、`buildContextMetaUserBody`/`buildSkillsMetaUserBody` 的去重裁剪）、`sections/skills.ts`（清单截断规则，探针显示其入参形状不是 `{skills}`，需读源码）、`sections/request-user-context.ts`（`# agentsMd` 段与 `[File truncated]` 规则，内部函数）、`dynamic-sections.ts` 四个动态 section、`types.ts` 类型面（B6 式编译期用例）。

## X10 Skills section（`context/sections/skills.ts`）

- 输入：`buildSkillsSection({outcome: SkillLoadOutcome, metadataBudget?})`。
- 输出（**逐字冻结**）：`outcome.skills` 为空 → `null`；否则 `{name:"Skills", source:"skills", injectionTarget:"meta_user", cacheHint:"dynamic"}`，内容为 `"The following skills are available for use with the Skill tool:\n\n"` + 条目行，条目按显示名（`qualifiedName ?? name`）`localeCompare` **升序**。详细条目：`- <显示名>: <description[- whenToUse]>[ (also loadable as <name>)][ (file: <path>)]` 形式，即 `- a: review things (file: /skills/a/SKILL.md)`；描述超过 **250** 字时截到 **249** 字后加 `...`；`qualifiedName` 与 `name` 不同时追加 ` (also loadable as <name>)`。整体长度超过 `metadataBudget`（默认 **20000**）时**回落为只列名字**：`- <显示名>[ (also loadable as <name>)][ (file: <path>)]`。
- 错误语义：不抛错（`outcome` 形状由调用方保证）。时序与并发：纯函数。幂等：是（排序稳定）。资源释放：不适用。平台差异：排序用 `localeCompare`，排序结果与运行环境 locale 有关（同一 locale 下稳定）。状态所有者：无。日志级别：不适用。
- （测试：tests/context-builder.test.mjs「X10 Skills section（排序、250 字截断、别名、budget 回落）」）

## X11 builder 装配顺序与 meta_user 组装（`context/builder.ts`）

- 输入：`createContextBuilder(config)`（返回 `ContextBuilder`：`setToolRegistry`/`setEnvInfo`/`addSection`/`build`）、`buildContextMetaUserBody(sections)`、`buildSkillsMetaUserBody(sections)`。
- 输出（**逐字冻结**）：最小配置（`workingDirectory` + 非 git `envInfo`）下 `build()` 的结果键为 `metaUserAttachments`/`sections`/`systemMessages`/`totalChars`/`totalTokens`；`sections` 的装配顺序固定为 **CLI Prefix → Agent Identity → Dynamic Behavior → Environment Info → Context Management**（`source` 依次 `cli_prefix`/`identity`/`dynamic_behavior`/`env_info`/`context_management`，`injectionTarget` 全部 `system`）；`totalChars`/`totalTokens` 等于各段之和。`buildContextMetaUserBody` = `"As you answer the user's questions, you can use the following context:\n" + 各段内容按顺序用 "\n\n" 连接 + "\n\n      IMPORTANT: this context may or may not be relevant to your tasks. You should not respond to this context unless it is highly relevant to your task."`（注意 IMPORTANT 前是 **6 个空格**）；**空数组 → `null`**；该函数**不按 `injectionTarget` 过滤**（传进来的段一律进正文，由调用方决定传哪些）。`buildSkillsMetaUserBody` = 各段内容按顺序用 `"\n\n"` 连接，无外层包裹与尾注。
- 错误语义：不抛错。时序与并发：`build()` 为同步纯计算（本包不发起 I/O）。幂等：同一配置两次 `build()` 结果一致。资源释放：不适用。平台差异：不适用（环境差异由 `envInfo` 传入）。状态所有者：builder 实例持有配置；section 由调用方注册。日志级别：不适用。
- （测试：tests/context-builder.test.mjs「X11 builder 装配顺序与 meta_user 组装（逐字冻结）」）

> **context 块剩余待补（子块 4，登记在 acceptance §10）**：`dynamic-sections.ts` 四个动态 section 的内部文案与触发条件（其**存在与顺序**已由 X11 冻结）、`sections/request-user-context.ts`（内部函数：`# agentsMd`、`Contents of …`、`[File truncated: …]`、memory 索引段）、`types.ts` 类型面（B6 式编译期用例）、`ContextBuilder.setToolRegistry`/`addSection`/`setEnvInfo` 的增量行为。

## X12 ContextBuilder 增量方法与 meta_user attachment（`context/builder.ts`）

- 输入：`builder.addSection(section)`、`builder.setEnvInfo(envInfo)`、`build()` 的 `metaUserAttachments`。
- 输出（**逐字冻结**）：`addSection` **只追加、不去重**（同一段加两次就出现两次，且排在默认段之后）；非 git 仓库的最小配置下 `sections` 无 git 段，`setEnvInfo({isGitRepository:true,…})` 后**多出 `system_context` 段**且环境段内容按新值替换（`- Primary working directory: /other`、`- Is a git repository: yes`、`- Platform: darwin`）；`metaUserAttachments` 是**单个** attachment，`source === "context_prefix"`，`content` 为 `buildContextMetaUserBody` 的正文（以 `As you answer the user's questions, …` 开头，含 `# currentDate\nToday's date is <date>.` 与 6 空格 IMPORTANT 尾注）。
- 错误语义：不抛错。时序与并发：同步纯计算；`addSection`/`setEnvInfo` 立即生效（下一次 `build()` 可见）。幂等：同一状态重复 `build()` 结果一致；`addSection` **不幂等**（每次调用都追加，这是契约行为）。资源释放：不适用。平台差异：不适用。状态所有者：builder 实例。日志级别：不适用。
- （测试：tests/context-incremental.test.mjs「X12 ContextBuilder：addSection 追加不去重、setEnvInfo 替换环境段」「X12 meta_user attachment：来源标记与正文包裹」）

## X13 context 类型面（`context/types.ts`，编译期用例）

- 输入：`ContextBuilderConfig`、`ContextSection`、`ContextSource`、`ContextInjectionTarget`、`ContextCacheHint`、`PresentationSurface`、`OutputStylePromptConfig`、`WorkflowActorContext`、`ContextMetaUserAttachment`、`ContextBuildResult`。
- 输出：按契约使用这些类型**必须编译通过**；反向用法**必须编译报错**（`ContextInjectionTarget` 只有 `system`/`meta_user`；`ContextCacheHint` 只有 `stable`/`dynamic`；`PresentationSurface` 只有 `terminal`/`knorvia_desktop`；`ContextSection` 必须给全 `name`/`source`/`injectionTarget`/`cacheHint`/`chars`/`tokens`/`content`/`preview`；`OutputStylePromptConfig` 必须有 `prompt`；`ContextBuilderConfig` 必须有 `workingDirectory` 与 `envInfo`；`ContextBuildResult` 必须有 `metaUserAttachments`）。`EnvInfo` 必填 `cwd`/`platform`/`shell`/`osVersion`/`nodeVersion`（`isGitRepository` 等可选）。
- 错误语义：类型不匹配由编译期报错。时序与并发：编译期检查。幂等：是。资源释放：用例文件跑完即删。平台差异：不适用。状态所有者：类型由模块声明拥有。日志级别：不适用。
- （测试：tests/context-types.test.mjs「X13 context 类型面：正向用例通过编译、反向用例必须报错」）

> **context 块剩余（子块 5，登记在 acceptance §11）**：`dynamic-sections.ts` 四个动态 section 的内部文案与触发条件、`sections/request-user-context.ts`（内部函数）、`ContextBuilder.setToolRegistry` 的注册行为。三者都不经公开入口，属"替换阶段内部单测 + 调用方覆盖"。

## A1 回合阶段状态机（`agent/turn-state.ts`）

- 输入：`TurnPhase`、`createTurnState(id, sessionId, turnNumber, traceId, input, attachments?)`、`isTerminalPhase(phase)`、`isWaitingPhase(phase)`、`canTransitionTo(current, next)`。
- 输出（**逐字冻结**）：`TurnPhase` 十个取值 `idle`/`processing_input`/`awaiting_model_response`/`streaming`/`scheduling_tools`/`executing_tools`/`aggregating_results`/`awaiting_permission`/`completing`/`error`；`createTurnState` 产出 `phase:"idle"`、`streamingContent:""`、`acceptsPendingInput:true`、`resultType:"success"`、`startedAt` 为 `Date`、`attachments` 原样透传（未给即 `undefined`）、`completedAt` 未设，以及空数组的 `toolCalls`/`toolResults`/`pendingInputs`/`pendingPermissions`/`resolvedPermissions` 与空 `scheduledTools{items,parallelGroups,executionOrder}`。`isTerminalPhase` 仅 `completing`/`error` 为真；`isWaitingPhase` 仅 `awaiting_model_response`/`awaiting_permission`/`executing_tools` 为真。**转移矩阵**（100 个组合全部断言）：`idle→[processing_input]`；`processing_input→[awaiting_model_response, completing]`；`awaiting_model_response→[streaming, completing, error]`；`streaming→[scheduling_tools, aggregating_results, completing, error]`；`scheduling_tools→[executing_tools, awaiting_permission, error]`；`executing_tools→[aggregating_results, awaiting_permission, error]`；`aggregating_results→[awaiting_model_response, scheduling_tools, completing, error]`；`awaiting_permission→[executing_tools, error]`；`completing→[idle]`；`error→[idle]`。未列出的组合一律 `false`（含原地自转与跨阶段跳转）。
- 错误语义：不抛错；非法转移以 `false` 表达（由调用方决定是否抛）。时序与并发：纯函数与纯数据构造，无内部时序；阶段推进由调用方驱动。幂等：`createTurnState` 每次返回**新对象**（`startedAt` 为新时间）；谓词与转移判定幂等。资源释放：不适用。平台差异：不适用。状态所有者：调用方持有 `TurnState`（本模块只造初始态与判定）。日志级别：不适用。
- （测试：tests/agent-turn-state.test.mjs「A1 回合阶段状态机：取值表、初始状态与转移矩阵」）

## A2 历史工具部件选择（`agent/tool-part-order.ts`，内部可达）

- 输入：`selectToolPartsForHistory(parts: ToolPart[])`（**不经区域桶导出**）。
- 输出（**语义冻结**，探针实测）：同一 `callID` 出现多次时**只保留最后一个**（`Map` 覆盖）；保留所选记录的**物理顺序**；若所选记录**全部**带 `declarationIndex`，按 `declarationIndex` 升序排序；若**任一**记录缺 `declarationIndex`（旧记录/混合版本），整组保持原序不排序。实测：`[a#2,b#1] → [b#1,a#2]`；`[a#0,b#1,a#2] → [b#1,a#2]`（旧 a 被覆盖）；`[a#1,b#undefined] → [a#1,b#undefined]`（缺序号即不排序）。
- 错误语义：不抛错。时序与并发：纯函数（注意 `sort` 作用在 `filter` 结果上，不改动入参数组）。幂等：是（同输入同输出）。资源释放：不适用。平台差异：不适用。状态所有者：无。日志级别：不适用。
- 覆盖方式：内部可达 → 替换阶段内部单测按上述三条实测语义冻结。

## A3 运行时输入呈现标记（`agent/runtime-input-presentation.ts`，内部可达）

- 输入：`runtimeInputMetadata(value)`（**不经区域桶导出**）。
- 输出（**语义冻结**）：先经 `parseRuntimeInputPresentation`（取值表 7 个：`user_steer`/`coordinator_steer`/`coordinator_input`/`subagent_reply_steer`/`subagent_reply`/`task_notification_steer`/`task_notification`）；解析失败（含 `undefined`、数字、表外字符串）→ `undefined`；`user_steer` → `{source:"real_user", inputPresentation:"user_steer"}`；其余 6 个取值 → `{source:"legacy_synthetic", inputPresentation:<取值>}`。实测：`"user_steer"` → real_user；`"coordinator"`/`"queued_input"`/`"invalid_value"`/`undefined`/`42` → `undefined`。
- 错误语义：不抛错（宽松解析）。时序与并发：纯函数。幂等：是。资源释放：不适用。平台差异：不适用。状态所有者：无。日志级别：不适用。
- 覆盖方式：内部可达 → 替换阶段内部单测按上述实测语义冻结。

> **agent 组剩余（待补）**：`turn-machine.ts`（`TurnMachineImpl` 的阶段推进与事件序列）、`message-history.ts`（`MessageHistoryImpl`/`createMessageHistory` 与克隆/计数/失效辅助函数）、`session-history-hydrator.ts`（`activeSessionMessages`/`hydrateMessageHistoryFromSession`）、`compact-session.ts`（`compactActiveSessionMessages` 与两个谓词）、`file-part-hydration.ts`（`projectPersistedToolMediaContent`）、`read-file-state-hydrator.ts`、`message-history-usage.ts`（`persistedTokenUsageBaseline`）、`turn-tool-projection.ts`（**已登记 `independent-replacement`，不在范围**）。

## A4 回合推进的正常事件序列（`agent/turn-machine.ts`）

- 输入：`TurnMachineImpl.create(sessionId, turnNumber, input, traceId?, turnId?)`、`start()`、`startModelRequest(model, messages)`、`receiveModelResponse(content)`、`addStreamingContent(content)`、`complete(response, resultType?)`、`getNextPhase()`、`isComplete()`。
- 输出（**事件序列逐字冻结**）：`create` → `phase:"idle"`、`isComplete()===false`；`start()` → `processing_input`；`startModelRequest("gpt", msgs)` → `awaiting_model_response` 且 `modelRequest === {model, messages}`；`receiveModelResponse("hello")` → `streaming` 且 `streamingContent === "hello"`；`getNextPhase()` 在 `awaiting_model_response` 上返回自身；`streaming` 且无工具调用但有内容 → `completing`；`complete("final answer")` → `phase:"completing"`、`finalResponse`、`resultType:"success"`、`completedAt` 为 `Date`；终态 `isComplete()===true`、`getNextPhase()` 保持 `completing`、再 `start()` 抛 `Cannot transition from completing to processing_input`。
- **所有方法返回新状态、不修改接收者**（`machine.start()` 后 `machine.state.phase` 仍为 `idle`）；调用方用返回值继续推进（`new TurnMachineImpl(state)`）。
- 错误语义：非法阶段转移抛 `CoreErrorType.InvalidTurnPhase`（`recoverable: true`）。时序与并发：纯同步状态推进，无 I/O、无计时器（**测试不含 sleep/超时**）。幂等：同一状态上重复调用同一方法结果一致（除 `new Date()` 字段）。资源释放：不适用。平台差异：不适用。状态所有者：调用方持有状态；machine 实例只是状态的载体。日志级别：不适用。
- 实测 quirk（见 `known-differences.md` §6）：阶段机**没有 streaming 自环**——`addStreamingContent`/`receiveModelResponse` 第二次调用会抛 `Cannot transition from streaming to streaming`；多次到达的流式内容由调用方在状态外累积。
- （测试：tests/agent-turn-machine.test.mjs「A4 turn-machine：正常回合的阶段推进序列（方法返回新状态）」）

## A5 非法转移与失败收尾（`agent/turn-machine.ts`）

- 输入：`startModelRequest`（在 `idle` 上）、`start()`（重复调用）、`aggregateResults()`（从 `processing_input`）、`fail(error)`。
- 输出（**错误形态逐字冻结**）：`idle` 上 `startModelRequest` 抛消息 `Must be in ProcessingInput or AggregatingResults phase`、`recoverable === true`；重复 `start()` 抛 `Cannot transition from processing_input to processing_input`；`processing_input` 上 `aggregateResults()` 抛 `Cannot transition from processing_input to aggregating_results`。`fail({type,message,recoverable})` → `phase:"error"`、`error` 原样、`completedAt` 为 `Date`、`isComplete()===true`、`getNextPhase()` 保持 `error`（`fail` 用 `project()` 直改阶段，不受转移表限制）。
- 错误语义：如上（`CoreErrorType.InvalidTurnPhase`）。时序与并发：同步。幂等：是。资源释放：不适用。平台差异：不适用。状态所有者：调用方。日志级别：不适用。
- （测试：tests/agent-turn-machine.test.mjs「A5 turn-machine：非法转移与失败收尾的错误形态」）

## A6 工具调度、权限等待/裁决、工具结算与待处理输入（`agent/turn-machine.ts`）

- 输入：`scheduleTools(toolCalls, schedule)`、`startToolExecution()`、`requestPermission(request)`、`resolvePermission(id, decision, modifiedInput?)`、`completeTool(id, {success, content})`、`aggregateResults()`、`queuePendingInput(input)`、`drainPendingInputs()`。
- 输出（**事件序列逐字冻结**）：`scheduleTools` → `scheduling_tools`，`toolCalls` 全部 `scheduled`（`scheduledAt` 为 `Date`），`scheduledTools` 原样保存；`startToolExecution`（无等待调用）→ `executing_tools`，调用全部 `running`；`requestPermission` → `awaiting_permission`，目标调用 `waiting_permission`，`pendingPermissions` +1，其它调用不受影响；`resolvePermission(allow, modifiedInput)` → 阶段不变、`pendingPermissions` 清空、`resolvedPermissions` 追加 `{toolCallId, decision, modifiedInput, resolvedAt}`、**调用状态保持 `waiting_permission`**（只改 `input`）；`resolvePermission(deny)` → 调用变 `permission_denied`；`completeTool(success:true)` → `toolResults` 追加 `{success:true, content}` 且 `error` 为 `undefined`、调用变 `completed`；`completeTool(success:false)` → `error === {type:"tool_error", message:<内容纯文本>, recoverable:true}`；`getNextPhase()`：`executing_tools` 有未结算调用 → 自身；全部结算 → `aggregating_results`；`aggregating_results` 无失败调用 → `awaiting_model_response`（可再次 `startModelRequest`），有失败调用 → `completing`；`queuePendingInput` 追加到新数组（不改接收者）；`drainPendingInputs()` 返回**原数组引用**并把新状态的 `pendingInputs` 置空。
- 错误语义：阶段非法时抛 `InvalidTurnPhase`；`completeTool` 对未知 id 不改任何调用（`editMatching` 只改匹配项）。时序与并发：同步纯状态推进，工具"并发"只体现为同一状态下多个调用同时 `running` 与 `parallelGroups`/`executionOrder` 数据（**测试无 sleep/超时**）。幂等：`completeTool` 每次追加一条 `toolResults`（不幂等，属契约行为）；`drainPendingInputs` 第二次调用返回空数组。资源释放：不适用。平台差异：不适用。状态所有者：调用方。日志级别：不适用。
- 实测 quirk（见 `known-differences.md` §6）：`startToolExecution` 会把**所有非等待调用重标为 `running`**（含已 completed/failed/denied 的），因此它必须在完成工具之前调用；`completeTool`/`resolvePermission` 只 `project()`、不改阶段。
- （测试：tests/agent-turn-machine.test.mjs「A6 turn-machine：工具调度、权限等待/裁决、工具结算与待处理输入」）

> **agent 组剩余**：`message-history.ts`、`session-history-hydrator.ts`、`compact-session.ts`、`file-part-hydration.ts`、`read-file-state-hydrator.ts`、`message-history-usage.ts`，以及 `agent/index.ts` 桶导出集合断言（`turn-tool-projection.ts` 已登记 `independent-replacement`，不在范围）。

## A8 会话压缩裁剪与保留段插回（`agent/compact-session.ts`，文件级入口）

- 输入：`isActiveCompactionBoundaryPart(part)`、`isCompactPreservableSessionMessage(message)`、`compactActiveSessionMessages(messages, boundaryIndex, includePreservedSegment)`。
- 输出（**语义冻结**）：① `isActiveCompactionBoundaryPart`：`type !== "compaction"` → `false`；`type === "compaction"` 且带 `compactBoundary` → `true`；无 `compactBoundary` 但带 `timelineStatus` → `false`；无 `compactBoundary` 且无 `timelineStatus` → `true`。② `isCompactPreservableSessionMessage`：`info.semantics?.providerVisibility === "hidden"` → `false`；任一部分 `type === "compaction"` → `false`；`role === "assistant"` 且 `info.error` 存在 → `false`；其余仅 `user`/`assistant` → `true`（`system` 等角色 → `false`）。③ `compactActiveSessionMessages`：基线是 `messages.slice(boundaryIndex)`；`includePreservedSegment === false` → 直接返回该切片（**同一批消息引用**）；为 `true` 时从边界消息的 compaction 部分取 `compactBoundary.preservedSegment`，在**边界之前**按 `headMessageId`/`tailMessageId` 定位（`tailIndex < boundaryIndex` 才有效），过滤出可保留消息后插回：锚点消息（`anchorMessageId`）在活动切片内 → 插到锚点之后；锚点不在 → 插到下标 **1**；无 `preservedSegment` 或 head/tail 定位失败 → 不插回。保留的 assistant 消息在插回时会做**token 用量失效**（`invalidateRuntimeTokenUsage`），user 消息原样引用。
- 错误语义：不抛错；定位失败以"不插回"表达。时序与并发：纯函数（不改入参数组）。幂等：是。资源释放：不适用。平台差异：不适用。状态所有者：调用方持有消息数组。日志级别：不适用。
- 覆盖方式：本区三个导出**不经区域桶**（区域桶 10 个导出里没有它们）→ 契约测试用**文件级入口** `src/agent/compact-session.ts` 做黑盒断言；替换阶段再用内部单测复核。
- （测试：tests/agent-compact-session.test.mjs「A8 compact-session：压缩边界的判定与保留条件」「A8 compact-session：活动消息裁剪与保留段插回」）

## A9 agent 区公开面（`agent/index.ts`）

- 输入：区域桶 `src/agent/index.ts`。
- 输出（**集合逐字冻结**）：运行时导出恰好 10 个 —— `MessageHistoryImpl`、`TurnMachineImpl`、`TurnPhase`、`activeSessionMessages`、`canTransitionTo`、`createMessageHistory`、`createTurnState`、`hydrateMessageHistoryFromSession`、`isTerminalPhase`、`isWaitingPhase`；除 `TurnPhase` 为对象外其余均为函数。内部可达的 `selectToolPartsForHistory`、`runtimeInputMetadata`、`compactActiveSessionMessages` **不得**出现在桶里。
- 错误语义：入口缺失、导出增减或形态不符即违约。时序与并发：模块求值一次。幂等：重复 import 返回同一命名空间。资源释放：不适用。平台差异：不适用。状态所有者：模块自身。日志级别：不适用。
- （测试：tests/agent-surface.test.mjs「A9 agent 区公开面（区域桶的 10 个运行时导出）」）

## A10 persistedTokenUsageBaseline（`agent/message-history-usage.ts`，文件级入口）

- 输入：`persistedTokenUsageBaseline(tokens: TokenUsageInfo | undefined)`。
- 输出（**逐字冻结**）：`undefined` → `undefined`。输入推导优先级：`input`（正数取整）→ 否则 `total - output`（`total` 正数时）→ 否则 `cache.read + cache.write`（和 > 0 时）；推导结果 `undefined` 或 ≤ 0 → 整体 `undefined`。`outputTokens = 正数 output ?? 0`；`cacheReadTokens`/`cacheWriteTokens` = 非负整数 ?? 0。`contextUsageTokens`：`output > 0` → `input + output`；否则 `total` 正数且 `total ≥ input` → `total`；否则 `undefined`（键始终存在）。所有数值**向下取整**；负数视为未给。
- 错误语义：**`tokens.cache` 必须存在**——实现无条件读 `tokens.cache.read`/`.write`，缺 `cache` 会抛 `TypeError: Cannot read properties of undefined (reading 'read')`（类型层必填，运行时无兜底）。时序与并发：纯函数。幂等：是。资源释放：不适用。平台差异：不适用。状态所有者：无。日志级别：不适用。
- （测试：tests/agent-usage-baseline.test.mjs「A10 persistedTokenUsageBaseline：输入推导与上下文用量的冻结规则」）
