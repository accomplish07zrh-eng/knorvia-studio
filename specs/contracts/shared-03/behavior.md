# shared-03 行为规格（v1，进行中）

范围：`packages/shared/src` 继承剩余的 34 件（清单见 `README.md` §一.3 六簇）。
编号发布后不重用；每条在 README「条目 → 测试」对照表里至少有一个断言。

通用约定（适用于所有条目，条目内不再重复）：

- **时序与并发**：除注明的文件 IO 外全部为纯函数/短 IO；无长驻定时器、无后台任务。
- **幂等**：纯函数天然幂等；文件改写类条目单列「再跑一次」结果。
- **资源释放**：临时文件/句柄的关闭写在对应条目；其余无资源。
- **日志级别**：本包**不写日志**，错误以返回值或抛错交给调用方。
- **平台差异**：路径类条目在 Windows 与 POSIX 同时成立（分隔符、大小写、换行、权限位差异写在条目里）。
- **状态所有者**：默认无状态；状态归调用方（services / CLI / desktop / ui）。唯一例外见 B11/B12 的写文件面。
- **金样口径**：配置/协议面做「旧写→新读→新写→旧读」往返（逐字节）；事件类做 gate 握手断言（fixtures 由旧实现录制）。

---

## H1. workspace-hook 六件（B1–B12）

### B1 workspace-hook 配置 schema 形态（`workspace-hook-config.ts`）

- 输入：`workspaceHooksConfigSchema.parse(value)`；子 schema `workspaceHookProcessConfigSchema`、
  `workspaceHookCommandConfigSchema`、`workspaceHookMatcherConfigSchema`。
- 输出：
  - process 定义：`type:"process"`、`command` 非空串；可选 `enabled`、`args: string[]`、
    `timeoutMs`（正有限数）、`statusMessage`（非空串）；**passthrough**（未知键保留）。
  - command 定义：`type:"command"`、`command` 非空串；可选 `enabled`、`async`、
    `shell: true | 非空串`、`timeout`（正有限数，秒）、`timeoutMs`、`statusMessage`；**passthrough**。
  - matcher 组：`matcher`（可选非空串）+ `hooks`（1..n，判别联合 type=command|process）；**strict**。
  - 配置根：可选 `enabled`、`timeoutMs`、`maxOutputBytes`（正有限数）、`events`（strict 对象，
    键恰好 `WORKSPACE_HOOK_EVENT_NAMES` 七项、每项 matcher 组数组）；**strict**。
- 错误语义：zod 校验失败抛 `ZodError`（`readWorkspaceHookProjectSources` 捕获进 errors）。
- 时序与并发：纯解析。幂等。资源释放：无。平台差异：无。状态所有者：无。日志：无。
- 语义常量（逐字冻结）：`WORKSPACE_HOOK_DIGEST_SCHEMA_VERSION = 1`、
  `DEFAULT_WORKSPACE_HOOK_TIMEOUT_MS = 60000`、`DEFAULT_WORKSPACE_HOOK_MAX_OUTPUT_BYTES = 32768`、
  `WORKSPACE_HOOK_EVENT_NAMES = ["SessionStart","UserPromptSubmit","PreToolUse","PermissionRequest",
"PostToolUse","PostToolUseFailure","Stop"]`（7 项、此序）。

### B2 配置发现与读取（`workspace-hook-config.ts`）

- 输入：`discoverWorkspaceHookConfigPaths({workingDirectory, explicitProjectConfigPath?})`（同步）与
  `readWorkspaceHookProjectSources(同参)`（异步）。
- 输出：候选文件 = 每级目录的 `knorvia.json` 与 `.knorvia-studio/config.json`；
  目录序：从 `resolve(workingDirectory)` 向上收集，遇到含 `.git`（文件或目录）的 worktree 标记即停并**反转**
  （祖先在前、工作目录在后）；**没有任何 worktree 标记时整体回落为 `[start]`**（不向上扫）。
  显式项目配置路径存在时追加 `{path, explicitProjectConfig: true}`。
  去重按 `resolve(path)` 的规范化键保序。读取版：逐 ref 读 UTF-8 → `JSON.parse`；
  非对象根或无 `hooks` 字段**静默跳过**；schema 失败/读失败进 `errors[]`（`{path, error}`），不中断其余源。
- 错误语义：读/解析失败不抛，归入 errors。时序：发现序即 `discoveryOrder`。幂等：纯读。
- 资源释放：无句柄。平台差异：`.git` 两种形态都算标记；路径用 `resolve` 规范化，Windows 大小写按 fs 语义。
- 状态所有者：无。日志：无。

### B3 源输入构造（`workspace-hook-config.ts` `createWorkspaceHookSourceInput`）

- 输入：`{path, workingDirectory, hooks, discoveryOrder, explicitProjectConfig?}`。
- 输出：`canonicalPath = resolve(path)`；`baseDir` = 配置目录，但目录名是 `.knorvia-studio` 时上提一级；
  `configFileKind`：explicitProjectConfig → `"explicit"`，否则按文件名 `knorvia.json` → `"knorvia.json"`，
  其余 → `".knorvia-studio/config.json"`；`editable` = 非显式 且 canonicalPath 恰等于
  `resolve(workingDirectory, ".knorvia-studio", "config.json")`。
- 其余八项同通用约定（纯函数、无错误分支、无状态）。

### B4 限额解析（`workspace-hook-config.ts`）

- `resolveWorkspaceHookTimeoutMs(hook, defaultTimeoutMs)`：`timeoutMs` 优先；缺席且 type=command 且给了
  `timeout`（秒）→ `timeout*1000`；否则默认值；最终 `Math.max(1, Math.round(value))`。
  **注意**：process 定义的 `timeout` 字段不参与换算（schema 里 process 无 timeout）。
- `resolveWorkspaceHookMaxOutputBytes(v)` = `Math.max(1, Math.round(v))`。
- `resolveWorkspaceHookRuntimeRoot(roots)`：按数组顺序逐根覆盖——`enabled` 仅 `=== true` 才置真（不回退），
  `timeoutMs`/`maxOutputBytes` 给了就覆盖；缺省 60000 / 32768；出口再走 1 取整钳制。
  `undefined` 根跳过。**enabled 不因后续根缺省而回 false**（单调置真）。
- 时序：纯函数；幂等；无资源；平台差异无；状态所有者无；日志无。

### B5 配置态门（`workspace-hook-config.ts` `resolveWorkspaceHookConfiguredGates`）

- 输入：`{sourceEnabled?, declarationEnabled?, runtimeHooksEnabled}`。
- 输出：`sourceRootEnabled = sourceEnabled !== false`、`declarationEnabled = declarationEnabled !== false`
  （**undefined 按 true**）、`runtimeHooksEnabled` 原样、`configuredEnabled = 三者与`。
- 返回对象键序固定（sourceRootEnabled、declarationEnabled、runtimeHooksEnabled、configuredEnabled）。
- 其余八项同通用约定。

### B6 声明摘要（`workspace-hook-digest.ts` `createWorkspaceHookDeclarationDigest`）

