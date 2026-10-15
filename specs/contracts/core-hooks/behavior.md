// SPDX-License-Identifier: Apache-2.0
// core-hooks 合同版本 v1.1 的行为规格。行为用本仓库自己的话描述；编号发布后不重用。

# core-hooks 行为规格（v1.1）

## 范围与口径

- 目录：`apps/cli/packages/core/src/hooks/` 共 26 个文件。
- **重写与删除范围 = 16 个继承文件**（`upstream-modified` 14 + `upstream-unchanged` 2）：
  `configured-runner.ts`、`configured-runner-callback.ts`、`configured-runner-input.ts`、
  `display-metadata.ts`、`index.ts`、`session-mailbox.ts`、`types.ts`、
  `workspace-hook-policy.ts`、`workspace-hook-review-flow.ts`、
  `workspace-hook-runtime-admission.ts`、`workspace-hook-telemetry.ts`、
  `workspace-hook-trust-coordinator.ts`、`workspace-hook-trust-domain.ts`、
  `workspace-hook-trust-evaluation.ts`、`workspace-hook-trust-records.ts`、
  `workspace-hook-trust-types.ts`。
- 另外 10 个文件已登记 `independent-replacement`，按 AGENTS.md「不重复改已独立候选」**不动**：
  `runner.ts`、`runner-plan.ts`、`runner-program.ts`、`runner-driver.ts`、
  `runner-callback.ts`、`runner-helpers.ts`、`runner-lifecycle.ts`、`output.ts`、
  `output-projection.ts`、`output-reduction.ts`。它们拥有的行为见附录 A，**不进入本包测试**，
  因此「用 `stubs/` 替换 16 个继承文件后契约测试全部失败」严格成立。
- 命名：B1..B19 是本包要重写并要验收的行为；每条至少一个契约测试（READM 末尾有对照表）。
- 时间：不断言具体毫秒；只断言顺序、字段存在性与单调性。
- 状态所有者：各小节写明；本模块不引入隐藏全局状态（无进程级单例，除传入的依赖）。

## B1 兼容 stdin（`configured-runner-input`）

1. 生成的 JSON **保留**原 `HookInput` 的 camelCase 字段，并追加 `agent_type`（= `agentName`）、
   `hook_event_name`、`permission_mode`（= `mode`）、`session_id`。
2. 在 `os.tmpdir()` 下创建 `knorvia-hook-*` 临时目录，写入 `transcript.jsonl`，并在 JSON 里同时给出
   `transcript_path` 与 `transcriptPath`（同值）。transcript 内容：
   - `Stop` → 一行 assistant 文本消息（`responseText ?? responsePreview`）；
   - `UserPromptSubmit` → 一行 user 文本消息（`prompt`）；
   - 其他事件 → 空文件。
     行格式为 `{"message":{"content":[{"text":...,"type":"text"}],"role":...}}` 加换行。
3. `input` 含 `toolName` 时追加 `tool_name`、`tool_input`、`tool_use_id`。
4. 事件专属别名：
   `PermissionRequest` → `permission_suggestions`；`PostToolUse` → `tool_response`；
   `PostToolUseFailure` → `error_details`、`error`（`error.message` 字符串）、`is_interrupt`；
   `Stop` → `last_assistant_message`（同 2 的值）、`stop_hook_active`；
   `SessionStart` / `UserPromptSubmit` / `PreToolUse` 无额外别名。
5. 返回值形如 `"<json>\n"`；`cleanup()` 递归删除整个临时目录，可重复调用不抛错。
6. 状态所有者：调用方持有返回值；临时目录所有权归返回的 `cleanup`。

## B2 插件环境叠加与变量展开（`configured-runner-input`）

1. `createPluginEnvOverlay` 总是返回 `set`：`CLAUDE_CODE_SESSION_ID`/`CLAUDE_SESSION_ID`/
   `KNORVIA_SESSION_ID` = `sessionId`；`CLAUDE_PROJECT_DIR`/`KNORVIA_PROJECT_DIR` =
   `input.cwd || workingDirectory`（`cwd` 为空串也回退）。
2. 有插件上下文时追加：`CLAUDE_PLUGIN_ROOT`/`KNORVIA_PLUGIN_ROOT` = `rootPath`，
   `CLAUDE_PLUGIN_DATA`/`KNORVIA_PLUGIN_DATA` = `dataPath`，`KNORVIA_PLUGIN_ID` = `id`，
   `KNORVIA_PLUGIN_NAME` = `name`。无插件时不出现这些键。
