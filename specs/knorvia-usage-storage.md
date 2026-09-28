<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# 用量持久存储与统计

2026-09-28，基线 `dca7ae1`。按公开 UsageStorePort 独立替换六个仓储入口：recordModelUsage、upsertTurnUsage、upsertToolUsage、pruneUsage、queryAppUsage、queryTaskUsage。保留现有模型/轮次/工具用量字段、合并规则、30 天保留和应用/任务统计口径。SQLite 三张用量表为唯一状态，无新 schema、缓存或后台任务，不改 UI、真实数据、根许可或预览版本。

## 状态、时序与有意修复

```text
写入参数 → 原预写准备/投影 → 唯一自有写事务 → upsert → cutoff 时钟 → 三表裁剪 → COMMIT
                                           └任一失败：回滚本次写入和裁剪，保留首因
直接 prune → cutoff → 同一自有事务边界 → 三表裁剪 → COMMIT
查询 → 现有同步只读统计 → 公共结果，无清理/修复副作用
```

现有三种写入在事务外 upsert，再调用自有事务 prune；裁剪失败时已保存的新增或冲突更新未撤销。旧版已有外层事务时先修改调用者事务，再因 prune 的 BEGIN 拒绝而报错。直接 prune 在触发器已自动回滚时会用第二次 ROLLBACK 覆盖真正失败。已在全新内存 SQLite 分别复现，不能将这些旧失败记为通过。

本批有意改为写入+裁剪由既有 withWriteTransaction 的 own 政策整体提交，复用一个内部三表清理动作；禁止在写回调里再次调用公开 prune 取得第二个事务。任何插入/更新、后续时钟、裁剪或 COMMIT 失败都不能留下本次写入或触发器效果。清理仍依 model_usage、turn_usage、tool_usage 的顺序，cutoff 用严格早于判断，边界行保留。

不把真正写入改成借用外层事务。已有外层时仍报原生 BEGIN 错误，但现在必须在本次写入前拒绝，保留调用者此前修改及活动状态；不提交或回滚外层。直接 prune 的外层拒绝同样不改变调用者数据。无自动重试或保存点。

保留原预写错误优先级：准备 INSERT 语句的原生错误可先于 JSON 投影；模型 rawUsage 编码先于 providerMetadata，编码失败不能开始事务、不能修改外层。默认 computedTotalTokens 的有限数值计算仍在原准备阶段。写入的默认清理 cutoff 在 upsert 成功后读取一次 Date.now，再减 30 天；直接 prune 的 cutoff 在尝试 BEGIN 前计算。时间抛错时本次新增现在必须回滚，是原子修复的一部分。

事务内自动 ROLLBACK 后直接传播原始失败，仍活动才清理；清理也失败使用既有 helper 的 AggregateError/cause 保留两个错误。API 保持 Promise；实际同步数据库阶段中不插 await。写入返回 void，只有整体 COMMIT 成功才表示成功。

## 统计兼容约束

应用查询按 started_at 的 `[since, until]` 两端包含范围，公共旧注释的单边开区间不替代实际行为。固定 tzOffsetMs 后除以一天，现有 SQLite 取整向零截断，负毫秒不能偷偷改为 floor。保留分模型、工具和日汇总、空集合 0/null、排序和普通结果对象；不为查询新增写锁或声称多语句一致快照。

任务查询按同一 session 的 started_at 升序、id 升序累加。main_turn、subagent、workflow_child 各有独立输入基线；上下文压缩后基线允许下降，但已累计消耗不回扣。其他 querySource 每次完整计入输入与缓存。保留历史缓存包不包含在 input 的推断、providerTotalTokens 优先和 output/reasoning/error 计数规则。完整字段、聚合与投影合同见下文，隔离作者须阅读全文。

## 先行验收和来源

先补原生测试：三种新增与冲突更新后裁剪失败整体撤销；外层 BEGIN 拒绝不得留下本次行；三表清理任一阶段失败保留原数据；自动回滚/双失败/真实延迟外键 COMMIT；预写 JSON/语句准备错误与时钟阶段；实际裁剪天数和边界。同时验证原合并、归桶和任务基线口径。先运行旧目标识别预期失败，再放行隔离作者。

