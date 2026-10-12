# contracts-03 行为规格（behavior.md）

每条编号 `B1`、`B2`…，发布后编号不重用。每条写：输入、输出、错误语义、时序与并发、幂等、资源释放、平台差异、状态所有者、日志级别；不适用的项写「不适用」。每条至少被 `tests/` 里一个断言覆盖（末尾标注）。

本包是 `@knorvia/contracts` 的 `skills`（1 继承文件）、`telemetry`（2）、`time`（1）与包根 `index.ts`（1），共 5 个继承文件。其中 `skills/index.ts` 与 `telemetry` 的类型占绝大多数，只有 telemetry 两份与 `time/local-date.ts` 有运行时代码；因此除运行时行为条目外，另设 B6 用**编译期用例**冻结类型面。

## B1 公开入口导出面

- 输入：公开子路径 `.`（包根）、`./skills`、`./telemetry`；包根 `index.ts` 的 54 个相对再导出路径与 5 个 `@knorvia/shared` 名字。
- 输出：每个子路径都能载入；`interface.md` 列出的 8 个运行时导出（`TELEMETRY_SCHEMA_VERSION`、`AgentTelemetryOperation`、`ModelApiOperation`、`ModelApiActorKind`、`ModelFailureExceptionKind`、`mapModelApiOperationToAgentOperation`、`resolveModelApiCallObservation`、`formatLocalIsoDate`）都能从对应入口取到，且**运行时形态与 interface.md 的种类一致**（number / object / function）；包根 54 个相对模块路径全部可载入，其中暴露运行时导出的模块 ≥30 个、空命名空间（纯类型模块）≤20 个。
- 错误语义：入口缺失、运行时名字缺失、形态不符，或再导出路径载入失败即违约。
- 时序与并发：模块求值一次；`./telemetry` 与包根指向同一模块实例（`TELEMETRY_SCHEMA_VERSION` 与 `ModelApiOperation` 同一引用），不产生第二份实现。
- 幂等：重复 import 返回同一命名空间。资源释放：不适用。平台差异：不适用。状态所有者：模块自身。日志级别：不适用。
- 说明：`./skills` 子路径当前没有包外调用方（见 `callers.md`），保留它是为了不改动既有公开入口；其类型由包根与 `./skills` 同时可见。
- （测试：api-surface.test.mjs「每个公开子路径都能载入并导出 interface.md 列出的运行时名字」「包根再导出的每个模块路径都能载入」）

## B2 模型 API operation / actor / failure 取值表与恒等映射（`telemetry/index.ts`）

- 输入：`ModelApiOperation`、`ModelApiActorKind`、`ModelFailureExceptionKind` 常量表；`mapModelApiOperationToAgentOperation(operation)`。
- 输出：`ModelApiOperation` 13 个键值（`AgentStep:"agent_step"`、`ContextCompaction:"context_compaction"`、`GoalTitle:"goal_title_generation"`、`GoalVerification:"goal_completion_verification"`、`GitCommitMessage:"workspace_git_commit_message"`、`ProjectMemoryExtract:"project_memory_extract"`、`ReadSessionContextExtract:"read_session_context_extract"`、`ReadSessionContextSynthesize:"read_session_context_synthesize"`、`SessionTitle:"session_title_generation"`、`ToolInternalModelCall:"tool_internal_model_call"`、`WebFetch:"web_fetch_processing"`、`WebSearch:"web_search"`、`WorkspaceGenerateText:"workspace_generate_text"`）；`ModelApiActorKind` = `MainAgent:"main"`、`Subagent:"subagent"`、`WorkflowChild:"workflow_child"`、`System:"system"`、`Tool:"tool"`；`ModelFailureExceptionKind` 7 个取值（api_call / generic / protocol / provider_business / transport / type_error / validation）。映射函数是**恒等**：13 个取值逐个传入都原样返回。
- 错误语义：映射函数对任何 `ModelApiOperation` 取值都不抛错；传表外字符串在类型层被拒（见 B6）。
- 时序与并发：纯函数/常量表，无状态。幂等：是。资源释放：不适用。平台差异：不适用。状态所有者：无。日志级别：不适用。
- （测试：behavior.test.mjs「B2 模型 API operation / actor / failure 取值表与恒等映射」）

