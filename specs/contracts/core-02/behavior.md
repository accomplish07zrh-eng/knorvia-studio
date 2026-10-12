# core-02 行为规格（B1–B12）

范围见 `README.md`。每条给出：输入 / 输出 / 错误语义 / 时序与并发 / 幂等 / 资源释放 / 平台差异 / 状态所有者 / 日志级别，末尾是该条目的可测断言。

## B1 模块导出面

- 输入：无（构建期）。
- 输出：`interface.md` 列出的 58 个模块路径与 287 个导出名，运行时名字可从对应模块取到。
- 错误语义：模块载入失败或名字缺失即断言失败。
- 时序与并发：无。
- 幂等：无副作用。
- 资源释放：只读导入。
- 平台差异：无（路径由 `entry.mjs` 跨平台解析）。
- 状态所有者：无。
- 日志级别：无。
- **断言**：`tests/api-surface.test.mjs` 四个用例。

## B2 记忆项目根（`memory/project-root.ts`）

- 输入：`{ cliStorageRoot, workspacePath, workspaceIdentity? }`。
- 输出：`<cliStorageRoot>/memories/projects/<slug>-<sha256 前 16 位>/memory`；给了 `workspaceIdentity` 时 slug 固定为 `project`，否则取工作目录 basename 的小写 slug（`a-z0-9._-`，最长 48）。
- 错误语义：纯函数，不抛；空 `workspacePath` 由 `path.resolve` 归一。
- 时序与并发：无状态，可并发调用。
- 幂等：同输入恒同输出。
- 资源释放：无 IO。
- 平台差异：Windows 上路径键先小写再哈希（大小写不敏感），其它平台原样。
- 状态所有者：无（调用方持有 `cliStorageRoot`）。
- 日志级别：无。
- **断言**：确定性、路径形状、不同工作区分叉、身份与路径是不同键。

## B3 记忆索引内容（`memory/index-content.ts`）

- 输入：索引正文（`formatProjectMemoryIndexContent` 还接受带 YAML front matter 与 HTML 注释的正文）。
- 输出：裁剪后的正文；超限（>200 行或 >25,000 字符）时附一行 `WARNING: MEMORY.md is …`。
- 错误语义：空输入返回空串；不抛。
- 时序与并发：纯函数。
- 幂等：同输入恒同输出。
- 资源释放：无 IO（`marked` 仅做词法切分）。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- **断言**：空/短内容、超限裁剪与提示、front matter 与 HTML 注释剔除。

## B4 记忆提取与召回类型（`memory/extraction.ts`、`memory/recall/types.ts`）

- 输入：`{ manifest, messageCount }`；召回类型常量无输入。
- 输出：提取提示文本（包含清单条目文件名）；`MEMORY_RECALL_TYPES = ["user","feedback","project","reference"]`。
- 错误语义：不抛。
- 时序与并发：`createMemoryExtractionScheduler` 以快照做去重（同一快照不并发执行第二次）。
- 幂等：提示构造幂等。
- 资源释放：无（实际执行由注入的 `execute` 承担）。
- 平台差异：无。
- 状态所有者：调度器持有上次快照。
- 日志级别：无。
- **断言**：提示非空且含清单条目、类型常量逐项相等。

## B5 辅助模型选项（`model/auxiliary-model-options.ts`）

- 输入：`Model`（读 `optionSpecs.reasoningLevel.values[0]` 与 `optionSpecs.maxOutputTokens.max`）。
- 输出：`Required<ModelOptions>`：最低档位 + `min(5000, 模型上限)`。
- 错误语义：不抛（模型元数据缺失属上游契约问题）。
- 时序与并发：纯函数。
- 幂等：同输入恒同输出。
- 资源释放：无 IO。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- **断言**：档位取下界、预算取 5000 与模型上限的较小者。

## B6 权限（`permission/workflow-draft-path.ts`、`permission/index.ts`）

- 输入：`isPreapprovedWorkflowDraftWrite({ toolName, input, workingDirectory?, pathModule? })`；broker 构造参数。
- 输出：布尔判定；`createDenyPermissionBroker()` 恒拒绝，`createManualPermissionBroker()` 交由调用方裁决。
- 错误语义：输入不是对象、缺 `file_path`、缺 `workingDirectory` 一律返回 `false`（**不放行**）。
- 时序与并发：纯函数，不做任何文件系统访问（不 realpath、不 stat）。
- 幂等：同输入恒同输出。
- 资源释放：无 IO。
- 平台差异：`pathModule` 可注入 `path.win32`/`path.posix`；跨盘符必须判否（`relative` 会返回绝对路径）。
- 状态所有者：无。
- 日志级别：无。
- **断言**：草稿目录内 true；目录本身/目录外/前缀相近的兄弟目录/向上穿越 false；工具名与输入形状不满足 false；win32 注入下跨盘符 false。