主代理与复核者读取旧实现提取合同，作者仅获完整行为规格、公共声明、表列约束和依赖签名，不得读取旧目标、SQL 模板、历史、dist/maps、冻结基线或先行测试。不宣称全流程 clean-room，也不把改名、提取、标准 SQL、字段匹配或测试通过单独算原创。

生产源码各文件小于 400 行，跨包使用公共类型。主代理执行根/CLI 类型和 lint、严格测试类型、架构、相关与完整离线、源码/编译对照及公开编译入口，更新来源记录并在零密钥发现后提交。有限原生测试不表示跨进程压力、磁盘故障或真实供应商验证；其余仓储、schema、migration、facade 和调用者许可不随本批改变。

## Public surface and dependencies

All six repository exports take DatabaseSync as their first parameter. The public store facade delegates without catching or modifying results.

| Operation        | Input after connection                                                 | Promise result       |
| ---------------- | ---------------------------------------------------------------------- | -------------------- |
| recordModelUsage | ModelUsageRecord                                                       | void                 |
| upsertTurnUsage  | TurnUsageRecord                                                        | void                 |
| upsertToolUsage  | ToolUsageRecord                                                        | void                 |
| pruneUsage       | optional `{ beforeTime?: number }`, default empty object               | void                 |
| queryAppUsage    | AppUsageQueryInput `{ since:number, until:number, tzOffsetMs:number }` | AppUsageQueryResult  |
| queryTaskUsage   | TaskUsageQueryInput `{ sessionID:SessionId }`                          | TaskUsageQueryResult |

Use published types from @knorvia/contracts; do not create parallel domain interfaces. Relevant declarations are in session-store.port.ts lines 870–1078 and its imported branded identifiers. SessionTaskType and ModelToolSideEffectScope remain existing public types. UsageStatus is running/completed/error/cancelled. UsageQuerySource names main_turn, compact, session_title, goal_completion_verification, subagent, workflow_child, unknown; ModelUsageRecord also accepts arbitrary querySource/provider/model strings. These declarations may be separately supplied verbatim because they are public contracts, not target implementation bodies.

encodeJson(undefined|null) returns SQL NULL; otherwise it uses native JSON.stringify, with no catch or replacement. Preserve object member order in resulting JSON and errors from cycles, BigInt or native toJSON hooks. Do not decode these two model JSON columns in usage queries.

withWriteTransaction(db, ownership, synchronousCallback) is an existing owned dependency: `own` always attempts BEGIN IMMEDIATE; BEGIN failure is outside cleanup. It runs the callback and COMMIT. On failure it rolls back only while a transaction remains active; rollback double failure produces AggregateError with ordered [primary, cleanup] and cause=primary. No reimplementation or nested call to public pruneUsage inside another owner.

## Shared value rules

- The normalized count rule accepts only a finite JS number, truncates its fractional part toward zero, then bounds the result below by 0. Undefined, null, non-numbers, NaN and infinities become 0. Do not coerce numeric strings.
- Ordinary boolean columns use JS truthiness to produce 1 or 0; missing values become 0. The public type stays boolean even though runtime truthy/falsy behavior exists.
- readOnly/destructive are special: only undefined becomes SQL NULL. False becomes 0; true becomes 1. A runtime explicit null also becomes 0, not NULL. The nullable difference controls whether an update preserves existing metadata.
- Optional raw values marked nullable below bind SQL NULL only when nullish. Preserve zero, empty strings, negative/fractional numbers and other driver-supported values; do not apply the count rule to durations, timestamps, exitCode or raw provider totals.
- JSON inputs rawUsage/providerMetadata are unknown, not prevalidated schemas. Missing/null map to SQL NULL; native encoding failures propagate.
- Unknown extra input fields are ignored. Plain input objects are not mutated. No new application validation, implicit parent/session creation, ID generation, timestamp substitution for startedAt, or fallback values for required identity fields.

