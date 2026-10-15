# core-tool-handlers-workflow-runs-01 行为条目（behavior.md）

版本 v1。本包 = `apps/cli/packages/core/src/tool/handlers` 下 **工作流运行/发现 11 个继承文件**。行为用**自己的话**写，不贴旧代码。编号族在本包内唯一，发布后不重用：

| 族        | 覆盖                                                     | 文件                                   |
| --------- | -------------------------------------------------------- | -------------------------------------- |
| B-gw-1..8 | 单 run 快照：端口门、投影、缺席语义、一次读数            | `get-workflow-run.ts`                  |
| B-gs-1..5 | 确定性 `<summary>`（贡献表、预算裁句、不知道就不说）     | `get-workflow-run-summary.ts`          |
| B-gr-1..4 | 端口视图 → 契约投影（phases/subagents/ask/wait/health）  | `get-workflow-run-roster-output.ts`    |
| B-gf-1..7 | GetWorkflowRun 模型面骨架与 routing 文案                 | `get-workflow-run-format.ts`           |
| B-gt-1..5 | 情势三块 `<health>/<phases>/<subagents>` 与 `<log_tail>` | `get-workflow-run-format-roster.ts`    |
| B-ga-1..3 | 花名册活动行（按相位分叉）                               | `get-workflow-run-activity-program.ts` |
| B-lr-1..3 | ListWorkflowRuns 列表与单行属性式模型面                  | `list-workflow-runs.ts`                |
| B-ls-1..3 | ListSavedWorkflows 定义清单与块式模型面                  | `list-saved-workflows.ts`              |
| B-lm-1..2 | ListModels 公开声明面                                    | `list-models.ts`                       |
| B-rw-1..7 | ResumeWorkflowRun 恢复入口与失败码表                     | `resume-workflow-run.ts`               |
| B-qs-1..5 | ResolveWorkflowQuestion 应答入口与 message 透传          | `resolve-workflow-question.ts`         |
| B-tp-1..6 | 六个工具入口的元数据/权限/预算/trace 恒等                | 六个入口文件                           |

**通用字段（纯投影/格式簇共用）**：B-gs/gr/gf/gt/ga-\*, B-lr-2、B-ls-2、B-lm-2 是纯函数或常量面——无状态所有者、无 IO、幂等、并发安全、无资源释放、不写日志；输入是契约形状（`GetWorkflowRunOutput` 等），输出是字符串/投影对象。逐条只写**特有**字段（文案逐字、缺席语义、预算常量），共用字段不重复。

**通用字段（工具生命周期簇共用）**：B-gw-1..8、B-lr-1/3、B-ls-1/3、B-lm-1、B-rw-_、B-qs-_ 运行在 executor 的 `validateInput → resolveInput → prepareApproval → handler` 生命周期上：状态所有者是调用方（executor / run service 端口），本包不藏全局状态；运行读写全走 `context.dynamicWorkflowRunPort` 端口（事件序列断言：端口替身记录调用序列，**gate 握手**控制 resolve 时机，无 sleep、无固定超时）；不写日志（工具层日志由 executor 统一记录）。失败一律**结构化** `{result:false, errorCode, message}`（throw 只留给接线故障）；`errorCode` 数值只是日志位，**判别键是 message 前缀**。

**语义常量总表**（逐条引用本表，不再重复取值）：