- 输入：`{sourceRelativePath, sourceDiscoveryOrder, event, matcher, matcherIndex, hookIndex, hook,
defaultTimeoutMs, resolvedMaxOutputBytes}`。
- 输出：sha256 hex（64 小写）of `JSON.stringify(payload)`，payload 元组序：
  `["workspace-hook-declaration", 1, sourceRelativePath, sourceDiscoveryOrder, event, matcher,
matcherIndex, hookIndex, execution, resolvedTimeoutMs, resolvedMaxOutputBytes]`。
  `execution`：process → `["process", command, args副本]`；command → `["command", command, async===true,
shellMarker]`，`shellMarker` = undefined→`["unset"]`、true→`["true"]`、字符串→`["string", shell]`。
  `resolvedTimeoutMs` 用**传入的 defaultTimeoutMs**（审阅时默认）走 B4 同一换算。
- 摘要依赖 JSON.stringify 的键序与数组序 → 载荷结构与顺序是契约的一部分（金样敏感）。
- 其余八项同通用约定（纯函数）。

### B7 条目解析（`workspace-hook-digest.ts` `resolveWorkspaceHookEntries`）

- 输入：`{workspacePath, sources, runtimeRoot}`。
- 输出：遍历序 = sources 序（discoveryOrder）→ `WORKSPACE_HOOK_EVENT_NAMES` **固定七序** → matcher 数组序
  → hooks 数组序。每条含：`reviewItemId = "workspace-hook-<sourceFileIndex>-<event>-<matcherIndex>-<hookIndex>"`、
  索引四元组、`sourceRelativePath`（workspacePath 相对、`\`→`/`、空串回退 basename）、
  `matcher`（缺省为 null）、`command`、`resolvedTimeoutMs`（B4，默认=runtimeRoot.timeoutMs）、
  `resolvedMaxOutputBytes`（=runtimeRoot.maxOutputBytes）、门字段（B5）、`editable`、
  `hookDeclarationDigest`（B6）。可选字段**只在有值时在场**：`statusMessage`（truthy）、
  process 的 `args`（非空数组时拷贝）、command 的 `async`（仅 true）与 `shell`（给定即带）。
- 其余八项同通用约定（纯函数、键序固定、金样敏感）。

### B8 bundle 快照（`workspace-hook-digest.ts` `buildWorkspaceHookBundleSnapshot`）

- 输入：`{workspaceIdentity, workspacePath, sources, runtimeRoot, discoveredAt?}`。
- 输出：**hooks 为空 → `undefined`**（不是空快照）。否则返回深冻结快照：
  `schemaVersion=1`、`workspaceIdentity`、`discoveredAt`（缺省 `new Date().toISOString()`）、
  `sourceFiles[]`（每源：canonicalPath/baseDir/discoveryOrder/configFileKind/explicitProjectConfig/editable/
  hooksRoot——三个可选根字段仅在源里显式给出时在场）、`hooks`（B7）、`digestAlgorithm:"sha256"`、
  `bundleDigest`。
- `bundleDigest` = sha256(JSON.stringify(["workspace-hook-bundle", 1, sourceTuples, hookTuples]))；
  sourceTuple = [相对路径, discoveryOrder, configFileKind, explicitProjectConfig,
  optionalMarker(enabled), optionalMarker(timeoutMs), optionalMarker(maxOutputBytes)]，
  `optionalMarker`：undefined→["unset"]，否则["set", value]；hookTuple = [hookDeclarationDigest,
  sourceRootEnabled, declarationEnabled, runtimeHooksEnabled, configuredEnabled]。
- **bundleDigest 不含 discoveredAt 与 workspaceIdentity**（同输入不同时间 → 同摘要）。
- 深冻结：返回值全对象 `Object.freeze` 递归（freezeSnapshot），下游不得改写。
- 其余八项同通用约定。

### B9 review 单调性裁决（`workspace-hook-review-monotonicity.ts`）

- 输入：`current: {reviewFlowId, generation, interactionId} | undefined`，`candidate` 同形。
- 输出六 verdict：`no_current`（无当前→接管）；`cross_flow`（flowId 不同）；`same_flow_advance`
  （generation 更高）；`same_flow_stale`（更低）；`same_flow_replay`（同 generation 且同 interactionId）；
  `same_flow_conflict`（同 generation、不同 interactionId）。
- 比较**只看三元组**；裁决是纯函数，应用策略（drop/defer/接新权威）归调用方。
- 其余八项同通用约定。

### B10 trust store schema 与解析（`workspace-hook-trust-store-file.ts`）

- 常量（逐字冻结）：`WORKSPACE_HOOK_TRUST_STORE_SCHEMA_VERSION = 1`；记录字段：
  `workspaceIdentity`（trim 非空）、`hookDeclarationDigest`（`/^[a-f0-9]{64}$/`）、
  `digestAlgorithm` 字面 `"sha256"`、`decision` 字面 `"trusted"`、`grantedAt`（ISO datetime）、
  可选 `lastUsedAt`/`bundleDigestAtGrant`/`eventAtGrant`（7 事件枚举）/`displayCommandAtGrant`/
  `sourcePathAtGrant`/`sourceDiscoveryOrderAtGrant`（非负整数）/`matcherAtGrant`（可空串）/
  `matcherIndexAtGrant`/`hookIndexAtGrant`/`appVersionAtGrant`；记录与文件**strict**。
- 文件体：`schemaVersion` 字面 1 + `records` 数组；superRefine 要求
  `workspaceIdentity + "\u0000" + hookDeclarationDigest` 键唯一（违反 → issue 指向 records、
  message `"workspace identity and declaration digest keys must be unique"`）。
- `parseWorkspaceHookTrustStoreContent`：JSON 语法错与 schema 失败**统一** `{status:"invalid"}`
  （fail-closed、无部分结果）；成功 `{status:"ok", file}`（zod 输出）。
- 平台差异：无（纯解析）。状态所有者：文件在调用方。日志：无。

### B11 原子写配置（`workspace-hook-mutation.ts` `atomicWriteWorkspaceHookConfig`）

- 输入：`filePath`、`value`（plain object）、`options.beforeRename?`。
- 输出：目录递归创建；临时文件 `.<basename>.<pid>.<Date.now()>.<随机hex>.tmp` 于同目录，
  `open(..., "wx", 0o600)` → 写 `JSON.stringify(value, null, 2) + "\n"`（UTF-8）→ `fsync` → close →
  可选 `beforeRename()` → `rename` 到目标。**成功后目标内容是 2 空格缩进 JSON + 尾随换行**（往返金样口径）。
- 错误语义：任何一步失败 → 关句柄（吞关闭错）、`rm(tmp, {force:true})`（吞清理错）后**原样抛出**；
  临时文件不残留、目标文件不受影响（rename 前失败）。
- 并发：`wx` 保证临时名不撞；rename 原子替换。幂等：同 value 再写结果相同（字节稳定）。
- 平台差异：`rename` 覆盖已存在目标在两平台按 Node 语义（Windows 下目标被占用可能 EPERM，错误原样抛）。
- 状态所有者：目标文件归调用方；本函数无内部状态。日志：无。

### B12 开关写入（`workspace-hook-mutation.ts` `writeWorkspaceHookConfiguredToggle`）

- 输入：`{configPath, snapshot, reviewItemId, enabled, writeOptions?}`。
- 校验链（不满足即抛 `WorkspaceHookMutationError`）：
  ① 目标条目存在且 `entry.editable` 且对应 `source.editable` 且 `source.configFileKind === ".knorvia-studio/config.json"`
  且 `resolve(source.canonicalPath) === resolve(configPath)` → 否则 `workspace_hooks_snapshot_mismatch`
  （"…not the current editable project config"）；
  ② 读文件/JSON.parse 失败 → `workspace_hooks_config_unreadable`（cause=原错误）；
  ③ 根非对象 / `hooks` 无 schema / 无 hooks 对象 / 无 events 对象 / 事件数组缺失 / matcher 或 hooks 数组缺失 /
  声明非对象 / 解析后声明缺失 → 均 `workspace_hooks_snapshot_mismatch`（各带固定 message）；
  ④ 用**快照里的 resolvedTimeoutMs 作 defaultTimeoutMs** 复算 B6 摘要，与 `entry.hookDeclarationDigest`
  不一致 → `workspace_hooks_snapshot_mismatch`（"…changed after review"）——审阅后声明被改则拒写。
- 通过后：仅把 raw 中该声明的 `enabled` 置为入参，`atomicWriteWorkspaceHookConfig` 整文件重写（B11）。
- 错误类：`WorkspaceHookMutationError`，`name="WorkspaceHookMutationError"`，`code` 四值
  （snapshot_mismatch / bundle_changed / config_unreadable / config_write_failed；后两者为保留位）。
- 幂等：重复 toggle 到同一值 → 同文件字节。并发：同文件写按 B11 原子性；两次 toggle 串行结果取最后。
- 平台差异：同 B11。状态所有者：配置文件归调用方。日志：无。

---

## H2. background-task 六件（B13–B19）

### B13 后台任务控制项解析（`background-task-controls.ts`）

- 输入：`parseKnorviaBackgroundTaskControlItems(value: unknown)`；子件 `resolveKnorviaBackgroundTaskControlKind`。
- kind 判别顺序：① 显式字段 `taskKind|task_kind|taskType|task_type` 经 `controlToken`
  （trim→小写→非 `[a-z0-9]` 折 `_`）查 `namedKinds`（agent/local_agent/subagent/background_agent→agent；
  bash/local_bash/shell/terminal/background_bash/background_shell→bash）；② `toolName|tool_name`
  归一为 `"task"` → agent，否则再查 namedKinds；③ `type|kind|category` 查 `backgroundKinds`
  （local_agent/subagent/background_agent/agent_background→agent；local_bash/background_bash/
  background_shell/bash_background/shell_background→bash）。无命中 → undefined → 该条丢弃。
- command 取值：`commandValue`（串 trim 非空；数组则逐项字符串 trim 非空后空格拼接）；
  agent 优先 `description|summary|title|label`，回退 `command|cmd|script`（含 `record.input` 嵌套层）；
  bash 与之相反。无 command → 丢弃。
- jobId：`taskId|task_id|backgroundTaskId|background_task_id|jobId|job_id|backgroundJobId|background_job_id|id`
  首个非空 trim 串；否则合成 `background-task:${pid ?? "no-pid"}:${startedAt ?? "no-start"}:${command}`
  （**任务标识优先于 toolCallId**，避免同一工具调用下任务相互覆盖）。
- status：`status|state|phase` 归一后查六组 token 表：pending(queued/scheduled/starting/pending)、
  running(running/in_progress/started/active)、completed(completed/complete/success/succeeded/done)、
  failed(failed/failure/error/spawn_error)、killed(killed/cancelled/canceled/stopped/terminated/timed_out/timeout)、
  lost(lost/unknown)；**无命中/缺席 → "running"**。
- 可选字段仅在有效值时在场：`toolCallId`、`title`（title/name/label/description）、`stdoutTail`/`stderrTail`/
  `outputTail`、`startedAt`（数字或 Date.parse 可解析串）、`pid`、`elapsedMs`（正有限数或数字串）、
  `cancellable`（布尔或 true/yes/1、false/no/0 串）；`raw` 恒为原值。
- 解析入口：非数组 → `[]`；逐条 normalize 后按 `jobId` 入 Map（**后条覆盖前值、保首次插入位**），输出 Map 值序。
- 时序：纯函数；幂等；资源无；平台差异无（时间解析按 Date.parse）；状态所有者无；日志无。

### B14 活跃/时长/可见（`background-task-controls.ts`）

- `isActive…(job)`：`status === "running"`（killed/lost 均不活跃）。
- `get…ElapsedMs(job, now = Date.now())`：`clock = startedAt === undefined ? 0 : max(0, now - startedAt)`；
  返回 `max(clock, elapsedMs ?? 0)`。
- `collectVisible…(jobs, now = Date.now(), thresholdMs = 30000)`：仅活跃且 `elapsedMs >= thresholdMs`，
  返回浅拷贝 `{...job, elapsedMs}`，按 elapsedMs **降序**（稳定排序）。
- 其余八项同通用约定（`now`/`thresholdMs` 可注入便于测试）。

### B15 控制项合并（`background-task-control-merge.ts` `mergeKnorviaBackgroundTaskControlItems`）

- 输入：`current`、`updates` 两个只读数组。输出：按 `jobId` 的 Map 归并——current 依序先入、
  updates 依序覆盖同 id 并追加新 id 尾部；结果为 Map 值序（**首次出现位保留、后值生效**）。
- 幂等：同 updates 再合并结果相同。其余八项同通用约定。

### B16 bash 作业视图（`background-bash-jobs.ts`）

- `parseKnorviaBackgroundBashJobs(value)` = B13 解析后过滤 `taskKind === "bash"`；
  `isActive/elapsed/collectVisible` 三个包装与 B14 语义一致（含默认 `thresholdMs = 30_000`）。
- 类型：`KnorviaBackgroundBashJob = KnorviaBackgroundTaskControlItem & { taskKind: "bash" }`；
  `KnorviaBackgroundBashJobStatus = KnorviaBackgroundTaskControlStatus`（六态同集）。

### B17 后台输出 schema（`background-bash-output.ts`）

- 语义常量（逐字冻结）：`BACKGROUND_BASH_OUTPUT_MAX_BYTES = 8192`。
- `backgroundBashOutputSchema`（strictObject）：`kind:"output"`、`workId` 非空、`status` 六枚举
  （running/completed/failed/timed_out/cancelled/spawn_error）、`output` ≤8192 字符、`truncated` 布尔、
  `outputPath` 非空。
- `backgroundBashOutputResultSchema` = union(outputSchema, strictObject{kind: unavailable|unsupported|read_failed,
  workId 非空, code? 可选串})。**后台详情是单次文件快照**，不进 conversation snapshot、不持久化。
- 其余八项同通用约定。

### B18 bash 展示 schema（`bash-output-display.ts`）

- `bashOutputDisplaySchema`（strict）：`kind:"bash_output"`、`output` ≤150_000、`truncated` 布尔、
  `outputPath` 可选（1..32_768）。**协议面只传有界头部与真实截断/文件保留事实**，原始文件不进协议。
- 其余八项同通用约定。

### B19 通知解析与装配（`background-task-notifications.ts`）

- `parseKnorviaBackgroundTaskNotificationText(text)`：内容 trim 后必须以 `<task-notification>` 开头否则 null；
  标签抽取 `<tag>…</tag>`（非贪婪、`s` 语义）、body trim 非空；实体反转顺序固定
  `&quot;→"`、`&apos;→'`、`&lt;→<`、`&gt;→>`、`&amp;→&`（**&amp; 最后**，避免二次反转）。
  `tool-use-id` 缺失 → null；返回 `{notification, toolUseId}`，notification 六字段
  （error/output-file/result/status/summary/task-id）未给即 undefined。