3. `expandPluginVariables` 替换 `${VAR}`：`CLAUDE_CODE_SESSION_ID`、`CLAUDE_SESSION_ID`、
   `CLAUDE_PROJECT_DIR`、`KNORVIA_SESSION_ID`、`KNORVIA_PROJECT_DIR`，以及有插件时的
   `CLAUDE_PLUGIN_ROOT`、`CLAUDE_PLUGIN_DATA`、`KNORVIA_PLUGIN_ROOT`、`KNORVIA_PLUGIN_DATA`。
4. `${CLAUDE_SKILL_DIR}` / `${KNORVIA_SKILL_DIR}` → 抛
   `CoreError(type=ConfigurationError, recoverable=true)`，`context` 含 `hookEventName` 与 `variable`；
   不得静默展开为空串。
5. 未识别的 `${...}` 原样保留；同一字符串里的多个变量全部替换。
6. 无副作用的纯函数：相同入参恒等输出；不读取环境变量。

## B3 执行描述元数据（`display-metadata`）

`createHookExecutionDescriptor(hook, timeoutMs, expandDisplayValue?)`：

1. `commandDisplay`：
   - `type === "process"`：`[command, ...args]` 逐项过 `expandDisplayValue`（默认恒等），
     再用引号规则连接——只有整体匹配 `^[A-Za-z0-9_./:@%+=,-]+$` 的片段原样输出，否则 `JSON.stringify`；
   - `type === "command"`：展开后的 `command`；
   - 最后整体过 `sanitizeHookDisplayText`（B4）。
2. `sourceKind`：有 `hook.plugin` → `"plugin"`；否则 `hook.source?.kind ?? "internal"`。
3. `clientVisible = sourceKind !== "internal"`。
4. `executionMode`：`type === "command" && async === true` → `"background"`，否则 `"foreground"`。
5. `executionType = hook.type`；`timeoutMs` 为传入值（不被 hook 里的值覆盖）。
6. 可选字段只在有值时出现：`pluginId`、`pluginName`、
   `sourcePath`（`plugin.sourcePath ?? hook.source.path`）、`statusMessage`。
7. 幂等：同样入参多次调用得到相等结果；`expandDisplayValue` 抛错由调用方兜底（B5.7），本函数不吞异常。

## B4 展示文本脱敏（`display-metadata`）

`sanitizeHookDisplayText(value)`：

1. 空串（或假值）原样返回。
2. 下列秘密被替换为 `••••`，其余文本保持不变：
   - `scheme://user:pass@host` 中的 `user:pass`；
   - `authorization: basic|bearer <token>`；
   - 查询串中的 `authorization` 与敏感键（`?k=`/`&k=`）值；
   - `authorization = <token>`；
   - 带引号或不带引号的 `敏感键[:=]值`；
   - `--敏感键 值`。
3. 敏感键名不区分大小写，覆盖 `access_token`、`api_key`、`credential`、`password`、
   `private_key`、`secret`、`token`，以及前缀/后缀变体（如 `my-api-key`、`api_key_backup`）。
4. 非秘密文本（普通命令、参数、URL 的 host 与路径）不被改写。

## B5 配置运行器登记（`configured-runner`）

`createConfiguredHookRunner(options)`：

1. `config.enabled === false` → 配置来源登记项为空（但 workspace 来源仍可产生登记项）。
2. 遍历 `config.events` 的事件与 matcher 配置；每个 matcher 下按 `hooks` 顺序登记，
   `hook.enabled === false` 的条目跳过。
3. `source`：插件来源 = `plugin.<pluginId>.<event>.<matcherIndex>.<hookIndex>`；
   其他 = `config.<event>.<matcherIndex>.<hookIndex>`；workspace 来源 = `project.<reviewItemId>`。
4. `async === true` 仅当 `type === "command"`；`process` 类型即使写 `async` 也按前景执行。
5. 单条超时 = 该 hook 的有效超时（hook 未设置时用 `config.timeoutMs`）；
   `maxOutputBytes` 来自 `config.maxOutputBytes` 的解析结果。
6. `sourceKind`：插件 → `"plugin"`，否则 `hook.source?.kind ?? "internal"`。
7. 没有任何登记项 → 返回 `undefined`。
8. 返回值实现 `HookRunner`，`defaultTimeoutMs = config.timeoutMs`；`emitEvent`/`logger` 透传给运行器。