| 常量                                                                      | 值                                                                                                                                     | 用在           |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `GET_WORKFLOW_RUN_TIMEOUT_MS`                                             | 10_000                                                                                                                                 | B-tp-1         |
| `LIST_*_TIMEOUT_MS`（三个列表）                                           | 10_000                                                                                                                                 | B-tp-2/3/4     |
| `RESUME_WORKFLOW_RUN_TIMEOUT_MS` / `RESOLVE_WORKFLOW_QUESTION_TIMEOUT_MS` | 15_000                                                                                                                                 | B-tp-5/6       |
| `GET_WORKFLOW_RUN_RESULT_BUDGET_BYTES`                                    | 400_000（= `maxInlineBytes`/`maxModelBytes`/preview，strategy `artifact`，retention `session`）                                        | B-tp-1         |
| `GET_WORKFLOW_RUN_PERSIST_THRESHOLD_CHARS`                                | 100_000（= `maxModelChars`）                                                                                                           | B-tp-1         |
| `*_MODEL_BYTES`（三列表 + resume + resolve）                              | 24_000（strategy `truncate`，preview `head`）                                                                                          | B-tp-2..6      |
| `GET_WORKFLOW_RUN_ROSTER_LIMITS.maxPhases` / `.maxSubagents`              | 契约面常量（`@knorvia/contracts`）                                                                                                     | B-gr-1/2       |
| `WORKFLOW_ARTIFACTS_INTROSPECTION_MAX_LINES`                              | 契约面常量（`../executor/workflow-published-artifacts`，与 `ARTIFACT_CAPS.maxArtifactsPerRun` 同值）                                   | B-gw-6         |
| `GET_WORKFLOW_RUN_SUMMARY_MAX_CHARS`                                      | 契约面常量（`@knorvia/contracts`）                                                                                                     | B-gs-2         |
| `SUMMARY_ELLIPSIS` / `SUMMARY_SEPARATOR`                                  | `"…"` / `" "`                                                                                                                          | B-gs-2         |
| `TERMINAL_STATUSES`                                                       | `{"completed","errored","stopped"}`                                                                                                    | B-gs-1、B-gt-1 |
| `COLUMN_GAP` / `MAX_COLUMN_WIDTH` / `TASK_LINE_INDENT`                    | `"  "` / 24 / `"  "`                                                                                                                   | B-gt-2/3/4     |
| resume 失败码表                                                           | `RESUME_UNAVAILABLE:11, NOT_RESUMABLE:12, ALREADY_RUNNING:13, SCRIPT_MISSING:14, SCRIPT_MISMATCH:15, SUPERSEDED:16, COMPILE_FAILED:17` | B-rw-3..7      |
| resolve 失败码表                                                          | `ANSWERING_UNAVAILABLE:21, UNKNOWN_QUESTION:22, ALREADY_RESOLVED:23, RUN_NOT_IN_FLIGHT:24`                                             | B-qs-2..5      |
| 内省失败码                                                                | 复用 `workflow-run-introspection` 的 RUN_NOT_FOUND（1/2），同键同码同 message                                                          | B-gw-2、B-rw-4 |

---

## 单 run 快照（B-gw-1..8）