- `collectKnorviaBackgroundTaskNotificationsByToolUseId(messages)`：仅 `info.role === "user"` 消息，
  文本取 `textFromKnorviaMessageParts(parts)`；同 toolUseId 后写覆盖；输出 Map（插入序）。
- `knorviaBackgroundTaskNotificationToolUpdateStatus(status)`：failed/lost → `"failed"`；
  stopped/killed → `"stopped"`（**中止不得映射为完成**）；其余（含 undefined）→ `"completed"`。
- `attachKnorviaBackgroundTaskNotificationToRaw(raw, notification)`：notification 缺席 → raw 原样；
  否则浅拷贝 raw 并把 notification 挂到 `_meta.knorvia.taskNotification`（三层浅展开保留其余键；
  raw 非对象按 `{}` 起底）。
- 其余八项同通用约定。

---

## H3. conversation/assistant 五件（B20–B26）

### B20 助手消息分段（`assistant-message-parts.ts`）

- 形态：`KnorviaAssistantMessagePart = {type:"content",content} | {type:"thought",content} | {type:"tool-call",toolId}`。
- `appendAssistantMessagePart(parts, nextPart)`：`parts` 缺席按 `[]`；**仅当**末段与新段 `type` 相同且
  同属 content/thought 时合并（`content` 相接），返回「截尾 + 合并段」；否则追加。两分支都返回**新数组**，
  不改原数组；`tool-call` 永不合并。合并存在的理由：UI latestPart 与第三方完成消息依赖 part 边界，
  连续文本 chunk 不合并会被按 token 边界误判最新正文。