## Existing schema facts (no DDL or SQL template)

All tables originate in migration 0010_usage_observability. They are ordinary SQLite tables, not STRICT tables. Do not migrate or alter them.

- model_usage: primary key id; session_id references session(id) with delete cascade; required identity/source/provider/model/status/start columns; optional JSON text columns. Indexes cover started_at/provider_id/model_id, session_id/turn_id, trace_id, query_source.
- turn_usage: composite primary key session_id/turn_id; session_id references session(id) with delete cascade. Index on started_at.
- tool_usage: primary key id; session_id references session(id) with delete cascade; additionally UNIQUE(session_id, tool_call_id). Indexes cover started_at/tool_name and session_id/turn_id. The unique call key is not an alternative upsert target: a different id colliding with this pair must still raise a native uniqueness error.
- Status columns are NOT NULL and constrained to the four UsageStatus values. Required counters are INTEGER NOT NULL DEFAULT 0. Required boolean flags are INTEGER NOT NULL DEFAULT 0 with 0/1 checks. read_only/destructive permit NULL and otherwise only 0/1. Timestamps/durations are INTEGER affinity, optional unless identified as started_at. Required text columns are NOT NULL; optional text/numeric/JSON columns permit NULL. IDs are declared text primary keys, without adding a new NOT NULL constraint in this batch.
- Preserve native foreign-key/check/unique/binding errors and session-delete cascade. Updating an existing key must retain row identity and normal UPDATE behavior; do not implement conflict handling by deleting/reinserting or INSERT OR REPLACE.

### Model row mapping

ModelUsageRecord required fields: id, logicalRequestId, sessionID, querySource, providerId, modelId, status, startedAt. All other fields below are optional. Every value except id is replaced on an id conflict, including replacement of omitted optional values by NULL/0. No partial-patch semantics and no protection against terminal-to-running status regression.

| Public field                                    | Physical column                                       | Projection                                                  |
| ----------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------- |
| id                                              | id                                                    | direct primary key                                          |
| logicalRequestId                                | logical_request_id                                    | direct                                                      |
| attemptIndex                                    | attempt_index                                         | normalized count                                            |
| sessionID                                       | session_id                                            | direct required FK                                          |
| turnID / traceID / spanID                       | turn_id / trace_id / span_id                          | nullable text                                               |
| assistantMessageID / parentUserMessageID        | assistant_message_id / parent_user_message_id         | nullable text                                               |
| querySource / providerId / modelId              | query_source / provider_id / model_id                 | direct required text                                        |
| reasoningLevel                                  | variant                                               | nullable text; historical physical name must remain variant |
| agent / mode / taskType                         | agent / mode / task_type                              | nullable text                                               |
| status                                          | status                                                | direct, native constraint                                   |
| startedAt                                       | started_at                                            | direct required time                                        |
| firstTokenAt / completedAt                      | first_token_at / completed_at                         | nullable raw time                                           |
| durationMs / timeToFirstTokenMs                 | duration_ms / time_to_first_token_ms                  | nullable raw number                                         |
| finishReason                                    | finish_reason                                         | nullable text                                               |
| toolCallCount                                   | tool_call_count                                       | normalized count                                            |
| inputTokens / outputTokens / reasoningTokens    | input_tokens / output_tokens / reasoning_tokens       | normalized count                                            |
| cacheCreationInputTokens / cacheReadInputTokens | cache_creation_input_tokens / cache_read_input_tokens | normalized count                                            |
| providerTotalTokens                             | provider_total_tokens                                 | nullable raw number; not the count rule                     |
| computedTotalTokens                             | computed_total_tokens                                 | explicit nonnull value unchanged, otherwise fallback below  |
| retryCount                                      | retry_count                                           | normalized count                                            |
| retryable / cancelledByUser / contextExceeded   | retryable / cancelled_by_user / context_exceeded      | ordinary boolean                                            |
| errorType / errorCode / errorMessage            | error_type / error_code / error_message               | nullable text                                               |
| rawUsage / providerMetadata                     | raw_usage_json / provider_metadata_json               | encodeJson, rawUsage first                                  |