## B6 workspace 登记项与插入顺序（`configured-runner`）

1. 只有同时提供 `workspaceHookAdmission` 与 `workspaceHookSnapshot` 才产生 workspace 登记项。
2. 每个快照条目：`event`、`matcher`（无则 `undefined`）、`source = project.<reviewItemId>`、
   `sourceKind = "project"`、`timeoutMs = entry.resolvedTimeoutMs`、`maxOutputBytes = entry.resolvedMaxOutputBytes`；
   其 `admission` 调用 `evaluateDispatch({ hookDeclarationDigest, reviewItemId })`。
3. 条目转 `HookConfig`：`command` 类型带 `command`/`async?`/`shell?`；`process` 类型带
   `command`/`args?`；两者都带 `source.kind = "project"`、`source.path`（快照
   `sourceFiles[sourceFileIndex].canonicalPath` 存在时）与 `statusMessage?`、`timeoutMs`。
4. 插入顺序：对每个事件，找到配置登记项中**第一个 `sourceKind !== "user"`** 的下标，
   把该事件的 workspace 项插到它**之前**；没有这样的下标则追加到末尾。
   即：项目 Hook 先于用户/内部配置 Hook，但不会插到用户 Hook 之前。
5. 同一事件内 workspace 项的相互顺序保持快照顺序。

## B7 配置回调执行映射（`configured-runner-callback`）

`createConfiguredHookCallback(...)` 返回的回调：

1. `command` → `executionPort.run` 走 `{ mode: "shell", command, shell }`；
   `process` → `{ mode: "argv", file: command, args }`。
2. 两种类型都用 `cwd = input.cwd || getWorkingDirectory()`，`env = createPluginEnvOverlay(...)`，
   `stdin = createCompatibleHookStdin(input)` 的值（B1），
   `timeoutMs` = 该条超时，`outputLimit = { maxBufferBytes: maxOutputBytes,
maxInlineBytes: maxOutputBytes, persistOutput: "none" }`，
   `trace = { traceId, sessionId, turnId, attributes: { hookEventName, hookIndex, matcherIndex } }`。
3. `command` 与 `process` 的每个命令片段都过 `expandPluginVariables`（B2）；展开抛错时
   由回调向上抛出（不是静默回退）。
4. **无论成功、失败、取消**，都在 `finally` 里调用 stdin 的 `cleanup()`。
5. 回调把 `context.signal` 传给 `executionPort.run` 的 `{ signal }`。
6. 结果映射见 B8、B9。

## B8 执行结果解析（`configured-runner-callback`）

1. `status === "completed"` 且 `exitCode ?? 0 === 0`：解析 stdout（B9.1）。
2. `exitCode === 2`：合成阻断输出（B9.2）。
3. 其他状态/退出码：抛 `CoreError(type=ToolExecutionFailed, recoverable=true)`，
   `context` 含 `exitCode`、`hookEventName`、`status`、`stderrPreview`、`stdoutPreview`；
   `cause.message` = `error.message ?? stderr 预览 ?? "Hook process exited with status <status>"`。
4. 有 stderr 预览（exit 2 时还包括 stdout 预览）→ 返回 `HookCallbackResult`，
   `diagnostics.stderrPreview` 与 `diagnostics.errorMessage` 同值，`stdoutPreview` 仅在 exit 2 出现；
   没有预览时直接返回 JSON 输出（可能 `undefined`）。
5. 预览值去首尾空白；超过 4000 字符截断并追加 `...`；空字符串视为无预览。

## B9 stdout 与退出码 2 的输出语义（`configured-runner-callback`）

1. stdout 解析：
   - 去空白后为空或以非 `{` 开头 → `undefined`（不算错）；
   - 以 `{` 开头但 JSON 解析失败 → `undefined`（hook 打印日志不得让动作失败）；
   - 解析成功但不符合 `HookJSONOutputSchema` → 抛
     `CoreError(type=ToolExecutionFailed, recoverable=true)`，
     `context.errors` 最多 20 条、含 `hookEventName`；
   - 通过校验 → 返回校验后的对象。