- `getLatestAssistantContentPart(parts)`：倒序找首个 `type==="content"`，无则 `null`；
  `getLatestAssistantContentText` = 其 `content ?? ""`。
- 其余八项同通用约定（纯函数、无状态）。

### B21 助手呈现组装（`assistant-presentation.ts` `buildKnorviaAssistantPresentation`）

- 输入：`{content, thought?, toolCalls? = [], parts?, streaming?, interrupted?, settling?}`。
- `toolsById`：按 `toolId` 建 Map（**后条覆盖**）；`isRoot(tool)` = 无 `parentToolUseId` 或等于自身 id
  或父 id 不在表中。
- `messageParts`：给了非空 `parts` 则**逐条复制**；否则按 `thought`（若给）→ root tool-calls（表序）
  → `content`（非空才带）构造。
- `blocks`：content/thought 直映；tool-call 段仅当 `toolsById` 命中、**未曾渲染**且 isRoot 才输出
  （renderedToolIds 去重）。`latestPart`：仅 `!streaming && !interrupted && !settling` 时，从 blocks 的
  content 段按文本相等选**最后一个**（`selectedIndex` 同步记录）；否则 null。
  `historyBlocks` = blocks 去掉 selectedIndex 那条。
- 错误语义：不抛。幂等：纯函数。状态所有者无。日志无。

### B22 消息投影策略（`conversation-message-projection-policy.ts`）

- `getConversationMessageProjectionPolicy(message)` 判定序（先语义层后来源层，前命中即返回）：
  ① `semantics.kind === "compact_summary"` 或 `info.summary !== undefined` → providerContextOnly；
  ② semantics 存在时：`kind==="timeline_event"`→timelineOnly；`origin==="real_user"` 且非 synthetic 且
  visibility≠model-only→realUserInput；`role=assistant && kind=assistant_response && uiVisibility=visible &&
transcriptVisibility=visible`→visibleAssistant；`providerVisibility==="visible"`→providerContextOnly；
  `kind==="fork_notice"`→timelineOnly；`origin==="agent_runtime"` 或 ui/transcriptVisibility==="hidden"
  →hiddenSynthetic；
  ③ `info.visibility==="model-only"` 或任一 part 的 `metadata.visibility==="model-only"`/`source==="goal-continuation"`
  →providerContextOnly；
  ④ 时间线投影（kind=timeline_event / source=fork / metadata.forkContext.kind=session_fork /
  part.type=timeline / compaction 且带 timelineStatus 或 summaryMessageId）→timelineOnly；
  ⑤ 来源解析 `messageSource`（`info.source` → `info.metadata.source` → `semantics.source` →
  首个 part 的 `metadata.source`）：`"fork"`→timelineOnly；命中 `providerSyntheticSources`（**17 项**：
  agent_control_message、background_task、goal-continuation、goal_completion_verification、goal_state_change、
  plugin_reference、queued_system_notification、resume_goal_state、resume_referenced_session_context、rewind、
  selection_side_chat、subagent、subagent_message、target_continuation、task_notification、task_status、
  todo_reminder）→providerContextOnly；legacy 提醒文本（`<system-reminder source="goal-continuation">` 开头、
  或 `<system-reminder>` 且含两条固定文案、或含 "Conversation rewind applied."/"Workspace rewind applied."）
  →providerContextOnly；
  ⑥ synthetic（info 或任一 part）且 legacy 通知文本（`<task-notification>`/`<subagent-notification>` 开头）
  →providerContextOnly；仅 synthetic→hiddenSynthetic；
  ⑦ 兜底：`role==="assistant"`→visibleAssistant，否则 realUserInput。
- `isConversationRealUserTurnStarter` = role user 且 policy=realUserInput；
  `getConversationModelOnlyTurnTriggerSource` = role user 且 policy=providerContextOnly 时，
  来源命中 `modelOnlyTurnTriggerSources`（**6 项**：background_task、task_notification、subagent、
  subagent_message、goal-continuation、target_continuation）→返回该来源；legacy 通知文本→`"background_task"`；
  否则 null。三个布尔便捷函数即 policy 等值判断。
- 名单顺序与文本匹配都是契约（金样敏感）；纯函数、无状态、无日志。

### B23 预览文件引用抽取（`conversation-preview-artifacts.ts`）

- 语义常量（逐字冻结）：`CONVERSATION_PREVIEW_CARD_CANDIDATE_LIMIT = 15`、
  `CONVERSATION_PREVIEW_CARD_VISIBLE_LIMIT = 10`。
- 文件类型定义表：md/html(htm)/docx/xlsx/pptx/pdf 六种固定（mimeType、artifactType 冻结）+
  `MEDIA_PREVIEW_FORMATS` 11 项派生（kind=video|audio、artifactType=kind）。`getConversationPreviewFileType`
  按小写后缀**首个命中**。
- `resolveConversationPreviewPath(workspacePath, rawPath)`：`clean`（trim、去尾部标点、去 `:行(:列)` 后缀）；
  `~/` 开头拒绝（null）；`file://` 走 URL 解析（protocol 必须 file、decodeURI 失败保留原 pathname、
  `/X:/` 去首斜、非 localhost 主机名转 UNC 形态）；绝对路径（`/`、`X:\`、`\\`）走 `absoluteKey`；
  相对路径折叠 `.`/`..`（**越根返回 null**）后拼到 workspace 绝对键下（去尾斜）。
  `\`→`/`、重复斜杠折叠。
- `extractConversationPreviewFileReferences(content, workspacePath)`：五类引用按序扫描——
  ① citation 指令 `:…-file-citation{…}`（保护区；`path=` 参数；`artifact_kind` 限定 document→docx、
  presentation→pptx、workbook→xlsx，且只认 docx/xlsx/pptx/pdf/video/audio）；② markdown 链接
  （`[text](url)`，尖括号剥壳）；③ `file://` URL（clean 后）；④ 引号路径（成对引号内、带扩展名、
  记录内层起点）；⑤ 裸路径（边界字符集含中英文标点）。后四类遇**保护区重叠**跳过；②③④⑤ 命中后
  加保护区。仅接受解析成功且类型表命中的引用，产出 `{start,end,kind,path,raw}`。
  输出按 `start 降序、end 降序` 排序后按 `absoluteKey(path)` **去重保首次**，再反转为升序。