- **B-gw-1 端口门（typeof 探测）**：输入任意合法入参；`context.dynamicWorkflowRunPort` 缺席或 `getRunDetail` 非函数 → 返回 `workflowIntrospectionUnavailableFailure()` 定型失败（内省表码），**不**抛错、不静默降级；端口在场才继续。时序：探测先于任何端口调用（事件序列断言：0 次 `getRunDetail`）。测试 `get-workflow-run.test.ts` B-gw-1。
- **B-gw-2 未知 runId**：`getRunDetail(run_id)` 回 `undefined` → `workflowRunNotFoundFailure(run_id)`（**同键同码同 message** 于内省表 RUN_NOT_FOUND；空对象不算未知，不能拿 `??` 兜成空快照）。时序：恰好一次 `getRunDetail`。测试 B-gw-2。
- **B-gw-3 产物序列化三态**：`detail.result === undefined` → 输出 `result` 字段**整字段缺席**（与完成通知同规）；`null` 是合法产物 → `result: "null"`；对象/数组 → `serializeWorkflowArtifact`（`../executor/workflow-artifact`）的文本投影。测试 B-gw-3。
- **B-gw-4 一次读数**：`generatedAt = Date.now()` 在 handler 内**取一次**；同一输出里 `createdAt`/`updatedAt`/`lastProgressAt`/`askedAt` 等一切相对年龄都对它计算（格式器因此纯函数，两个年龄永远可比）。测试以钉住时钟断言两个年龄共用同一 now（事件序列断言 + 时钟替身）。测试 B-gw-4。
- **B-gw-5 字段投影缺席语义**：`phases` 空/缺席 → 字段缺席；`subagents` 投影 + `subagentsTruncated` 仅在截断时以 `true` 出现（「truthy 才写」）；`health` 恒在（B-gr-4）；`error`/`result` 仅在定义时出现；`pendingQuestions` **零条时整字段缺席**（空数组读起来像「问过已答完」，缺席才是「没人在等」）。测试 B-gw-5。
- **B-gw-6 用户面产物**：`artifacts` 零条 → 字段缺席；有则 `slice(0, WORKFLOW_ARTIFACTS_INTROSPECTION_MAX_LINES)`（32，与 `ARTIFACT_CAPS.maxArtifactsPerRun` 同值）投影 `projectWorkflowRunArtifact`（`bytes` 取最新版那条）。测试 B-gw-6。
- **B-gw-7 摘要最后拼**：`summary = buildWorkflowRunSummary(base)` 读的就是上面已铸出的字段（先有事实再有那一句）；返回 `{...base, summary}` 满足 `GetWorkflowRunOutputSchema`。测试 B-gw-7。
- **B-gw-8 usage 行事实**：`usage` 五值（spentTokens/nodesObserved/nodesRunning/nodesCompleted/nodesFailed）原样来自端口投影；`nodesObserved` 是已落库节点行数，绝不冒充「总步数」。测试 B-gw-8。

## 确定性 summary（B-gs-1..5）

- **B-gs-1 贡献表与骨架必保**：七条贡献按序读取（status+phase、steps 为 **required**，failure/questions/progress/deliverable/ownership 可选）；`TERMINAL_STATUSES`（completed/errored/stopped）决定终态措辞；同一快照永远拼出同一句（确定性，无模型参与）。测试 `get-workflow-run.test.ts` B-gs-1。
- **B-gs-2 预算裁句**：整句先 `join(" ")` 求长（保留该失败点，见源注「独立极限探针」），超出 `GET_WORKFLOW_RUN_SUMMARY_MAX_CHARS` 时**从尾部整句丢**（丢到 required 句为止），仍超才切片补 `"…"`（省略号占一字符）。测试 B-gs-2。
- **B-gs-3 不知道就不说**：无时间戳不给年龄；无阶段不提阶段位置（脚本无阶段整句缺席）；终态 run 不说「在第几个阶段」（只说共几个）；停驻表未知（`pendingQuestionsKnown:false`）时该句明说不知道。测试 B-gs-3。
- **B-gs-4 花名册划分不变式**：活相位（executing/waiting/parked）子代理名下恰有一条 `running` ask 行，三个相位计数是 `usage.nodesRunning` 的**划分**（加和相等）；对不上即数据不合法（金样与测试数据必须自洽）。测试 B-gs-4。
- **B-gs-5 交付物句与归属句**：completed 且有 primary 产物 → 指向那一件（标题**不加引号**，避免转义表把 `"` 变 `&quot;`）；非本会话拥有的 run → 首句写明归属（通知不会来、TaskOutput 看不到）。测试 B-gs-5。

## 端口视图投影（B-gr-1..4）