2. `exitCode === 2` 合成输出（`reason` 同上取 stderr 预览 ?? stdout 预览 ?? `"Hook blocked execution"`）：
   - `PreToolUse` → `{ continue: false, reason, hookSpecificOutput: { hookEventName: "PreToolUse",
permissionDecision: "deny", permissionDecisionReason: reason } }`
   - `PermissionRequest` → `{ continue: false, reason, hookSpecificOutput: { hookEventName:
"PermissionRequest", decision: { behavior: "deny", message: reason } } }`
   - `Stop` → `{ decision: "block", reason }`
   - 其他事件 → `{ continue: false, reason }`

## B10 workspace Hook 策略提供者（`workspace-hook-policy`）

1. 默认策略 `{ mode: "user_decides", policyRevision: "builtin:user-decides:v1" }`（冻结对象）。
2. `getPolicy(identity)` 返回该 workspace 的策略，未知 identity 返回默认策略（不报错）。
3. `setWorkspacePolicy(identity, policy)`：先按 `workspaceHookPolicySchema` 校验；
   与现值 JSON 相等 → 不通知；否则写入并通知 `{ workspaceIdentity, policy }`。
4. `clearWorkspacePolicy(identity)`：本没有 → 不通知；有 → 删除并通知
   `{ workspaceIdentity, policy: <默认策略> }`。
5. `setDefaultPolicy(policy)`：校验；与当前默认相等 → 不通知；否则更新并通知 `{ policy }`
   （不带 `workspaceIdentity`）。
6. `subscribe(listener)` 返回取消订阅函数；已取消的 listener 不再收到通知。
7. 非法策略 → 抛错且状态不变。
8. 状态所有者：提供者实例；无全局单例。

## B11 信任协调者（`workspace-hook-trust-coordinator`）

1. `coordinatorEpoch` 为空白 → 构造抛错。
2. `getSecurityRevision(identity)` = `{ coordinatorEpoch, counter }`，首次访问 counter 为 0，
   同一 identity 多次调用返回相同 counter。
3. 以下使 counter +1：策略变更（workspace 级只 bump 该 identity；默认策略级 bump **所有已知**
   identity，已知 = 已出现过的 revision key ∪ 持久记录的 workspace）、
   `replacePersistentTrustRecords`（被替换掉的记录所在 workspace 也要 bump）、`revoke`。
4. `validateSecurityRevision(identity, revision)`：epoch 与 counter 都相等才 true；
   epoch 不同或 counter 过期 → false。
5. `replacePersistentTrustRecords(records, state)`：入参逐条按 schema 校验；索引 key =
   `<workspaceIdentity>\u0000<hookDeclarationDigest>`；写入的记录同时清除撤销标记；
   `state` 原样保存；`state.status === "corrupt"` 时所有已知 identity 都 bump。
6. `revoke({ workspaceIdentity, hookDeclarationDigests })`：digest 去重；删除记录并记入撤销集合；
   bump 该 identity 并返回新 revision。
7. `evaluateSnapshot({ snapshot })` 返回 `{ workspaceIdentity, bundleDigest, policy,
securityRevision, storeStatus, reasonCode?, items }`；`items` 由 B12 逐条求值；
   `reasonCode` 优先取策略解析失败原因，其次在 store 为 `corrupt` 时取
   `workspace_hooks_trust_store_corrupt`；`securityRevision` 为该 identity 当前值。
8. 策略提供者抛错或返回非法策略 → fail-closed：`{ mode: "deny",
reason: "Workspace Hook policy provider unavailable", policyRevision: "provider-error:fail-closed" }`
   且 `reasonCode = "workspace_hooks_blocked_by_policy"`。
9. `canMutatePersistentTrust(identity)` 仅 `mode === "user_decides"` 为 true；
   `assertPersistentTrustMutationAllowed(identity)` 在其他模式抛错，信息含模式名。
10. 策略订阅在构造时建立：默认策略变更后，后续 `getPolicy` 反映新默认值。

## B12 单条信任求值（`workspace-hook-trust-evaluation`）

trustState 判定顺序（第一条命中即用）：

| 序号 | 条件                                                  | trustState           |
| ---- | ----------------------------------------------------- | -------------------- |
| 1    | 策略 `mode === "deny"`                                | `blocked_policy`     |
| 2    | store 状态 `corrupt`                                  | `blocked_untrusted`  |
| 3    | 策略 `mode === "allow_trusted_only"` 且无匹配持久记录 | `blocked_policy`     |
| 4    | 有匹配持久记录（identity 与 digest 都相同）           | `trusted_persistent` |
| 5    | 该 key 在撤销集合中                                   | `revoked`            |
| 6    | 存在"同槽位"的旧记录                                  | `stale_digest`       |
| 7    | 其他                                                  | `pending_trust`      |

