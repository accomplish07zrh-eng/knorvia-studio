# core-runtime-methods-01 替换设计（replace 阶段）

> 目标：把 `apps/cli/packages/core/src/runtime/methods/` 的 21 个继承文件（模型调用与流式事件，
> 2,945 行）替换为独立实现。**兼容面冻结**：21 个模块路径 × 49 导出逐名保持（interface.md），
> 行为以 B1–B31 + 双金样 + 五组事件序列为判据。内部按「门面 + support 内核」重组，换骨不换义。

## 0. 红线锚点（改写全程不得触碰）

1. **双金样逐字节**：`fixtures/model-request-roundtrip.json`（请求组装/队列载荷序列/响应投影）、
   `fixtures/stream-usage-roundtrip.json`（流事件→模型/工具/回合用量账本）——旧写→新读→新写→旧读
   全程保持；时间取样字段继续按 `<completedAt>/<durationMs>` 符号化口径。
2. **五组事件序列**：B2 流事件消费序、B7/B16/B20 进入顺序、B19/B22 完成顺序交错、
   B13/B22/B23 持久化记录序、B6/B23/B25 日志序列——gate 握手语义、无 sleep/固定超时，
   **同 tick 契约**（playbook A2：信号点与其后调用同微任务，热路径不得新增 await 边界）。
3. **KD-1/2/3 行为面原样**：checkpoint 落账失败吞错转 warn `checkpoint.persist.failed`、
   rewind 分派错误冒泡；B22 `recoveredFromStreamFailure` 仍只作传参（观察面在 methods-02）；
   B1 媒体三段投影「未改动时保持原对象引用」语义保持。
4. **语义常量逐字**：32,000 默认输出预算、预留 1,000、恢复上限 10、退避 `[1000, 2000]`、
   busy 码 3008/3009/3010、队列高水位 128、缓冲冲刷阈值 4,096、drain 上限 250ms、汇总阈值 100、
   logical id 兜底分隔符 `_`/`:`、`usageCount` 截断口径、`STREAMING_TOOL_EXECUTION_MODE="readOnly"`、
   `DEFAULT_REASONING_STREAM_ID`、错误文案（B5/B15/B21/B17 固定句）逐字。

## 1. 模块重组（门面 + support 内核）

公开 21 个模块路径保留为**薄门面**（只留导出签名与转发，声明模式计分）；实现沉入
`runtime/methods/support/`（新文件，普通模式计分，内部导出一律不入公开面——防「导出集合与
interface.md 一致」契约红）。簇划分与内核落点：

| 簇            | 公开门面（旧文件→门面）                                                                                                 | support 内核（新写）                                                                                                                                                                                                                          | 覆盖条目                 |
| ------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| C1 纯函数     | model-request-session-type、model-token-limits、reasoning-stream、model-streaming-event、usage-observability-projection | `support/session-type-table.ts`、`support/token-budget.ts`、`support/reasoning-blocks.ts`、`support/usage-projection.ts`                                                                                                                      | B3/B4/B9/B31（+B8 落点） |
| C2 流状态     | model-request-stream-state、model-streaming-event-queue、model-runtime-headers、model-status                            | `support/write-queue.ts`（尾链+背压+失败缓存）、`support/tool-input-buffers.ts`、`support/status-log-table.ts`（7 type 表驱动）、`support/header-refresh.ts`                                                                                  | B5/B6/B7/B10/B11         |
| C3 取消与恢复 | cancelled-stream-persistence、streaming-recovery、streaming-tool-synthetic-result                                       | `support/cancel-snapshot.ts`、`support/recovery-plan.ts`（预算/attempt/锚点/failureKind/retryable 判定表）、`support/recovery-emit.ts`、`support/synthetic-results.ts`                                                                        | B13–B17、B21             |
| C4 流式工具   | streaming-tool-coordinator、streaming-tool-execution                                                                    | `support/admission-table.ts`（准入七条件判定表）、`support/during-stream-run.ts`（B20 管线）、`support/collect-results.ts`（250ms 竞速收采）、`support/recover-step.ts`（B22 编排）                                                           | B18–B20、B22             |
| C5 事件管线   | events、events-durable、events-session、events-summary                                                                  | `support/event-pipeline.ts`（append 四步+日志序列）、`support/sink-notify.ts`、`support/session-persist.ts`（五 phase）、`support/durable-dispatch.ts`（八类分派表）、`support/append-summary.ts`                                             | B23–B27                  |
| C6 用量与入口 | usage-observability、model、runtime-model                                                                               | `support/model-request-assembly.ts`（B1 组装+三段投影缝）、`support/stream-consume.ts`（B2 映射循环）、`support/usage-model-fact.ts`、`support/usage-turn-fact.ts`、`support/usage-tool-fact.ts`、`support/invocation-layer.ts`（B12 合并层） | B1/B2/B12/B28–B30        |

