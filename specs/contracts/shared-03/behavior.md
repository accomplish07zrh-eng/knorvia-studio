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
  （private/public_readonly/public_importable）；已知错误码 17 个数值字面（3001、3002、3200、3201、3203–3215）；
  descriptor `ref` 正则 `^knorvia-artifact:\/\/share\/[A-Za-z0-9._~-]+$`；sha256 正则 `^[0-9a-f]{64}$`。
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

（H4 起续写：B27…）