- 平台差异：路径归一同时接受 `/` 与 `\`；`X:\` 与 UNC `\\` 视为绝对。其余同通用约定。

### B24 预览候选构造（`conversation-preview-artifacts.ts`）

- `buildConversationPreviewArtifactCandidatesFromReferences`：`fileChanges` 先分 active/reverted 两集合
  （路径经 resolve+absoluteKey 归一）；对引用按 `start 降序` 处理：类型不认→丢；`enforceWorkspaceBoundary !== false`
  时越界（`within`：等根或根前缀 `/`）→丢；**markdown/html 要求 active 命中且未 reverted**（requiresFileChanges），
  其余不要求；`absoluteKey(path)` 去重；产出候选 `{artifactType, displayName(leaf), mimeType, previewKind,
productTurnId, sourceKind:"assistant_preview_card", sourceRef:reference.path, requiresFileChanges}`；
  最终 `slice(0, 15)`。
- `buildConversationPreviewArtifactCandidates` = 抽取 + 上述构造（`enforceWorkspaceBoundary` 缺省生效）。
- 时序：纯函数；幂等；无资源；日志无。

### B25 分享路径解析与语言化（`conversation-share.ts`）

- 前缀表（逐字冻结）：`zh-CN → "/cn"`、`en-US → ""`；pathname 正则 `^\/(cn\/)?share\/([^/]+)\/?$`。
- `parseConversationSharePathname`：只认 `/share/<code>` 与 `/cn/share/<code>`；返回
  `{rawCode: 未解码 code 段, locale}`（`cn` 存在→zh-CN，否则 en-US）；形状不符 → null。
- `localizeConversationShareUrl(shareUrl, locale)`：URL 解析失败原样返回；pathname 不匹配分享形状原样返回；
  匹配时**只替换语言前缀**、code 段原样拼回（不 decode/encode），返回 `url.toString()`。
  未来服务端换 URL 形状时安静不作为（不改错）。

### B26 分享载荷 schema 族（`conversation-share.ts`）

- 语义常量（逐字冻结）：`CONVERSATION_SHARE_SCHEMA_VERSION = 1`；accessMode 三值
  （private/public*readonly/public_importable）；已知错误码 17 个数值字面（3001、3002、3200、3201、3203–3215）；
  descriptor `ref` 正则 `^knorvia-artifact:\/\/share\/[A-Za-z0-9.*~-]+$`；sha256 正则 `^[0-9a-f]{64}$`。
- **出站 strict / 入站宽容**是本族总纪律：出站请求（preparation/confirm/continuation/integrity）严格
  （多字段=本端 bug，当场拒）；入站 wire（capabilities/preview/continuation/integrity/descriptor）非 strict
  （服务端可加字段）。
- `isConversationShareSchemaVersionSupported(v)` = `v <= 1`（版本新→「请升级」而非契约错误；
  版本收口用 `z.number().int().positive()` 而非 z.literal）。
- `decodeConversationShareRows(rows)`：逐行 `conversationRowSchema.safeParse`；失败**跳过并计数**，
  kind 标签（无 kind→"unknown"）去重保序进 `unsupportedKinds`；返回 `{rows, unsupportedCount,
unsupportedKinds}`；**传输层不理解 row 语义**——新 kind/新 enum/新 timelineMarker 都由同一机制消化，
  不做 .catch 枚举兜底（猜错枚举比丢行危险）。
- `narrowConversationShareCapabilities(wire)`：未知 artifact type / access mode **丢弃并计数**；
  已知者收窄为严格 data 形状。丢弃对「客户端产不出的类型」无损；若本地可抽某扩展名预览而未入
  `conversationArtifactTypeSchema`，会被误削（历史教训：md 曾被误判；video/audio 是只用于内部预览
  warning 的例外，不入可上传枚举）。
- `createConversationShareSuccessEnvelopeSchema(data)`：`code:0` + `msg: z.string()`（**非 literal**——
  后端回 "ok" 不得判契约错）+ `data`。
- `conversationShareErrorEnvelopeSchema`：`code: z.number().int()`（**不设枚举**，新业务码照常取 msg）、
  `msg: z.string()`。
- preparation 判别联合按 `status`（preparing/confirmed+share）；confirm 请求含 `selected_product_turn_ids`
  （≥1）、`projection.rows`（正式 row schema、≥1、strict）、outbound integrity（**仅两个摘要**，
  不含 payload_sha256）、disclosure_confirmation（version 字面 1、acknowledged_no_secret_detection 字面 true）。
- preview/continuation 的 rows 为 `unknown[]`，对外类型以解码后形状导出（rows: ConversationRow[] +
  `unsupportedRowCount`；continuation 另带 `rawRows` 原样留档避免未知字段被抹）。
- 平台差异：无（纯 schema）。状态所有者：无。日志：无。

---

## H4. workspaceFile 三件（B27–B29）

### B27 条目编解码（`workspaceFileEntriesCodec.ts`）— **往返金样重点**

- 语义常量（逐字冻结）：`WORKSPACE_FILE_ENTRIES_CHUNK_SIZE = 4_000_000`。
- **打包** `packWorkspaceFileEntries(entries)`：每条一行 `<type>\t<escaped(relativePath)>`，`\n` 连接。
  `escapeField`：`\`→`\\`、`\t`→`\\t`、`\n`→`\\n`（替换顺序即反斜杠先）。
- **解包** `unpackWorkspaceFileEntries(packed, rootPath)`：`packed` 空串 → `[]`；
  分隔符按 `rootPath` 是否含 `\` 选 `\`（Windows）或 `/`；prefix = rootPath 补足尾分隔符；
  逐行（`split("\n")`，空行跳过、无制表符跳过）取 `unescapeField`（`\\(.)` 折叠：`t`→Tab、`n`→LF、
  其余取字面）；`name` = 相对路径最后一段；`path` = prefix +（Windows 时把相对路径 `/` 换 `\`）；
  `type` = 前缀串恰为 `"directory"` → "directory"，**其余一律 "file"**。
- **往返不变量**（金样断言口径）：`unpack(pack(entries), root)` 对「相对路径不含换行/制表符/反斜杠怪形」
  的条目集逐字段还原（name/path/relativePath/type）；含 `\`、`\t`、`\n` 的 relativePath 经转义往返一致；
  空数组往返为空数组。**注意**：`name` 取自相对路径分段，`type` 归一为两值——往返按此口径逐字节。
- 平台差异：根路径形态决定输出分隔符（实测两平台）；纯函数；无状态；无日志。

### B28 文件搜索打分与过滤（`workspaceFileSearch.ts`）

- 语义常量（逐字冻结）：`WORKSPACE_FILE_SEARCH_DISPLAY_CAP = 1000`。
- `mapWorkspaceFileEntriesToSearchCandidates`：id=relativePath；三个小写缓存键按 `trim().toLowerCase()`。
- `scoreWorkspaceFileFuzzyMatch(text, query)`：两者 trim+小写；text 空 → null；query 空 → 0；
  前缀命中 → `len(text)-len(query)`；子串命中 → `100+index`；否则**逐字符递进模糊**
  （`indexOf` 从上次位置 +1；任一字符找不到 → null）得分 `200 + Σ(跳跃距离) + len(text)-len(query)`。
- `getWorkspaceFileSearchCandidateScore`：name/relativePath/path 三路打分（归一版同规则）；
  keyword = min(relative+300, path+300)；总分 = min(name, relative+25, keyword)；全 null → null。
- `filterWorkspaceFileSearchCandidates(candidates, query, options)`：
  query trim 空 → `requireQuery ? [] :` 默认列表（**文件优先、目录在后**：priority 文件 0/目录 1 升序、
  同优先级保输入序，再按 limit 截断）；
  否则逐条打分，维护**长度 ≤ limit（缺省 1000）的有序 bestMatches**（比较序：score 升序 → 输入 index 升序
  → `name.localeCompare`），满员时与末位比可短路跳过，插入后超长弹尾。
- 平台差异：localeCompare 排序受运行环境 locale（测试以行为断言为准）；纯函数；无状态；无日志。

### B29 启动本地会话索引（`workspaceSessionRestore.ts` `resolveStartupLocalWorkspaceSessionIndex`）

- 输入：`persistedSessions`（`kind` 可判 `"local"`）、`lastActiveTabIndex?: number`。
- 输出：空表 → null；起始位 = `clamp(lastActiveTabIndex ?? 0, 0, len-1)`；先向后找首个 `kind==="local"`
  （含起始位），找不到再从 0 到起始位（**不含**）回绕找；都没有 → null。
- 语义要点：**远程 workspace 只恢复为断连 tab，不能当预热目标**；回绕保证 renderer active tab 与
  main 预热目标一致。纯函数；无状态；无日志；平台差异无。

---

## H5. tool/execution 八件（B30–B36）

### B30 执行输出预览 schema（`execution-output-preview.ts`）

- 常量：`OUTPUT_PREVIEW_MAX_CHARACTERS = 4096`（模块内）。schema（strict）：`text`/`fullText` 各 ≤4096、
  `totalLines`/`totalBytes` 非负整数、`linesEstimated` 布尔。**两端共用的 Bash 有界输出内容**，
  不含 replayable 传输恢复状态。其余同通用约定。

### B31 执行状态（`execution-state.ts`）

- `executionPermissionModeSchema` = 四值 `build|edit|yolo|auto`（**auto 保留为内部权限；plan 仅在旧格式
  读取边界接受**）；`executionStateSchema` = `{mode, planEnabled}`（非 strict）。
- `resolveExecutionState(input, current = {mode:"build", planEnabled:false})`：mode 解析成功取新值、
  失败取 `current.mode`；`planEnabled = input.planEnabled ?? (input.mode === "plan" ? true :
(mode 解析成功 ? false : current.planEnabled))`。**在接纳边界固定旧请求语义**，队列消费不得按当前
  配置重新解释。纯函数；无状态；无日志。

### B32 运行时工具运行时表（`runtime-tool-runtime.ts`）

- 语义常量（逐字冻结）：`RuntimeToolId = "bfs"|"ripgrep"|"ugrep"`；
  `binaryEnvVar` 三值 `KNORVIA_BFS_BINARY`/`KNORVIA_RG_BINARY`/`KNORVIA_UGREP_BINARY`；
  `bundledResourceDir` 三值 `bfs`/`ripgrep`/`ugrep`；入口段名 `bfs`/`rg`/`ugrep`（win32 追加 `.exe`）；
  远端版本表：bfs{linux:"v4.1.1-2"}、ripgrep{darwin:"v13.0.0-10", linux:"v14.1.1-1"}、
  ugrep{linux:"v7.8.4-1"}`（**按平台解析部署集合**——Linux 已切 native-search 三工具、Darwin 仍 legacy rg13，
  不能用一个全局版本互相覆盖）。