## B3 `resolveModelApiCallObservation` 归一语义（`telemetry/index.ts`）

- 输入：`querySource: string | undefined` 与可选 `observation`。
- 输出：先按 `querySource`（**去首尾空白后**匹配）取默认 `(operation, actorKind)`，再用 `observation` 覆盖；`observation.operation`/`actorKind` 未给时用默认值；其余 `observation` 字段原样保留。`logicalCallId` = 给出的值去首尾空白后的结果，**空白串视为未给**，此时生成 UUID v4。映射表（`fixtures/query-source-mapping.json` 冻结）：`main_turn`→(agent_step, main)、`subagent`→(agent_step, subagent)、`workflow_child`→(agent_step, workflow_child)、`compact`→(context_compaction, system)、`session_title`→(session_title_generation, system)、`goal_summary_title`→(goal_title_generation, system)、`target_completion_verification`→(goal_completion_verification, system)、`git_commit_message`→(workspace_git_commit_message, system)、`web_search_tool`→(web_search, tool)、`web_fetch_processing`→(web_fetch_processing, tool)、`read_session_context`→(read_session_context_extract, tool)、`project_memory_extract`→(project_memory_extract, system)；其余（`undefined`、空串、只有空白、大小写不符、表外的 `tool_internal_model_call` 等）→(tool_internal_model_call, system)。
- 错误语义：不抛错（除 `crypto.randomUUID` 自身不可用外无失败路径）；`querySource` 大小写敏感。
- 时序与并发：纯函数；每次调用返回**新对象**，两次调用的 `logicalCallId` 不相等（未给出时）。幂等：给出 `logicalCallId` 时结果字段完全一致；未给出时该字段每次新生成（契约不承诺可重复）。
- 资源释放：不适用。平台差异：`crypto.randomUUID()` 为 Node 全局能力，跨平台一致。状态所有者：无（调用方持有 observation）。日志级别：不适用。
- 映射结果必须都是 `AgentTelemetryOperation` 的取值（B4 的表）。
- （测试：behavior.test.mjs「B3 querySource 映射表、observation 覆盖与 logicalCallId 兜底」）

## B4 telemetry schema 版本与 agent operation 取值表（`telemetry/agent-execution.ts`）

- 输入：`TELEMETRY_SCHEMA_VERSION`、`AgentTelemetryOperation`。
- 输出：`TELEMETRY_SCHEMA_VERSION === 6`（字面量）；`AgentTelemetryOperation` 13 个键值：`AgentStep:"agent_step"`、`ContextCompaction:"context_compaction"`、`GoalCompletionVerification:"goal_completion_verification"`、`GoalTitleGeneration:"goal_title_generation"`、`ProjectMemoryExtract:"project_memory_extract"`、`ReadSessionContextExtract:"read_session_context_extract"`、`ReadSessionContextSynthesize:"read_session_context_synthesize"`、`SessionTitleGeneration:"session_title_generation"`、`ToolInternalModelCall:"tool_internal_model_call"`、`WebFetchProcessing:"web_fetch_processing"`、`WebSearch:"web_search"`、`WorkspaceGitCommitMessage:"workspace_git_commit_message"`、`WorkspaceGenerateText:"workspace_generate_text"`；与 `ModelApiOperation`（B2）按语义一一对应且取值相同。
- 错误语义：不适用（常量）。时序与并发：不适用。幂等：常量。资源释放：不适用。平台差异：不适用。状态所有者：模块常量。日志级别：不适用。
- （测试：behavior.test.mjs「B4 telemetry schema 版本与 agent operation 取值表」）

## B5 本地 ISO 日期格式（`time/local-date.ts`）