1. "同槽位"（用于 `stale_digest`）= 同 workspace、digest 不同，记录带
   `sourceDiscoveryOrderAtGrant`/`matcherIndexAtGrant`/`hookIndexAtGrant`，
   且 `eventAtGrant`、`sourcePathAtGrant`、`sourceDiscoveryOrderAtGrant`（对当前 source 的
   `discoveryOrder`）、`matcherAtGrant`、`matcherIndexAtGrant`、`hookIndexAtGrant` 与当前条目全等；
   缺字段的记录不参与判断。
2. 输出按 `workspaceHookEffectiveStateSchema` 校验并通过，字段：`reviewItemId`、
   `sourceRootEnabled`、`declarationEnabled`、`runtimeHooksEnabled`、`configuredEnabled`、
   `editable`、`trustState`、`admissionClass`（由 `WORKSPACE_HOOK_STATE_ADMISSION_MAP` 映射）、
   `effectiveRunnable`、`workspaceIdentity`、`bundleDigest`、`hookDeclarationDigest`、
   `sourcePaths`（`sourceFiles[sourceFileIndex].canonicalPath`，缺失回退 `sourceRelativePath`）、
   `reasonCode`。
3. `effectiveRunnable = admissionClass === "admitted" && configuredEnabled && policy.mode !== "deny"`。
4. 纯函数：不修改入参快照或记录。

## B13 审核流程注册表（`workspace-hook-review-flow`）

1. `open(request)`：入参按 `workspaceHookReviewRequestPayloadSchema` 校验。
   同 session 已有 `pending` 流程时：
   - 同一代（`reviewFlowId`、`generation`、`interactionId`、`bundleDigest` 全等）
     → 返回**同一个** flow 对象（引用相等）；
   - 不同代 → 抛错（必须显式 supersede）。
2. 新流程 `state.state = "pending"`，`result` 为 Promise；到 `deadlineAt` 自动结算为 `timed_out`，
   `outcome = { action: "no_change", reviewItemIds: [], reasonCode: "workspace_hooks_interaction_timeout" }`；
   `deadlineAt` 已过 → 立即结算；计时器不阻止进程退出。
3. `supersede(target, replacement)`：
   - 无当前流程或 target 的 `reviewFlowId`/`generation`/`interactionId` 不匹配 → 抛错；
   - 替换必须同 session、同 `reviewFlowId`、`generation` **严格递增**，否则抛错；
   - 旧流程立即结算 `superseded`（`state.supersededByInteractionId` = 新 interactionId，
     `outcome = { action: "no_change", reviewItemIds: [],
reasonCode: "workspace_hooks_review_superseded" }`），随后注册新流程并返回。
4. `validate(target, decision)`：
   - 无流程 / 代不匹配 / 状态非 pending → `{ accepted: false, reasonCode: "workspace_hooks_review_superseded" }`
   - `sessionId`、`taskId`、`runId`、`remoteSessionId`、`workspaceIdentity`、`bundleDigest`
     任一与请求不一致 → `{ accepted: false, reasonCode: "workspace_hooks_snapshot_mismatch" }`
   - decision 含请求 items 之外的 reviewItemId → 同上 snapshot_mismatch
   - decision 先按 `workspaceHookReviewDecisionSchema` 校验（非法抛错）
   - 通过 → `{ accepted: true, reviewItemIds }`（去重，保持首次出现顺序）
5. `resolve(target, decision)`：validate 通过 → 结算 `resolved`，
   `outcome.action = decision.action`，返回同一 validation；不通过 → 不改状态并返回负结果。
6. `fail(target, reasonCode)`：代与快照都匹配且 pending → 结算 `cancelled`，
   `outcome = { action: "no_change", reviewItemIds: [], reasonCode }`，返回 true；
   否则返回 false 且状态不变。
7. `closeWithoutDecision(target)`：条件同 6，结算 `resolved`，
   `outcome = { action: "no_change", reviewItemIds: [], reasonCode: undefined }`，返回 true；否则 false。
8. 结算幂等：仅 pending 结算一次；重复调用与超时竞态不得二次 resolve。
9. `getCurrentFlow(sessionId)` 返回当前公开 flow；`getCurrent(sessionId)` 返回状态副本，
   修改返回值不影响内部状态；未知 session → `undefined`。