Fallback computed total: normalized inputTokens, when positive, is the entire input side. Otherwise use normalized cache-creation plus cache-read counts. Add normalized outputTokens. Do not add reasoningTokens separately. Explicit computedTotalTokens (including 0 or a finite negative/fractional number) bypasses this fallback and is not normalized; this differs from TurnUsageRecord. An explicit NaN can cause the native NOT NULL failure rather than silently becoming zero.

### Turn row mapping and conflict policy

TurnUsageRecord required fields: sessionID, turnID, status, startedAt. All others are optional. Physical names follow snake_case; fields ending ID map to \_id, and cacheCreationInputTokens/cacheReadInputTokens to cache_creation_input_tokens/cache_read_input_tokens.

| Fields                                                                                                          | Conflict behavior                                        |
| --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| sessionID, turnID                                                                                               | composite identity                                       |
| traceID, userMessageID                                                                                          | use incoming nonnull value; otherwise retain previous    |
| status                                                                                                          | replace, even terminal -> running                        |
| startedAt                                                                                                       | retain earlier numeric value                             |
| firstModelStartAt, firstTokenAt                                                                                 | retain existing nonnull value; only fill an absent value |
| completedAt, durationMs, timeToFirstTokenMs                                                                     | use incoming nonnull value; otherwise retain previous    |
| modelRequestCount, modelRetryCount, toolCallCount, toolErrorCount                                               | replace normalized count, including zero for omission    |
| inputTokens, outputTokens, reasoningTokens, cacheCreationInputTokens, cacheReadInputTokens, computedTotalTokens | replace normalized count; no computed-total fallback     |
| retryable, cancelledByUser, contextExceeded                                                                     | replace ordinary boolean; omission resets to zero        |
| errorType, errorCode                                                                                            | incoming nonnull value wins                              |

On first insert, nullable fields are NULL and count/flag projections follow shared rules. Empty strings and zero are nonnull replacements. First-model/first-token fields retain the first nonnull observed value, not the minimum timestamp. The startedAt minimum is independent of these fields.

### Tool row mapping and conflict policy

ToolUsageRecord required fields: id, sessionID, toolCallID, toolName, status, startedAt. All other fields below are optional. Physical naming is normal snake_case, including tool_call_id, side_effect_scope, time_to_first_output_ms, read_only, output_bytes, stdout_bytes, stderr_bytes.

| Fields                                                 | Conflict behavior                                                                                                                   |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| id                                                     | primary identity                                                                                                                    |
| sessionID, toolCallID                                  | always replace; native FK/secondary uniqueness still apply                                                                          |
| turnID, traceID, sideEffectScope, approvalStatus       | incoming nonnull value wins                                                                                                         |
| toolName                                               | incoming exact lowercase `unknown` preserves previous name; any other string replaces, including empty; first insert may be unknown |
| readOnly, destructive                                  | nullable-boolean projection; incoming nonnull result wins                                                                           |
| status                                                 | previous completed/error/cancelled survives incoming running; other transitions replace                                             |
| startedAt                                              | retain earlier value                                                                                                                |
| firstOutputAt                                          | existing nonnull value wins; not a minimum                                                                                          |
| completedAt, durationMs, timeToFirstOutputMs, exitCode | incoming nonnull value wins                                                                                                         |
| outputBytes, stdoutBytes, stderrBytes                  | maximum of previous and incoming normalized count                                                                                   |
| truncated                                              | maximum of previous and incoming boolean; once true it stays true                                                                   |
| retryCount                                             | replace normalized count, omission resets                                                                                           |
| retryable, cancelledByUser                             | replace boolean, omission resets                                                                                                    |
| errorType, errorCode, errorMessage                     | incoming nonnull value wins                                                                                                         |