- **B-gr-1 phases 投影**：`undefined`/空 → `undefined`（字段缺席）；否则 `slice(0, GET_WORKFLOW_RUN_ROSTER_LIMITS.maxPhases)` 逐项投影（name/state/rounds/nodesSettled/nodesRunning 必留；enteredAt/exitedAt **仅在定义时**展开为键，缺席不造 `undefined` 键）。测试 B-gr-1。
- **B-gr-2 subagents 投影**：`slice(0, GET_WORKFLOW_RUN_ROSTER_LIMITS.maxSubagents)`；`truncated = projected.length < subagents.length`；ask 投影（siteId/ordinal 必留；actorSeq/instructionsHead/startedAt/turn/toolCalls 可选；lastTool 仅在定义时给 `{name, target?, at?}`）；wait 投影（cause 必留，reason/retryAfterMs/since 可选）；匿名 actor 不合成兜底名。测试 B-gr-2。
- **B-gr-3 health 投影**：`concurrency` 仅在定义时包 `{effective, cap, reason?, since?}`；`leftoverRunning` 仅在**非 0** 时出现；`pendingQuestionsKnown`、`consecutiveFailures`、`cachedSteps` 必留。测试 B-gr-3。
- **B-gr-4 纯投影契约**：三函数无副作用、同输入同输出、不抛错（输入缺字段按缺席处理）。测试 B-gr-4。

## 模型面骨架（B-gf-1..7）

- **B-gf-1 输出失效兜底**：`GetWorkflowRunOutputSchema.safeParse` 失败 → 精确返回 `"GetWorkflowRun returned an invalid result."`（一整句，无块）。测试 `get-workflow-run-format.test.ts` B-gf-1。
- **B-gf-2 块序**：`<summary> → <run_id> → <label source=…> → <status> → [<stop_reason>] → [<resumed_from>] → [<max_concurrency>] → [<subagent_model>] → [<superseded_by>] → <owned_by_this_session> → [<possibly_interrupted>] → <created_at> → <updated_at> → [<pending_questions>] → <health> → [<phases>] → <subagents> → <log_tail> → <usage> → [<result>] → [<error>] → [<artifacts>] → routing 块`，块间 `\n\n`。方括号块仅在对应字段在场时出现。测试 B-gf-2。
- **B-gf-3 转义与属性**：文本内容走 `escapeWorkflowRunText`；属性位走 `workflowRunAttribute(key, value)`；`<label source="…">` 属性名 `source`；`<error code="…">` 属性名 `code`。测试 B-gf-3。
- **B-gf-4 pending_questions 三态**：`health.pendingQuestionsKnown === false` → 未知段**逐字**（"Unknown: pending questions are tracked only by the process that owns the run, …"）；已知且零条 → 块缺席；已知非零 → 逐问题行（`[qid] who asked at|asked <age>`、question、`context:` 可选）+ 引导句**逐字**（"Answer one with ResolveWorkflowQuestion …"）。测试 B-gf-4。
- **B-gf-5 usage 与 result/error 标签**：`<usage>spent_tokens=… nodes_observed=… nodes_running=… nodes_completed=… nodes_failed=…</usage>`（键序固定、空格分隔）；`<result>\n…\n</result>`（原样文本）；`<error code="…">` 正文：无 providerStop 时转义 message，有则 `formatWorkflowProviderStopError`（`../../runtime-task/notification`）整段。测试 B-gf-5。
- **B-gf-6 artifacts 块**：`<artifacts count="N">` 逐行走 `formatPublishedArtifactLine`（`../executor/workflow-published-artifacts`）后转义。测试 B-gf-6。
- **B-gf-7 routing 文案**：`stopReason === "superseded"` → `<superseded>` 块（successor 引用两态）；`status === "stopped"` → `<resumable>` 块 + 各 stop reason 的附句（user/model/provider 三段逐字）；`<amendable>` 块四段（修订引导、热缓存说明、只改设置说明、按状态分的第四段——running 未停滞 / errored / completed / stopped / 仍在跑 各自逐字）+ 可选 scriptPath 段。测试 B-gf-7。

## 情势三块与 log_tail（B-gt-1..5）