10. flow 的 `state` getter 每次返回新对象；`request` 与 `result` 为同一引用。

## B14 运行时准入（`workspace-hook-runtime-admission`）

1. 构造：索引快照 `reviewItemId → hookDeclarationDigest`；默认 `enabled = true`。
2. `activate(source, signal?)`：
   - `signal` 已 abort → 立即以该 reason 抛错；
   - `enabled === false`：仅一次 telemetry `workspace_hook.feature_disabled`
     （`reasonCode = "workspace_hooks_feature_disabled"`），并回调一次 admission state（pendingCount 0），返回；
   - 首次 activate 等待 `ready`：等待中 abort → 抛 abort reason；`ready` reject →
     `bootstrapFailed = true`（不抛，后续 dispatch 全部拒绝）；
   - 之后刷新评估（评估抛错 → `bootstrapFailed = true`，fail-closed）并回调 admission state；
   - 重复 activate 不重复等待 `ready`，但仍刷新并回调。
3. `evaluateDispatch({ bundleDigest?, hookDeclarationDigest, reviewItemId })` 判定顺序：
   1. 快照不匹配（提供了 `bundleDigest` 且不等；或 `reviewItemId` 的 digest 与索引不一致）
      → `{ allowed: false, reasonCode: "workspace_hooks_snapshot_mismatch" }`（telemetry 去重上报）；
   2. 已 `invalidate` → 拒绝该 reasonCode；
   3. 未 activate → `workspace_hooks_pending_trust`；
   4. `enabled === false` → `workspace_hooks_feature_disabled`；
   5. `bootstrapFailed` → `workspace_hooks_trust_store_corrupt`（telemetry 去重上报）；
   6. 校验 revision 不一致 → 重新评估并**重发** admission state（pendingCount 为 0 也要发）；
   7. 找不到 item 或 digest 不一致 → `workspace_hooks_snapshot_mismatch`；
   8. `effectiveRunnable` → `{ allowed: true }`；
   9. 否则拒绝，`reasonCode = item.reasonCode ?? "workspace_hooks_blocked_untrusted"`，
      `configuredEnabled === false` 时额外 `skipLifecycle: true`；策略拒绝时 telemetry
      去重上报 `workspace_hook.policy_blocked`。
4. `replaceSnapshot(snapshot)`：`workspaceIdentity` 与当前不同 → **抛错**且状态不变（跨 workspace
   替换是编程错误）；相同 → 替换快照、重建索引、清空评估与失效标记；已 activate 时立即重评估并回调。
5. `invalidate(reasonCode)`：记录原因并清空评估/校验；之后 dispatch 一律按该原因拒绝。
6. `getCurrentSnapshot()` 返回当前快照引用。
7. admission state 回调：`{ pendingCount, bundleDigest, workspaceIdentity? }`，
   `pendingCount` = 已评估时 `configuredEnabled && admissionClass === "pending"` 的条数，未评估时为 0。
8. telemetry 去重键 = `event:reasonCode:bundleDigest:declarationDigest:source`，同一键只发一次。

## B15 telemetry 脱敏（`workspace-hook-telemetry`）

1. 无 `logger` → 不做任何事（不抛错）。
2. 输出 `logger.info("Workspace Hook Trust telemetry", {...})`，固定 `module: "workspace_hook_trust"`，
   并带 `event`。
3. `workspaceIdentity` 只以 SHA-256 十六进制前 12 位出现（`workspaceIdentityDigest`）；
   `bundleDigest`、`declarationDigest` 只取前 12 字符（`digestSummary`）。
4. 允许字段：`reasonCode`、`source`、`action`、`generation`、`errorMessage`（截断 300 字符）、
   `requestItemCount`、`requestEnabledCount`、`grantedRecordCount`、`revokedCount`；
   未提供的可选字段不出现。
5. 不得出现命令、脚本内容、source path 或 Trust payload；`errorMessage` 只承载领域错误短消息。
6. `digestSummary`：长度 ≤ 12 原样返回，否则前 12 字符。
7. `workspaceIdentitySummary`：SHA-256 十六进制前 12 位；同一输入稳定。

## B16 信任记录创建（`workspace-hook-trust-records`）

1. `reviewItemIds` 先去重，保持首次出现顺序。
2. 未知 reviewItemId → 抛 `Unknown Workspace Hook review item: <id>`；
   条目存在但缺 source file → 抛 `Workspace Hook source is missing for <id>`。