approvalStatus is publicly none/requested/allowed/denied. Storage adds no validation beyond the existing schema. readOnly/destructive and accumulated output facts may arrive through separate event updates; preserve special merge rules rather than making the row a uniform replacement. For all nullable-preservation entries above, omitted/null incoming values keep previous values, while first insertion stores NULL.

## Retention, sequencing and approved intentional fixes

Retention is global across all sessions/providers/models and all three usage tables. Default cutoff is Date.now minus 30 _ 24 _ 60 _ 60 _ 1000 milliseconds. Explicit beforeTime uses nullish default, so 0 is real. Delete only rows whose started_at is strictly earlier than cutoff; equality remains. Completion time/status do not affect retention, so an old running row is eligible. Deletion order is model_usage, turn_usage, tool_usage. No other table is pruned or touched.

A successful write invokes global retention immediately, so writing an old fact can remove its own row and still resolve void. Queries do not prune; empty results do not create data. Direct prune always attempts its own transaction even with no expired rows.

Observed old write order: prewrite calculations/statement preparation/argument projection -> upsert -> default-cutoff Date.now -> separate owned prune transaction -> completion. The upsert is therefore committed independently in standalone use, or already pending in a caller transaction when nested prune BEGIN fails. This is a reproduced defect, not behavior to accidentally retain.

Parent-approved intentional changes, requiring old-first failure gates:

1. Each upsert and following three-table retention shares one existing `withWriteTransaction(..., own, ...)` boundary. Any upsert/prune/COMMIT failure leaves no standalone insertion/update residue and rolls back associated trigger effects.
2. Existing caller transactions are still unsupported for new usage writes. BEGIN must fail before altering caller rows; do not switch to borrow, commit/rollback the caller, or keep the old pending partial write. Direct prune keeps its own policy and already rejects before deletion.
3. On automatic rollback retain the original failure, without overwriting it by another ROLLBACK. On cleanup failure retain ordered primary/cleanup causes via the owned helper. Do not swallow storage errors because a runtime caller logs them.

No new helper, schema, retry, queue or snapshot transaction is approved. Share an internal synchronous retention action between direct prune and the combined write owner; it must not start another public prune transaction inside the owned write.

### Projection and failure precedence before ownership

Preserve meaningful prewrite errors before BEGIN, including inside a caller transaction. Inputs are ordinary materialized values; arbitrary mutating getter counts are outside this contract.

- Model fallback-total calculation occurs first. Native statement preparation then precedes binding/JSON projection. All binding values are ready before execution. rawUsage encoding precedes providerMetadata encoding; either error prevents upsert/retention. Cyclic providerMetadata rejects before new transaction control and leaves an existing caller transaction intact.
- Native preparation denial (e.g. SQLite authorizer denies preparation of model INSERT) currently precedes JSON encoding. Do not put BEGIN before every operation and replace this known first-error ordering.
- Turn/tool statement preparation likewise precedes binding projection. No row mutation has occurred if preparation/projection fails. Do not add application validation that changes native bind/FK/check/unique failures during actual execution.
- A suitable plan prepares the statement and ordinary binding values outside ownership, then performs BEGIN, upsert execution, cutoff calculation, retention, COMMIT. This is a behavioral recommendation, not an old function/SQL template.
- Keep default-cutoff Date.now after a successful upsert, now inside the combined owner. A failed upsert/prewrite JSON does not read this clock. Selecting cutoff earlier can change retained rows near the boundary. Direct prune selects its cutoff before its own BEGIN as before.
- If post-upsert clock or retention preparation fails, the combined boundary rolls back the upsert; this is part of atomicity.
- All actual current SQLite work completes synchronously before control returns, despite Promise exports. Old writers await the pruning Promise after its synchronous database work; query/prune functions do not internally yield. Preserve synchronous database effects and the Promise/error surface; do not await inside an active transaction or add background cleanup. Exact arbitrary microtask instrumentation does not justify extra asynchronous stages.

## Application usage query

This is raw-storage aggregation, not event replay or the task incremental algorithm. There is no session/project/provider/status filter beyond the metric's own condition and time window.