- **B-gt-1 `<health>` 行**：`last_progress=<age>`（有时间戳才写）、`concurrency=e/c (reason since <age>)`（括号段按有无拼）、`stalled=no|since <age>`（**仅非终态**写）、`consecutive_failures=N`、`cached_steps=N`；终态且 `leftoverRunning>0` → 追加 leftover 说明（单复数两形，逐字）。测试 B-gt-1。
- **B-gt-2 `<phases>` 表**：声明序一行一阶段；列为「序号+名字（`columnWidth=min(24,max)` 对齐）/状态/rounds（0 不写、1 单数）/settled+running|unfinished 或 steps settled/时长（exited-entered 或 `so far`；**终态不写 so far**）」；空段消失不留双间隔，行尾 trim。测试 B-gt-2。
- **B-gt-3 `<subagents>` 表**：一行一子代理（名字（匿名留白）/地址 `site@ordinal`/状态/`phase X`（可选）/活动行（B-ga-\*）/`N tokens`（>0 才写））；`instructionsHead` 在场 → 追加两空格缩进的 `task: <head>` 行；`subagentsTruncated` → 尾注**逐字**（"Only the first N subagents are listed; …"）；零子代理 → `<subagents>No subagents created yet.</subagents>`。测试 B-gt-3。
- **B-gt-4 `<log_tail>`**：逐行 `[sequence] <age>? <message>`（`at` 缺席则无年龄段）；零行 → `<log_tail>No log() narration recorded yet.</log_tail>`。测试 B-gt-4。
- **B-gt-5 `phaseColumnWidth` 求值序**：`Math.min` getter 先于 `reduce` 读取——冻结反例证明抛错前不应调用 `Math.max`（求值序是契约的一部分）。测试 B-gt-5。

## 活动行（B-ga-1..3）

- **B-ga-1 parked/waiting 分叉**：`parked` 且有 `parkedOn` → `on question <qid>[ for <dur>]`（年龄去 ` ago` 后缀）；`waiting` 无 wait → 空串；wait `cause:"slot"` → `waiting for a slot[ for <dur>]`；否则 `backoff[ after <reason>][ for <dur>][, retry in <dur>]`。测试 B-ga-1。
- **B-ga-2 ask 详情分叉**：`unfinished` 且有 ask → `<site@ordinal[ (step N)]> was in flight at the stop`；其余有 ask → `askLabel[, <dur> on this step][, turn N][, N tool call(s)][, last <tool>[ <target>][ <age>]]`（toolCalls 单复数）。测试 B-ga-2。
- **B-ga-3 步数兜底**：无 ask 且 `stepsSettled===0 && stepsFailed===0` → 空串；否则 `N step(s)[, N failed]`。测试 B-ga-3。

## ListWorkflowRuns（B-lr-1..3）

- **B-lr-1 handler 三件事**：取端口操作（`createListWorkflowRunsOperation`，original 面）、cwd 钉成本会话 `context.workingDirectory`、结果投影契约形状；输入 schema 解析失败由 executor 生命周期截住。事件序列断言：操作构造先于调用。测试 `lists.test.ts` B-lr-1。
- **B-lr-2 单行属性式模型面**：失效兜底句 `"ListWorkflowRuns returned an invalid result."`；空列表 → `<workflow_runs count="0" [truncated]>\nNo workflow runs recorded for this project.\n</workflow_runs>`；有则 header `count="N"`（truncated 时加 `truncated="true"`）+ 一 run 一行 `<run id=… status=… [stop_reason=…] [resumed_from=…] [superseded_by=…] label=… label_source=… owned_by_this_session=… [possibly_interrupted="true"] spent_tokens=… created_at=… updated_at=… />`（属性序固定）。测试 B-lr-2。
- **B-lr-3 时间戳格式**：`created_at`/`updated_at` 走 `formatWorkflowRunTimestamp`（内省基件）。测试 B-lr-3。

## ListSavedWorkflows（B-ls-1..3）