3. 生成记录按 `workspaceHookTrustRecordSchema` 校验，字段：`workspaceIdentity`、
   `hookDeclarationDigest`、`digestAlgorithm: "sha256"`、`decision: "trusted"`、`grantedAt`、
   `bundleDigestAtGrant`、`eventAtGrant`、`displayCommandAtGrant`
   （`process` 类型 = `command + " " + args.join(" ")`；`command` 类型 = `command`）、
   `sourcePathAtGrant`、`sourceDiscoveryOrderAtGrant`（取 source 的 `discoveryOrder`）、
   `matcherAtGrant`、`matcherIndexAtGrant`、`hookIndexAtGrant`、`appVersionAtGrant?`（有则带）。
4. 纯函数：不修改快照。

## B17 session mailbox Hook 登记项（`session-mailbox`）

1. 返回 3 个登记项，事件为 `UserPromptSubmit`、`PostToolUse`、`Stop`，共用同一回调实现；
   每个登记项 descriptor 固定：`clientVisible: false`、`commandDisplay: "Session mailbox"`、
   `executionMode: "foreground"`、`executionType: "process"`、`sourceKind: "internal"`、
   `timeoutMs: 60000`；`source = "builtin.sessionMailbox.drain"`；无 matcher。
2. 回调每次调用 `mailbox.drainUnread({ sessionId, limit: 20 }, { signal })`；
   明确传 `sessionId` 与 `limit = 20`，并把 `context.signal` 作为取消信号。
3. 未读到消息 → 返回 `undefined`。
4. `PostToolUse` 且提供 `enqueuePendingInput`：对**每条**消息单独
   `enqueuePendingInput(format([message]), { sessionId, traceId, turnId })`，
   随后返回 `undefined`（不产生 additionalContext）。
5. 其他情况：把全部消息格式化成一个 `additionalContext`，返回
   `{ ...(Stop ? { continue: true } : {}), hookSpecificOutput: { additionalContext, hookEventName } }`。
6. 消息格式：`<session-message source="mailbox" message_id="..." from_session="..." created_at="...">`
   - 固定一行 `For reference only. Verify against raw source before acting.` + 空行 + 正文 +
     `</session-message>`；多条之间空行分隔；属性值转义 `&`→`&amp;`、`"`→`&quot;`、`<`→`&lt;`。

## B18 公开入口与类型面（`index`、`types`、`workspace-hook-trust-domain`）

1. `apps/cli/packages/core/src/hooks/index.ts` 必须导出 interface.md 第二节列出的全部 44 个名字
   （函数/类/类型），且 `@knorvia/core` 的 `src/index.ts` 继续以 `export * from "./hooks/index.js"` 引出。
2. `hooks/workspace-hook-runtime-admission.ts` 必须继续导出 `WorkspaceHookRuntimeAdmissionPort`
   （`core/src/runtime/{agent-runtime,internal,types}.ts` 按该路径导入该类型）。
3. `HookRunResult`、`HookRunner`、`HookRegistration`、`HookRunOptions`、`InMemoryHookRunner`
   的名字与结构（字段名、可选性）不可变；`HookCallbackContext.hookIndex` 语义见附录 A.4。
4. `types.ts` 的类型不得引入新的必填字段（调用方按可选性构造对象）。

## B19 平台与资源边界（16 个继承文件共同）

1. 除 B1 的临时目录外不做文件 IO；临时目录必须被 `cleanup()` 删除，失败路径同样删除。
2. 路径与临时目录通过 `node:os` / `node:path` 取得，不硬编码分隔符或目录；Windows 与 POSIX 行为一致。
3. 只用 `setTimeout`/`clearTimeout` 与 `AbortController`；非必要不注册进程级监听；计时器不阻止退出。
4. 日志级别：准入 fail-closed、Hook 失败与背景失败用 `warn`；trust telemetry 用 `info`；
   错误路径不记录命令正文、脚本内容或真实 workspace 路径（B15）。
5. 不读取 `process.env`（除 Node 自身的 `os.tmpdir()`），不写 stdout/stderr。

## 附录 A：不在本包测试范围的行为（10 个已独立候选文件拥有）

以下行为在本目录内、但不属于 16 个继承文件，按 AGENTS.md「不重复改已独立候选」保留现状；
它们**不进入** `tests/`，因此 stubs 替换后不会因为这些行为而漏测：