簇内先内核后门面；门面仅 `export` 转发（形如 core-03/试点 1 的薄壳口径）。

## 2. 状态所有者（不变，仅换持有位置）

| 状态                                                | 所有者                                                    | 备注                   |
| --------------------------------------------------- | --------------------------------------------------------- | ---------------------- |
| 流状态（reasoning/toolCalls/缓冲/finalToolCallIds） | `createModelRequestStreamState` 返回的句柄（C2 内核构造） | 一次性请求生命周期     |
| 队列 pending/失败/尾链                              | write-queue 内核闭包                                      | 进入序=enqueue 序契约  |
| 协调器声明表/执行表/abort 控制器/丢弃字节           | `createStreamingToolCoordinator` 闭包（C4）               | 同 id 不重复启动       |
| 恢复预算计数/pending identity/events                | `RegularTurnLoopState`（回合循环持有，C3 读写）           | 非并发安全，调用方串行 |
| 事件数组 `options.events`                           | 调用方                                                    | 先持久化后 push        |
| 汇总条目                                            | 模块级 WeakMap（keyed by runtime，C5）                    | 冲刷即清空             |
| usage 账本                                          | `UsageStorePort`（sessionStore 扩展面，四方法门槛）       | 写入失败 warn 吞掉     |
| 会话持久化位                                        | `runtime.sessionPersisted`（B25 唯一写者）                | 失败不置位             |

## 3. 事件顺序不变量（重写后必须逐条对测）

1. B2：适配器产生序 = 消费序；同一 `tool_call` 的缓冲冲刷先于 `tool_call` 入队；
   `error`/`finish` 先冲刷全部缓冲再入终止事件；catch `drain()` 后原样重抛。
2. B7：队列写入严格串行（尾链）；进入序 = `enqueue` 序；失败缓存后三出口都抛。
3. B13：reasoning 块按数组序逐条 → text 收尾；`completedAt` 单次取样。
4. B16：AnchorSelected → TailDiscarded → RetryStarted（进入序=完成序）；pending identity
   在三事件全部落盘后写。
5. B19/B22：执行完成序与启动序解耦、`drain` 恒按调用表序；恢复事件组（Started）先于补执行
   持久化、重试事件组最后（B22 交错序）。
6. B20：pending 分部 → `tool_call_closed` → 调度 → `tool_queued` → running 分部 → `tool_started`。
7. B6：publish 五步 = onStatus → 日志 → 持久化 → events.push（日志在持久化前）。
8. B23：append → durable → usage → sinks →（汇总命中即返回）/flush → appended debug；
   生命周期 started info 在最前、completed info 后才是 appended debug。
9. B25：createSession → 模型选择 → shell 快照 → 执行状态 → `sessionPersisted=true` →
   标题事件 → completed info。

## 4. B 落点（条目 → 新内核/门面）

见簇表「覆盖条目」列；逐条断言已在 35 例合同测试锁死，重写期间每簇跑双入口全绿为准。
KD-1（B26 checkpoint 吞错/rewind 冒泡）、KD-2（B22 flag 仅传参）、KD-3（B1 投影保持原对象）
行为面在 C5/C4/C6 内核中原样保留。

## 5. 计分模式预标注（acceptance 口径，门槛不调）

- 21 个门面：**声明模式**（`--declaration --interface`，纯签名转发壳）。
- support 内核：**普通模式**（三门槛：<0.20 行包含率、最长相同段 <8、结构 <0.40）。
- normal + decl 两门都跑都记；`usage-observability-projection.ts` 门面按残差实测定夺。
- 每簇 `pnpm fmt`（注意 oxfmt 会重排 reviews.json/表格——**fmt 后 edit 前先重读**，FS_STALE）。

## 6. 簇序与验收

C1 → C2 → C3 → C4 → C5 → C6。每簇：写内核+门面 → fmt → 契约 35 例双入口 → 双门计分 →
lint/arch/tsc → 小步提交。全簇完成后：删旧删桩（桩的 not-implemented 抛错串全仓 0）→
登记最后一步 → L 节门禁（cua driver `KNORVIA_CUA_DRIVER_ARCHIVE`）→
`docs/knorvia-core-runtime-methods-01-acceptance.md` → prepare-merge → 替换 PR → CI 双绿 →
squash 合并（勿 --delete-branch）→ issue 记录。