## B7 插件引用（`plugin-reference/*`）

- 输入：Markdown 文本；插件元数据列表。
- 输出：`{ references, truncatedCount, invalidCount }`；目录与提醒文案。
- 错误语义：非法稳定 id 计入 `invalidCount` 且不产出引用；重复 id 去重不计入截断。
- 时序与并发：纯函数。
- 幂等：同输入恒同输出。
- 资源释放：无 IO。
- 平台差异：无。
- 状态所有者：无（目录由调用方持有）。
- 日志级别：无。
- **断言**：id 校验边界（长度/单个 @/段字符集）、去重、每轮上限 8 与截断计数、空目录查不到条目。

## B8 运行任务与会话上下文（`runtime-task/*`、`session-context/*`）

- 输入：任务快照、待投递消息、通知输入、消息部件与会话引用文本。
- 输出：注册表读写结果、通知文案（XML 转义 + 120,000 字符截断）、部件投影文本或 `null`、会话引用列表与提醒正文。
- 错误语义：终态任务不再重复通知（抑制判定为真即不发）；被抑制的部件返回 `null`；`safeJson` 对循环引用回退为 `String(value)`。
- 时序与并发：注册表以 `taskId` 为键；`queueMessage`/`drainMessages` 一次取空；等待订阅在 `remove` 时以 `undefined` 通知。
- 幂等：`drainMessages` 第二次返回空数组；`dedupeParts` 同 id 保留最后一个。
- 资源释放：`remove` 清理快照与订阅；等待中的调用被唤醒。
- 平台差异：无。
- 状态所有者：`InMemoryRuntimeTaskRegistry` 持有快照表；`pendingMessages` 由注册表持有。
- 日志级别：无（文案由上层发通知）。
- **断言**：抑制判定判定表、注册表生命周期与终态判定、转义与截断、`escapeXml` 全字符、会话引用去重保序与提醒正文、部件投影的抑制与形状。

## B9 子代理工具面（`subagent/tool-policy.ts`）

- 输入：父代理给定的 `disallowedTools`。
- 输出：剔除 plan 工具后的工具名列表（`EnterPlanMode`/`ExitPlanMode` 恒被剔除）。
- 错误语义：不抛。
- 时序与并发：纯函数。
- 幂等：同输入恒同输出。
- 资源释放：无 IO。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- **断言**：强制剔除两个 plan 工具、附加禁用项、过滤结果保序。

## B10 子代理交互来源（`subagent/interaction-origin.ts`）

- 输入：子代理上下文（agentId / agentType / childSessionId / description / parentSessionId，可选 parentToolCallId / parentTurnId）与可选 childTurnId。
- 输出：`InteractionRequestOrigin`（`kind: "subagent"`）。
- 错误语义：不抛。
- 时序与并发：纯函数。
- 幂等：同输入恒同输出。
- 资源释放：无 IO。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- **断言**：必需字段在场；可选键缺席时**整个键缺席**（不是 undefined 值）；给全时逐字段透传。

## B11 子代理通用提示与档案选择（`subagent/general-purpose.ts`、`subagent/profile-model-selection.ts`）

- 输入：无 / frontmatter 对象。
- 输出：通用子代理系统提示；档案的 `ModelSelection | undefined`。
- 错误语义：解析不出选择时返回 `undefined`（不抛、不给默认值）。
- 时序与并发：纯函数（解析走 `@knorvia/shared` 的正式 codec）。
- 幂等：同输入恒同输出。
- 资源释放：无 IO。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- **断言**：代理类型常量、提示含 CLI 标识与惯例段、空 frontmatter 解析为 `undefined`。

## B12 子代理消息 steer 与完成通知（`subagent/message-steering.ts`、`subagent/completion-notification.ts`）

- 输入：可 steer 的运行器与 `{ traceContext }`；本地子代理任务通知输入。
- 输出：`RuntimeTaskMessageSink`（成功返回 `"steered"`）；XML 转义后的完成通知。
- 错误语义：被拒（非 `no_active_turn`）抛 `Subagent message rejected: <reason>`；`no_active_turn` 最多重试 20 次后不再等待。
- 时序与并发：重试间隔 10ms；同一条消息带 `inputId`，由运行器侧去重。
- 幂等：投递同一 `id` 由运行器按 `inputId` 幂等处理。
- 资源释放：无长驻资源（等待用定时器，重试上限固定）。
- 平台差异：无。
- 状态所有者：被 steer 的运行器持有 turn 队列。
- 日志级别：无（失败路径由调用方记录）。
- **断言**：接受即 `"steered"`；先 `no_active_turn` 后接受仍成功且重试次数符合；其它拒绝抛错；通知含任务 id 与转义后的失败原因。