- `getRemoteRuntimeToolsForPlatform(platform)`：三工具依表序，仅输出该平台有版本者（含 runtime 描述）；
  `getRuntimeToolRuntime(id)`：直查本地表。纯函数；无状态；无日志；平台差异仅 `.exe` 后缀。

### B33 工具身份（`tool-identity.ts`）

- `KNORVIA_KNOWN_TOOL_NAMES`：**31 项、此序、逐字冻结**（含 `web_search` 小写双形、`mcp__node_repl__*`
  三前缀形、`AmendWorkflow`、`submit_result`——下划线必须字面在场，否则 UI identity 退回 unknown、
  动态工作流 actor 提交落 raw fallback）。
- `KnorviaToolFamily` 14 值；`TOOL_FAMILY_BY_NAME` 全映射（Write/Edit/ApplyPatch→file-write；Bash→shell；
  Glob/Grep/WebFetch/WebSearch/web_search→search；TodoRead/TodoWrite→todo；Agent/Task→agent；
  TaskOutput/TaskStop→task-control；js\*/mcp**node_repl\***→node-repl；CreateWorkflow/AmendWorkflow/
  submit_result→workflow；GoalRead→goal；ReadSessionContext→session-context；AskUserQuestion→
  ask-user-question；SendMessage/RespondToCoordinator→message；Skill→skill；Read→file-read）。
- `normalizeKnorviaToolName`：trim 后按小写查表，未登记 → null；`getKnorviaToolFamilyForName` 经归一；
  `isKnorviaToolFamily` 等值；`isKnorviaFileContentWriteToolName` = 归一恰为 `"Write"`。
  **大小写不敏感归一、家族表不吞修订入口**（按名先分流、family 兜底不得吃掉 AmendWorkflow/submit_result）。

### B34 工具调用摘要（`tool-call-summary.ts`）

- `CompactToolCallState` 五值；`statusMessageIds` i18n 键表（逐字冻结）：
  input-streaming→chat.toolCall.status.pending、input-available→…running、
  output-available→…done、output-denied→…denied、output-error→…error。
- `summarizeInput(input)`：非对象 → ""；换行/连空白折叠为单空格；`tool_kind` 字段前置为
  `` `[${kind}]` `` 段；字符串字段取首个非空、截 200 字符；其余字段同规则附加。
- `countLines(text)`：`\n` 计数（charCodeAt 10），**尾随 LF 不计入**（0 长 → 0）。
- `getChangeStat(kind, input, output, raw)`：kind 匹配 `/edit|patch|replace|multi.?edit/i` 才继续；
  文本对在 input → output → raw 链上找（`findTextPair`：对象里 after/new_string/content 与
  before/old_string 的组合）；`removed=countLines(before)`、`added=countLines(after)`；
  双零 → undefined。
- `getCompactToolCallSummary`：primaryText = title 归一或 `"tool"`；secondaryText = summarizeInput；
  changeStat 同上。纯函数；无状态；无日志。

### B35 流式工具输入预览（`streaming-tool-input-preview.ts`）