1. A.1 matcher 语义（字面量候选 `a|b`、`"*"`、非法正则不匹配）—— `output.ts`。
2. A.2 登记项成员在单次 run 内固定、运行器 `register()` 语义 —— `runner.ts`。
3. A.3 准入 fail-closed（`admission` 抛错 → 拒绝 + warn）、发布前/发布后两次求值 ——
   `runner-helpers.ts`、`runner-program.ts`。
4. A.4 生命周期事件序列（Started/Completed/Blocked/Failed）、`hookIndex`/`hookCount`/
   `hookInvocationId`/`hookRunId` 语义 —— `runner-program.ts`、`runner-lifecycle.ts`、`runner-plan.ts`。
5. A.5 超时与取消（单条 `timeoutMs ?? defaultTimeoutMs`、`ToolTimeout`/`ToolCancelled`、
   `AbortSignal` 联结、结算唯一性）—— `runner-callback.ts`、`runner-helpers.ts`。
6. A.6 async 登记项背景执行与背景补发失败日志 —— `runner-program.ts`、`runner-driver.ts`。
7. A.7 多次结果合并规则（上下文追加、粘性字段、权限强度、拒绝不可撤销）—— `output-reduction.ts`。
8. A.8 JSON 输出投影与事件策略、`hookSpecificOutput.hookEventName` 校验、
   PreToolUse 收尾不变式 —— `output-projection.ts`。
9. A.9 阻断报告与诊断字段（`completionReport`、`failureReport`、`eventFor`）——
   `runner-lifecycle.ts`。

以上行为在实现替换 PR 的验收中仍受两道相似度门槛与现有测试约束；本合同的契约测试只验收
B1..B19。

## 附录 B：复用的既有规格（行为依据，不是实现模板）

计划书《各区域难点与做法 / CLI》要求优先复用 `specs/` 里以前独立替换留下的规格。本合同的
以下条目直接引用它们已经确定的行为与不变量，合同与这些规格冲突时以本合同的 B 编号为准并在
`known-differences.md` 记录：

| 本合同条目         | 引用的规格与条款                                                                                                   | 引用内容                                                                                                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B7、B8、B9         | `specs/knorvia-tool-hook-boundary.md`「必须保持」                                                                  | 无 Hook runner 时惰性返回、runtime receiver 与别名匹配、保持原输入/输出引用与异常原值；工具执行链读取的是纯结果投影，不在本层再仲裁多个结果                                                                                |
| B5、B6、B7         | `specs/knorvia-tool-hook-boundary.md`「设计与所有者」                                                              | 权限计划收口一次；本模块不新增审批状态、不新增 Requested 事件                                                                                                                                                              |
| B1、B2             | `specs/knorvia-shared-authority-settings-hook-owners-20261003.md`                                                  | 设置与权限所有者边界：插件/hook 只读配置与环境，不改写存储所有者                                                                                                                                                           |
| B10、B11、B12、B16 | `specs/knorvia-workspace-hook-trust-storage.md`「范围与结构」「记录与调用时机」「路径与文件合同」                  | Trust 记录的 schema 与字段由既有 contracts 提供，本模块不复制 schema、不加数据库/缓存/授权规则、**不执行信任记录中的命令**；store 的 `missing`/`ok`/`corrupt` 三态与"损坏时不得泄露部分授权"由存储侧保证，本模块只消费状态 |
| B12                | `apps/cli/packages/contracts/src/hooks/workspace-hook-trust.ts`                                                    | `WORKSPACE_HOOK_STATE_ADMISSION_MAP` 与 `workspaceHookEffectiveStateSchema` 是唯一判定表与形状来源                                                                                                                         |
| B13                | `specs/knorvia-workspace-hook-trust-storage.md`、`specs/knorvia-shared-authority-settings-hook-owners-20261003.md` | 审批流程的交互与持久化所有者不在本模块：注册表只持有当前代与结算，不持久化、不做 UI                                                                                                                                        |
| B18                | `specs/knorvia-independent-implementation.md`                                                                      | 来源与复核规则：本合同与契约测试按该规格登记与验收                                                                                                                                                                         |
| 附录 A             | `specs/knorvia-hook-runner-lifecycle.md`、`specs/knorvia-hook-output-reduction.md`                                 | 运行器生命周期与输出投影/累积的先行规格；那批文件已登记 `independent-replacement`，本包不重复改，仅在替换 PR 里保持调用方合同                                                                                              |