- 输入：`formatLocalIsoDate(date: Date)`。
- 输出：`YYYY-MM-DD`——年取本地 `getFullYear()` 原样（不补零、不截断），月与日取本地字段并各补零到 2 位；例：`new Date(2026,0,5)`→`"2026-01-05"`、`new Date(2026,8,9)`→`"2026-09-09"`、`new Date(2028,1,29)`→`"2028-02-29"`、`new Date(999,0,1)`→`"999-01-01"`、`new Date(10000,0,1)`→`"10000-01-01"`。
- 错误语义：不抛错；非 `Date` 入参在类型层被拒（见 B6）。
- 时序与并发：纯函数。幂等：是，且不修改入参。资源释放：不适用。
- 平台差异：使用**本地时区**字段而非 UTC，因此同一时刻在 UTC 与 UTC+8 可能得到不同日期——这是契约行为（调用方需要"本地日历日"）；实现不得改用 `toISOString()`。状态所有者：无。日志级别：不适用。
- （测试：behavior.test.mjs「B5 本地 ISO 日期：补零、本地时区语义、年不补零」）

## B6 类型面（`skills/index.ts` 与 telemetry 的类型导出）

- 输入：`interface.md` 列出的类型导出——`skills` 的 16 个（`SkillScope`/`SkillSource`/`SkillDiagnosticSeverity`/`SkillDiagnosticCode`/`SkillRoot`/`SkillPolicy`/`SkillMetadata`/`SkillTelemetryMetadata`/`SkillDiagnostic`/`SkillLoadOutcome`/`SkillContent`/`SkillDiscoverRequest`/`SkillLoadRequest`/`SkillOperationOptions`/`SkillPort`/`SkillConfig`），telemetry 的取值表类型与端口类型（`AgentTelemetryOperation`、`AgentTelemetryExecutionContext`、`AgentTelemetryCausation`、`AgentExecutionTelemetryPort`、`ModelApiCallObservation`、`ModelExecutionTelemetryPort` 等），以及包根的类型再导出。
- 输出：按契约使用这些类型**必须编译通过**（字段名、可选性、联合取值、函数签名）；不按契约使用**必须编译报错**。
- 错误语义：类型不匹配由 TypeScript 编译期报错，无运行时代码路径。
- 时序与并发：编译期检查，不涉及运行时时序。幂等：是（同一用例重复编译结果一致）。资源释放：测试用临时用例文件跑完即删。平台差异：不适用。状态所有者：类型由模块声明拥有。日志级别：不适用。
- 说明：反向用例用 `@ts-expect-error` 固定"必须报错"——如果实现把类型放宽，这些指令会变成未使用而编译失败。入口模式跟随契约测试（source 时编译 `src/*.ts`，dist 时编译 `dist/*.d.ts`）。
- （测试：types.test.mjs「B6 类型面：正向用例通过编译、反向用例必须报错」）

## B7 包根对 `@knorvia/shared` 的取值转发（`index.ts`）

- 输入：包根入口的 4 个媒体预算常量与 1 个类型再导出（`MEDIA_BUDGET_CURRENT_IMAGE_TOO_LARGE_ERROR_CODE`、`MEDIA_BUDGET_CURRENT_VIDEO_TOO_LARGE_ERROR_CODE`、`MEDIA_BUDGET_CURRENT_ATTACHMENT_TOO_LARGE_ERROR_CODE`、`VIDEO_INPUT_MAX_BYTES`、类型 `LocalTtftDetail`）。
- 输出：三个错误码等于 `@knorvia/shared` 的当前串值（`MEDIA_BUDGET_CURRENT_IMAGE_TOO_LARGE` / `MEDIA_BUDGET_CURRENT_VIDEO_TOO_LARGE` / `MEDIA_BUDGET_CURRENT_ATTACHMENT_TOO_LARGE`），`VIDEO_INPUT_MAX_BYTES === 30 * 1024 * 1024`；这些值必须是**真实取值**而非占位对象。
- 错误语义：不适用（常量转发）。时序与并发：模块求值一次。幂等：常量。资源释放：不适用。平台差异：不适用。状态所有者：`@knorvia/shared`（本包只转发，取值变化要两个包一起改）。日志级别：不适用。
- 说明：值的真相在 `packages/shared/src/media-policy.ts`；本包不得复制一份常量，也不能改成 nullable 或空壳。
- （测试：behavior.test.mjs「B7 包根对 @knorvia/shared 的取值转发」、api-surface.test.mjs「包根对本包自有导出与 @knorvia/shared 转发都是真实取值」）