- 语义常量（逐字冻结）：`KNORVIA_ACTIVE_STREAMING_TOOL_INPUT_EAGER_DELTA_COUNT = 1`、
  `KNORVIA_ACTIVE_STREAMING_TOOL_INPUT_PREVIEW_MIN_INTERVAL_MS = 750`、
  `KNORVIA_ACTIVE_STREAMING_TOOL_INPUT_PREVIEW_MIN_RAW_GROWTH = 8 * 1024`、
  `KNORVIA_FILE_STREAMING_TOOL_INPUT_PREVIEW_MIN_INTERVAL_MS = 1000`、
  `KNORVIA_ACTIVE_STREAMING_TOOL_INPUT_TIME_BUDGET_MAX_RAW_INPUT = 8 * 1024`；
  `partialStringFields` 24 字段名表（file_path…script，序即扫描序）。
- `readPartialStringFields(rawInput)`：逐字段 `"<field>"\s*:\s*"` 定位后逐字符扫到闭合引号
  （反斜杠转义感知）；未闭合时截掉残缺 `\u[0-9a-fA-F]{0,3}` 与尾 `\`；`JSON.parse('"…"')` 成功即用、
  失败手工反转义（`\n \r \t \" \\`）。**不解析 JSON、不做 schema**——输入中途即可展示。
- `appendKnorviaStreamingToolInputDelta(state, delta)`：spread + `deltaCount+1` + `rawInput` 相接
  （state 缺席按空串）。
- `buildKnorviaStreamingToolInputPreview(rawInput, completeInput?)`：completeInput 给定 → `{complete:true,
input:completeInput}`；否则 JSON.parse 成功 → complete:true；失败 → `{complete:false, input:部分字段}`。
- `isKnorviaFileStreamingToolInputPreviewTool(name)` = trim 小写后 `write` 或 `edit`。
- `shouldMaterialize…(state, {mode, now, toolName})`：background-summary → false；
  `deltaCount <= 1` → true；file 工具按 1000ms 间隔，其余按 750ms **且** raw 增长 ≥8KB 双条件。
  纯函数；时间可注入；无状态；无日志。

### B36 权限请求预览（`permission-request-preview.ts`）