- **B-ls-1 handler**：`ListSavedWorkflowsInputSchema.parse` → `listSavedWorkflows({cwd: context.workingDirectory ?? "."})`（**恒取本会话工作目录**，模型无权跨项目扫盘——`sideEffectScope:"none"` 的前提）；`invalid` 仅在非空时出现在输出（为空时缺席，不挂噪音字段）。测试 `lists.test.ts` B-ls-1。
- **B-ls-2 空清单句**：`workflows` 空且无 `invalid` → `<saved_workflows count="0">\nNo workflows are saved in this project yet. Saved definitions live in <SAVED_WORKFLOW_PROJECT_DIR>/.\n</saved_workflows>`（目录名来自契约常量）。测试 B-ls-2。
- **B-ls-3 属性转义**：名字与路径进属性位前 `escapeAttribute`（`&`→`&amp;`、`"`→`&quot;`、`<`→`&lt;`）——不转义会造出畸形标签。测试 B-ls-3。

## ListModels（B-lm-1..2）

- **B-lm-1 转口恒等**：`handler === executeListModels`、`formatModelContent === renderListModels`（original 面 `list-models-projection.ts`，本包不重实现）；入参空对象，schema 面四件来自契约。测试 `lists.test.ts` B-lm-1。
- **B-lm-2 描述面**：`LIST_MODELS_DESCRIPTION` 四条要点逐字（id 粘贴规则 `$<level>`、不动会话模型、`[current]` 标记、`disabled` 行）。测试 B-lm-2。

## ResumeWorkflowRun（B-rw-1..7）

- **B-rw-1 端口门**：端口缺席或 `resume` 非函数 → `workflowResumeUnavailableFailure()`（码 11，message 前缀 `workflow_resume_unavailable:` 逐字）；**绝不静默降级**。时序：探测先于任何端口调用。测试 `resume-workflow-run.test.ts` B-rw-1。
- **B-rw-2 成功输出**：`port.resume(run_id)` 回 `{ok:true, runId}` → `{ok:true, runId, status:"backgrounded", backgroundTaskId: result.runId（**≡ runId**恒等式）, response: "The workflow run <id> has been resumed and is running in the background. …"}`（引导文案逐字：仍在跑、结果以通知回来、显式劝阻轮询）。时序：恰好一次 `resume`，输出同一次调用内完成（gate 握手，事件序列断言）。测试 B-rw-2。
- **B-rw-3 not_found 复用**：`result.reason === "not_found"` → `workflowRunNotFoundFailure(run_id)`（**同键同码同 message** 于内省表，不在本地表）。测试 B-rw-3。
- **B-rw-4 本地失败码表**：六 reason 定型（`compile_failed`→17、`not_resumable`→12、`superseded`→16、`already_running`→13、`script_missing`→14、`script_mismatch`→15）+ default→12 带原词 `(reason: X)`；各 message 判别键前缀逐字（`workflow_run_compile_failed:`/`workflow_run_not_resumable:`/`workflow_run_superseded:`/`workflow_run_already_running:`/`workflow_run_script_missing:`/`workflow_run_script_mismatch:`）；`detail` 参数仅 `compile_failed` 用（追加 `\n<detail>`）。测试 B-rw-4。
- **B-rw-5 码空间隔离**：本表 11–17 与内省表（1/2）**互相独立、禁止跨表比对**；`not_found` 复用内省表。判别键唯一权威是 message 前缀。测试 B-rw-5。
- **B-rw-6 恢复语义文案**：`RESUME_WORKFLOW_RUN_DESCRIPTION` 逐字（可恢复集 = `stopped`（除 `superseded`）、同 run ID 续跑、finished 步 replay 不耗 token、未完结重派发、errored/completed 不可恢复）。测试 B-rw-6。
- **B-rw-7 formatModelContent**：失效兜底句 `"ResumeWorkflowRun returned an invalid result."`；成功 → `output.response` 原样。测试 B-rw-7。

## ResolveWorkflowQuestion（B-qs-1..5）