**Window includes both ends: since <= started_at <= until.** The public comment describing (since,until] disagrees; preserve actual behavior. Bind numbers directly without clamp/swap/new validation. Reversed window is empty. tzOffsetMs is a fixed supplied offset, not a timezone/DST resolver.

Return ordinary object members in this order: totals, turnTotals, toolTotals, models, tools, days, dayModels. Nested objects/array elements are ordinary detached objects, not SQLite null-prototype rows. Numeric projection uses Number; missing SUM-like totals become zero, absent averages become null. Counts include every status unless specified.

- totals fields in order: totalTokens,inputTokens,outputTokens,reasoningTokens,cacheCreationTokens,cacheReadTokens,modelRequestCount,modelErrorCount,avgTimeToFirstTokenMs. Sum model computed_total_tokens,input_tokens,output_tokens,reasoning_tokens,cache_creation_input_tokens,cache_read_input_tokens respectively. Requests count all matching model rows; errors count exactly status=error. First-token latency averages every non-NULL time_to_first_token_ms regardless of status. provider_total_tokens is not used.
- turnTotals: totalSessions,totalTurns,avgTurnDurationMs,longestSessionMs. Distinct session count and turn count include all matching turn rows. Duration average includes only completed rows with non-NULL duration_ms. Longest session is max of per-session sums of completed duration_ms within the requested window, treating other statuses as zero. Each session's all-NULL sum becomes zero before the maximum is selected; a session with missing durations therefore outranks a separate negative-duration sum. Negative supplied durations otherwise remain raw. It is neither wall-clock span nor longest individual turn. Empty result is 0/0/null/0.
- toolTotals: toolCallCount,toolErrorCount, using all matching tool rows and exactly status=error.
- models: group solely by model_id across providers. Fields modelId,totalTokens,inputTokens,outputTokens,requestCount. Sum computed/input/output and count rows; sort totalTokens descending. The computed-total SUM's NULL-to-zero policy applies before sorting, not just while projecting the result. Explicit +Infinity/-Infinity or finite overflow can make a native SUM NULL: its resulting zero must sort above a separate negative sum. Do not add provider grouping or a secondary tie order. Missing modelId is null.
- tools: group by tool_name. Fields toolName,callCount,errorCount,avgDurationMs; sort callCount descending. Average includes non-NULL durations in any status; absent average is null.
- days: merge union of model/turn/tool day buckets without filling absent dates. Fields dayIndex,totalTokens,turnCount,toolCallCount. Missing measures in a present bucket are zero. Sum model computed totals; count all matching turn/tool rows. Sort final days by dayIndex ascending.
- dayModels: model-only groups by dayIndex/model_id; fields dayIndex,modelId,totalTokens; sum computed totals. No separately declared ordering after native grouped output. Preserve current native grouped output for ordinary fixtures instead of sorting by popularity. Missing modelId is null.

Day index uses SQLite numeric division by 86,400,000 after adding offset, then integer conversion **toward zero**. Old comment says floor; negative effective timestamps differ: -1ms at zero offset belongs to dayIndex 0. Preserve actual behavior; changing historic negative dates requires a separate decision/test. Positive contemporary timestamps use usual day buckets.

Keep the native grouping key in days. With a supplied tzOffsetMs=NaN, the driver binds NULL and SQLite produces a NULL dayIndex; existing days runtime output retains null despite the public number declaration, while dayModels separately converts that key with Number and returns 0. Preserve that established difference; do not silently validate/reject the input or normalize days to zero. This is a bounded numeric compatibility exception, not a promise for arbitrary database corruption or Proxy inputs.

The query performs independent synchronous aggregate reads on the supplied connection, without a read transaction. Preserve limited consistency: external commits may occur between reads; this is not a guaranteed multi-query snapshot. Preserve caller-owned transaction visibility and propagate first encountered SQL error. No prune/cache/time read. Do not claim stronger snapshot consistency from the rewrite.