- `normalizeInline`：折叠连续空白；`normalizeCommand`：同上并剥 `` ` ``；`getInputSource(raw)` =
  `raw?.input`（record 时）否则 raw。
- `collectPaths`：递归找 `path`/`file_path`/`pattern` 的字符串叶子与同名数组元素（trim 非空），
  `seen` 对象集去环。`findCommand`：`command` 字符串叶子或数组字符串元素拼接（顶层优先、递归兜底）。
- `collectChanges`：`state` 必须是 `reverted`/`active` 才计；`content`/`new_string`/`text`+path → after；
  `old_string`/`text`+path → before；`removed = countLines(before)`、`added = countLines(after)`
  （after>before 计 added、反向计 removed 的方向语义保持）。
- `getPermissionRequestPreview({title, description, kind, raw})`：title 回退链
  title→description→kind→`"permission"`（normalizeInline 后空串即回落）；`scope` =
  有 command→"command"、否则有路径→"file"、否则"generic"；`fileChange` 仅恰好一条时导出，
  多条/零条为 null（全量在 `fileChanges`）。纯函数；seen 去环；无状态；无日志。

---

## H6. process/subagent/task-realtime-core 六件（B37–B43）

### B37 进程诊断行契约（`process-diagnostic.ts`）

- 语义常量（逐字冻结）：`KNORVIA_PROCESS_DIAGNOSTIC_PREFIX = "[knorvia-process-exception] "`、
  `NAME_MAX_CHARS = 128`、`MESSAGE_MAX_CHARS = 4000`、`STACK_MAX_CHARS = 16000`、
  `MAX_LINE_CHARS = 131072`、`KNORVIA_AGENT_LIFECYCLE_LOG_MARKER = "[agent-lifecycle-reported]"`。
- schema（strict）：`version` 字面 1、`errorId` uuid、`kind`/`origin` 两值
  （uncaughtException/unhandledRejection）、`name` 1..128、`message` ≤4000、`stack` ≤16000 可选、
  `occurredAt` 非负整数。stderr 单行契约（stdout 不可用的启动早期/协议故障场景）。
- `parseKnorviaProcessDiagnostic(line)`：前缀不符或行超 `131072` → undefined；JSON 解析或 schema
  失败 → undefined（**诊断旁路不得因损坏帧中断业务协议或退出处理**）。

### B38 进程命名（`process-names.ts`）

- 段清洗：trim→小写→非 `[a-z0-9]` 折 `-`→去首尾 `-`→空则丢→截 24 字符；拼接恒以 `knorvia` 前缀 `-` 连接。
- 形态：main→`knorvia-main`；gpu→`knorvia-gpu`；host(label?)→`knorvia-host[-label]`；
  renderer(windowTitle?)：空或 `"Knorvia Studio"`→`…-renderer-main`；`"Resource Manager"`→`…-renderer-resource-manager`；
  `"Knorvia Studio - X"` 前缀→`…-renderer-remote-X`；其余→`…-renderer-<清洗标题>`；
  agent(provider, workspacePath?)→`…-agent-<provider>[-<工作区尾段>]`（尾段取路径分段最后一段、
  空路径不带段）；utility(name?, type="utility")→`…-<type>[-<name>]`。
- 平台差异：路径分段 `/` 与 `\` 同切。纯函数；无状态；无日志。

### B39 进程资源遥测口径（`processResourceTelemetry.ts`）

- 语义常量（逐字冻结）：`PROCESS_RESOURCE_ROLES` 10 项（main、renderer_main、renderer_guest、gpu、
  chromium_other、host、scheduler、cli_chat、cli_aux、mcp）、`KNORVIA_CLI_RESOURCE_SAMPLE_INTERVAL_MS = 60000`、
  `PROCESS_RESOURCE_CLI_LANES` 3 项（chat、plugin、mcp-status）、事件名 3 个
  （perf_process_window/perf_system_window/perf_tool_exec_resource）、
  `ARMS_CUSTOM_EVENT_PROPERTY_LIMIT = 20`、三张 property 白名单（全局 4 键 platform/app_version/arms_env/
  device_mid + 各自字段）、`PROCESS_RESOURCE_FORBIDDEN_PROPERTY_KEY_PATTERN = /pid|path|workspace|session|task|command/i`。
- `resolveCliProcessResourceRole(lane)`：undefined 或 "chat" → cli_chat，其余 → cli_aux。
- `checkProcessResourceEventProperties(eventName, properties)`：仅统计 `!== undefined` 的键；
  `unknownKeys` = 不在白名单、`forbiddenKeys` = 命中禁词正则、`overLimit` = count>20；
  `ok` = 三者皆否。输出对象键序固定。纯函数；无状态；无日志。

### B40 subagent markdown 选择（`subagent-markdown-selection.ts`）

- `parseSubagentMarkdownSelection(frontmatter)`：`model` 非串 → undefined；trim 后空串或
  `inherit|main|sonnet|opus|haiku` → undefined；`custom:` 值走解码（providerId 与 modelName 都要非空）
  否则 `parseModelPickerValue`（抛错→undefined）；`thoughtLevel` 非空则并成
  `options.reasoningLevel`。**正式读取只接受 model 字段**，旧身份迁移归存储边界。
- `formatSubagentMarkdownModel(selection)`：providerId 以 `custom:` 开头或含 `/`，或 modelId 含 `$`
  → `encodeCustomModelValue`；否则 `provider/model`。
- `migrateStoredModel(value)`（内部）：`custom:` 形态仅当解码出 `builtin:` provider 且可迁移才改写，
  **模型未变时保留原始编码字节**（含转义大小写）；斜杠形态仅当 provider 以 `builtin:` 开头才迁移，
  `$` 起属推理后缀**原样保留**。
- `migrateSubagentMarkdownProvider(content)`：frontmatter 正则容忍 BOM；`model:` 行的标量支持
  双引号（JSON.parse）、单引号（`''` 转义）、裸文本三种 token，行尾注释保留在 trailing；
  **迁移值未变则整文件原样返回**；替换只动 body 捕获区（BOM/换行/边界标记/其余 Markdown 逐字节保留）。
- 平台差异：无。纯函数；无状态；无日志。

### B41 subagent 状态导入（`subagent-state-migration.ts` `importSubagentStateSelections`）

- `builtInNames` 两项序：`Explore`、`general-purpose`。
- 权威规则：**自有新字段（`builtInModelSelectionOverrides` / `pluginAgentModelSelectionOverrides`）
  一经在场即为权威值（含空值或损坏值），不回退旧字段**；旧字段（`builtInModelOverrides` +
  `builtInThoughtLevelOverrides`、`pluginAgentModelOverrides` + `pluginAgentThoughtLevelOverrides`）
  仅当新字段缺席才参与配对解析（`parseSubagentMarkdownSelection`）。
- 迁移规则：`selectionForImport(selection, legacy)` 仅在导入时执行——legacy 且 provider 以 `builtin:`
  开头 → `migrateLegacyModelProviderId`（不可迁移返回原 selection）+ `migrateLegacyOfficialGlmModelId`；
  运行时不重新解释历史配置。插件侧另要求 id 以 `plugin:` 开头。
- 输出：`{...input, builtInModelSelectionOverrides, pluginAgentModelSelectionOverrides}`（后两键覆盖）。
- 幂等：对已迁移数据再导入结果相同。纯函数；无状态；无日志。

### B42 task-realtime 常量与信封面（`task-realtime-core.ts`）

- `resolveWorkspaceKey({workspacePath, workspaceIdentity?})` = `workspaceIdentity?.trim() || workspacePath`
  （**全链路唯一键规则**，B49 口径同源）。
- 语义常量（逐字冻结）：`taskRealtimeReasonSchema` **14 项此序**（task_created、user_message_saved、
  assistant_message_saved、task_status_changed、task_meta_changed、task_model_changed、
  task_title_changed、task_pinned、task_unpinned、task_archived、task_unarchived、task_deleted、
  stream_mirror_gap、stream_mirror_owner_lost——切模型/标题更新独立 reason 避免整刷）；
  deliveryPurpose 2 项（observer/relay_owner）；hostDeliveryKind 2 项（desktop_window/relay_bridge）。
- 信封（strict 六字段）：eventId/workspacePath/workspaceIdentity?/workspaceKey/traceId/createdAt；
  watermark（strict）：{runId, opSeq 非负}。
- 失效事件：`task_snapshot_invalidated`（+taskId）、`workspace_task_list_invalidated`（+taskId?、
  taskMeta?——meta schema：mode **六值枚举** yolo/plan/edit/auto/autoEdit/build、lastError.attribution
  共享 `errorAttributionSchema`（旧 schema 曾静默剥离导致手机 replayable 与桌面 snapshot 归因不一致）、
  changeSummary 严格）。
- **gate 握手断言口径（事件类金样）**：`workspaceKey` 必须等于 `resolveWorkspaceKey` 计算值
  （违者 issue：`workspaceKey must match workspaceIdentity fallback rule`）；mirror batch 与 lease 的
  `runId === traceId`（`runId must match traceId`）。两规则由 superRefine 在 event/delivered/target/
  owner-command 全面施加。

### B43 mirror/lease/owner-command（`task-realtime-core.ts`）

- 附件判别联合 5 kind：image/audio/video/pdf/file（各自 filename+mimeType；image/video/pdf 有可选
  sizeBytes/dataBase64/localPath；audio 无 sizeBytes；file 的 `sizeBytes` 必填、多 `textContent`）。
  **kind 集合是协议面**（video 曾漏配导致手机远控拒合法附件）。
- mirror：publish op = user_message（messageId、content、attachments?、timestamp 有限数）|
  stream_event（event: passthrough{type,taskId,traceId}）；`taskStreamMirrorOpSchema` = 同两形态 + `seq` 正整数。
- mirror target（strict + 双 superRefine）：workspacePath/workspaceIdentity?/workspaceKey/taskId/runId/traceId/
  ownerClientId?/ownerDeviceLabel?；batch 事件：type="task_stream_mirror_batch" + taskId/runId/owner 可选 +
  `batchSeq/fromSeq/toSeq` 正整数 + `ops` + `terminal` 布尔（**batchSeq 与 seq 独立轴**）。
- lease：target = mirror target（同 superRefine）；acquire 请求 + `leaseRequestId`；
  result 判别 `acquired`：true→{leaseRequestId, acquired:true, ownerHostId}；
  false→{…, ownerHostId, reason 字面 `"owned_by_other_host"`}。
- owner command：base（strict）= commandRequestId/workspacePath/workspaceIdentity?/workspaceKey/taskId/runId；
  7 个 type：stop_generation；respond_permission（permissionRequestId/optionId/response）；
  respond_elicitation（elicitationRequestId/action∈accept|decline|cancel/content 可选记录）；
  respond_workspace_hook_review（sessionId/bundleDigest `^[a-f0-9]{64}$/`/reviewFlowId/generation 正整数/
  interactionId/decision；**remoteSessionId 在场 ⇒ workspaceIdentity 必须在场**，违者 issue：
  `remote workspace Hook review response requires workspaceIdentity`）；enqueue_task_command
  （taskCommand = runtime command，单 kind send_prompt）；promote_task_command / cancel_task_command
  （commandId + clientMode 字面 `"web-remote-replayable"`）。delivery = 七形态 + `requesterHostId`；
  两者均 superRefine workspaceKey 规则。
- owner command result：`success` 判别——true→{commandRequestId, taskCommand?}；
  false→{commandRequestId, error, code?}；errorCode 三值（NO_ACTIVE_TASK_OWNER、
  STALE_TASK_OWNER_COMMAND、OWNER_COMMAND_FAILED）。
- 事件总集：`taskRealtimeEventSchema` 三 type 判别 + superRefine（workspaceKey 全量、batch 加 runId 规则）；
  `taskRealtimeDeliveredEventSchema` = 同三形态各 extend `originHostId` 必填 + `deliveryPurpose?`。
- **事件类 gate 握手断言口径**：金样覆盖 ① workspaceKey 回退规则（identity trim 空串回退 path）；
  ② runId=traceId；③ batchSeq/seq 双轴；④ remoteSessionId⇒workspaceIdentity；⑤ lease 判别双态；
  ⑥ attachment 5-kind 全集；⑦ reason 14 项与 delivered 信封 extend 面。
- 全部 strict schema：未知字段即拒（协议面逐字）。纯函数；无状态；无日志。

---

（H1–H6 完；B1–B43 齐。下一步：interface.md + interface-appendix、callers.md、tests/fixtures。）