- **B-qs-1 端口门**：端口缺席或 `resolveQuestion` 非函数 → `resolveQuestionUnavailableFailure()`（码 21，前缀 `workflow_question_answering_unavailable:` 逐字）；**绝不静默成功**（那会让 actor 永远等下去）。测试 `resolve-workflow-question.test.ts` B-qs-1。
- **B-qs-2 成功输出**：`port.resolveQuestion(question_id, answer)` 回 `{ok:true, qid}` → `{ok:true, qid, response: "Answer delivered for question <qid>. The subagent that asked has resumed its turn with your answer; the run keeps going as before."}`（逐字：送达 + run 不停）。时序：恰好一次 `resolveQuestion(question_id, answer)`，answer 原样传（gate 握手）。测试 B-qs-2。
- **B-qs-3 三 reason 码表**：`unknown_question`→22、`already_resolved`→23、`run_not_in_flight`→24；default→22 且 message 追加 ` (reason: X)`。测试 B-qs-3。
- **B-qs-4 message 原样透传**：三个拒绝分支的 message **一字不改**来自服务端（判别键与文案分开维护则两处迟早说不同的话）；本文件只挑 errorCode。测试 B-qs-4。
- **B-qs-5 formatModelContent**：失效兜底句 `"ResolveWorkflowQuestion returned an invalid result."`；成功 → `output.response` 原样。测试 B-qs-5。

## 工具入口恒等（B-tp-1..6）

逐条断言 `ToolEntry` 面的精确取值（语义常量总表 + 下列特有字段）；测试 `tool-entries.test.ts`。

- **B-tp-1 getWorkflowRunToolEntry**：`readOnly:true, destructive:false, concurrentSafe:true, sideEffectScope:"none", riskLevel:"low", needsApproval:false`；`timeout.kind:"timed"`（default=max=10s，`allowCallOverride:false`）；`resultBudget.strategy:"artifact"`、`artifact:{enabled:true, retention:"session"}`、preview 400k/`head`；`resultArtifactContentType:"text/plain"`；`maxModelChars:100_000`；`permission.permission:"getWorkflowRun"`、`patternSources:["toolName","input"]`、`alwaysAllowPatternSources:["toolName"]`、`denyPriority:"beforeAsk"`；`cancellation.supported:false, cleanup:"none"` + 用户可见文案**逐字**（"GetWorkflowRun reads the run journal synchronously and cannot be cancelled"）；`trace:{required:true, propagateToAdapters:false, recordInput:"summary", recordOutput:"summary"}`。
- **B-tp-2 listWorkflowRunsToolEntry**：同只读面；24k truncate/head；`patternSources:["toolName"]`（入参无路径主体）；**不继承 CreateWorkflow 的 alwaysAsk**（读状态不属于「执行整块代码」那道门）；取消文案逐字。
- **B-tp-3 listSavedWorkflowsToolEntry**：同 B-tp-2 档；取消文案逐字（"…scans the project's workflow directory synchronously…"）。
- **B-tp-4 listModelsToolEntry**：同 B-tp-2 档；取消文案逐字（"…reads the in-memory model catalog…"）。
- **B-tp-5 resumeWorkflowRunToolEntry**：`readOnly:false`（恢复=重启执行）、`needsApproval:false`（钉死在已批准脚本，scriptHash 重验在端口；拦截面仍在 PreToolUse deny 与项目 deny）；15s；24k；`permission.reason:"resumeWorkflowRun.runConfirmation: …"`；`patternSources:["toolName","input"]`（run_id 进模式面）；`trace.propagateToAdapters:true`。
- **B-tp-6 resolveWorkflowQuestionToolEntry**：`readOnly:false`（作答让 actor 继续干活）、`needsApproval:false`（弹窗会把等答案的 actor 挂更久）；15s；24k；`patternSources:["toolName","input"]`（question_id）；`trace.propagateToAdapters:true`。