Preserve aggregate read order for the existing first-error and limited-snapshot boundary: model totals; turn totals; longest-session completed durations; tool totals; grouped models; grouped tools; model days; turn days; tool days; model-by-day groups. This is semantic phase order, not a required SQL template.

## Task usage query

Only model_usage rows for exact requested session participate. No cutoff, status/provider/model filter, turn grouping, logical-request dedup or read-time prune. Process started_at ascending, then id ascending at equal times. This controls baselines; insertion order is not interchangeable.

Return fields in order: sessionID,totalTokens,inputTokens,outputTokens,reasoningTokens,cacheCreationTokens,cacheReadTokens,modelRequestCount,modelErrorCount,inputBaselineBySource. Empty result echoes sessionID, has zero numeric measures and a fresh ordinary empty baseline object.

For each row:

1. Raw total prefers nonnull provider_total_tokens, else computed_total_tokens, else zero, converted with Number. This differs from app totals.
2. Input-side count uses normalized counts. Zero input uses cache-creation + cache-read; zero caches uses input. When both are positive, compare two explanations of a positive normalized preferred total: input + normalized output versus input + caches + normalized output. Include caches only if the latter is strictly closer; ties keep input alone. Missing/nonpositive normalized total also keeps input alone. This supports historical exclusive-cache and normalized total-input rows.
3. Only exact main_turn/subagent/workflow_child have separate incremental-input baselines. Add max(0,current input-side minus that source's previous baseline, initially zero), then always set its baseline to current input-side. A decrease never subtracts history but lowers baseline for later growth. Source baselines span models/providers within this session.
4. Other sources (compact/session_title/goal_completion_verification/unknown/arbitrary) add the entire input side and never enter the baseline map. Do not let arbitrary source strings create object properties or merge compact into main_turn.
5. Non-input contribution is max(0,raw total minus current input-side). Add it plus incremental/full input to totalTokens. This is not necessarily outputTokens + reasoningTokens.
6. outputTokens/reasoningTokens separately sum raw stored values with Number and nullish zero. Cache counts are summed only for non-baselined sources, using stored numeric values; baselined sources contribute no cache breakdown. Do not count them twice.
7. Requests count all rows, including retries/cancelled/running; errors count exactly status=error.

Independently asserted example: main_turn input/output/cache/total rows 100/10/20/110, 40/5/0/45, 50/5/0/55; compact row 10/2/4/16 uses exclusive-cache inference. Expected totalTokens=146,inputTokens=124,outputTokens=22,cacheReadTokens=4,baseline={main_turn:50},requestCount=4. The second row lowers baseline; third adds ten input tokens.

## Actual callers and error ownership

- SqliteSessionStore at current lines 839–860 directly delegates all six methods.
- core/runtime/methods/usage-observability.ts records model facts at 76, turn facts at 161, and tool scheduled/permission/start/progress/result/error facts around 232–313. Failures are caught/warned under usage.model.write.failed / usage.turn.write.failed / usage.tool.write.failed. These upper-layer observation policies do not belong in storage.
- core/runtime/methods/turn-tool-usage.ts:18 separately records final tool results with the same stable tool identity after possible event updates. Its catch protects model continuation. This explains monotonic output/truncated facts and running-status protection; uniform replacement would lose prior facts.
- bootstrap/protocol/server-operations.ts:1829 sends range/offset to queryAppUsage, then formats a UI snapshot elsewhere. Caller owns now, named timezone offset and 7/30-day/all ranges; storage does not recalculate them.
- Same file at 2934 queries exact session task usage and forwards usage/baselines. Absent optional port has a caller-owned empty fallback; storage errors are not such a fallback.
- Existing local statistics/UI remain; no cloud pricing/account/billing scope enters this batch.

## Suggested cohesive fresh design (source files under 400 lines)

A reasonable boundary: six public forwards in usage.ts; a cohesive write/retention plan; a small shared value-policy module only where genuinely reused; an app aggregate query module; a task ordered-fold module. Write plan owns declarative field/merge policies and one synchronous transaction action. App aggregation and task fold differ and should not be forced through a generic engine. Reuse the current owned transaction dependency; no retention queue.

Author from policies rather than cutting 745 lines into smaller files. No requirement for classes, arbitrary SQL builder framework or a file per table. Fixed columns and common SQL upserts are compatibility constraints; the meaningful new boundary is prewrite preparation followed by one owned mutation/retention action and explicit independent query policies.

## Old-first acceptance matrix

1. Full ordinary mappings of three records; normalized counts versus raw totals/times; nullish/zero/empty options; native FK/check/tool-secondary-uniqueness failures; JSON order/bytes. Existing-key rowid and UPDATE effects remain, without delete/reinsert.
2. Model conflicts fully replace. Turn conflicts retain first nonnull timestamps/optional values but replace counters/flags; terminal may become running. Tool conflicts preserve terminal only against running, first output, metadata, unknown name and max bytes/truncated, while retries/flags may reset. Use out-of-order event-style updates and final-result update.
3. Global strict retention across tables/sessions, equality, explicit zero cutoff, 30-day default, old running entries and self-pruned successful writes. Queries never prune. Verify post-upsert clock and no cutoff clock after preparation/upsert error.
4. Expected failures: insert+prune failure leaves a row in all three old writers; existing-key update+prune failure retains overwritten columns. Replacement restores snapshots. Use native DELETE ABORT triggers and prove an actual deletion was attempted.
5. Caller transaction with valid new write: old rejects after pending mutation; new rejects before mutation, preserves caller work and active transaction. Direct prune stays owned. Cyclic metadata/preparation error still precedes BEGIN; no borrow conversion.
6. Direct prune atomic failure at each table; automatic rollback preserves first cause; cleanup failure preserves both. Real deferred-FK COMMIT failure rolls back upsert/pruning/trigger effects; verify COMMIT was reached. Failed BEGIN owns no cleanup.
7. App query empty result, equal inclusive bounds, reversed range, status policies, cross-provider model grouping, NULL averages, completed-duration sums, turn/tool-only days, dayModels, equal total/count ordering, offsets and negative-time truncation. Assert own-key order and ordinary prototypes.
8. Task query separate baseline sources; other-source full counts; repeated/shrinking/growing context; cache-only, total-input/exclusive-cache inference and tie; provider-total preference; time/id ordering; retry/error counts; empty session. Use independently calculated expected totals.
9. Public compiled facade/runtime-style tool events and finite source/compiled differential, separating atomicity repairs. Preserve limited query snapshot semantics; do not claim cross-process stress coverage.

## Evidence and limits

Read target, public types, migration schema, facade, direct runtime/bootstrap consumers and current provenance inventory. Searches for six API names/model_usage/inputBaselineBySource under adapter/core/bootstrap test directories and repository \*.test/regression/smoke files found no direct existing usage-storage assertion in this checkout. This is a bounded search result, not proof of no indirect coverage. Chat-metrics/group specs concern presentation/separate Studio runtime snapshots rather than these SQL contracts.

Pre-implementation investigation used new :memory: SqliteSessionStore instances with synthetic sessions only. Probe scripts and raw logs remain outside the repository:

- Native boundary probe: 11 assertion/fact groups passed. Three insert+prune failures kept new rows; model update kept 9 rather than old 3; three outer-transaction write failures kept pending rows; direct prune automatic rollback masked its primary; direct nested prune preserved caller state; inclusive negative-time query and task cache/baseline example asserted.
- Preparation boundary probe: four passed groups. Cyclic metadata before transaction control; rawUsage first-error priority; native preparation denial before JSON hooks; old sequence insert -> clock -> prune BEGIN -> COMMIT.

No real user DB, model, device, server or network was used. Investigation-only probes do not establish implementation, build, typecheck or full regression acceptance. No cross-process stress, DST fix, arbitrary Proxy/getter equivalence, exhaustive corruption behavior or exact underdetermined tie-order guarantee is established. Integration and source audit results belong in the separate acceptance and provenance records; investigation success alone is not implementation completion.
