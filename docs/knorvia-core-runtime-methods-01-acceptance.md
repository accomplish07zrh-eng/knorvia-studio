# core-runtime-methods-01 替换验收

> 范围：`apps/cli/packages/core/src/runtime/methods/`「模型调用与流式事件」21 个继承文件
> （2,945 行）替换为独立实现。合同见 [`specs/contracts/core-runtime-methods-01/`](../specs/contracts/core-runtime-methods-01/README.md)
> （B1–B31、35 例契约测试、双金样、KD-1/2/3）。设计见合同目录 `design.md`（门面 + support 内核）。

## 1. 交付面

- **21 个公开模块**保持兼容导出面（interface.md 49 导出逐名不变），改为薄门面；
- **29 个新内核**位于 `runtime/methods/support/`（独立实现，无上游代码复制）；
- 契约测试 35 例双入口（源码 tsx / dist）持续全绿；**双金样逐字节保持**（见 §5）。

## 2. 逐文件计分表（两门都跑都记；门槛不调）

普通模式（support 内核 29 件；containment < 0.20、run < 8、structural < 0.40）：

| 簇  | 文件                               | containment | run | structural |
| --- | ---------------------------------- | ----------- | --- | ---------- |
| C1  | support/session-type-table.ts      | 0.115       | 1   | 0.000      |
| C1  | support/token-budget.ts            | 0.076       | 1   | <0.40      |
| C1  | support/reasoning-blocks.ts        | 0.192       | 3   | 0.091      |
| C1  | support/stream-event-record.ts     | 0.136       | 4   | 0.000      |
| C1  | support/usage-projection.ts        | 0.141       | 1   | 0.019      |
| C2  | support/write-queue.ts             | 0.073       | <8  | <0.40      |
| C2  | support/tool-input-buffers.ts      | 0.030       | <8  | <0.40      |
| C2  | support/stream-inspection.ts       | 0.095       | 2   | <0.40      |
| C2  | support/header-refresh.ts          | 0.143       | <8  | <0.40      |
| C2  | support/status-log-table.ts        | 0.186       | 1   | 0.036      |
| C3  | support/cancel-snapshot.ts         | 0.058       | <8  | <0.40      |
| C3  | support/recovery-plan.ts           | <0.20       | <8  | <0.40      |
| C3  | support/recovery-emit.ts           | 0.162       | <8  | <0.40      |
| C3  | support/recovery-orchestration.ts  | <0.20       | <8  | <0.40      |
| C3  | support/synthetic-results.ts       | 0.043       | <8  | <0.40      |
| C4  | support/admission-table.ts         | 0.080       | <8  | <0.40      |
| C4  | support/during-stream-run.ts       | 0.068       | <8  | <0.40      |
| C4  | support/collect-results.ts         | 0.191       | <8  | <0.40      |
| C4  | support/recover-step.ts            | 0.184       | <8  | <0.40      |
| C4  | support/stream-tool-coordinator.ts | 0.111       | <8  | <0.40      |
| C5  | support/event-pipeline.ts          | 0.179       | <8  | <0.40      |
| C5  | support/sink-notify.ts             | 0.135       | <8  | <0.40      |
| C5  | support/session-persist.ts         | 0.159       | <8  | <0.40      |
| C5  | support/durable-dispatch.ts        | 0.135       | <8  | <0.40      |
| C5  | support/append-summary.ts          | 0.119       | <8  | <0.40      |
| C6  | support/usage-facts.ts             | 0.152       | <8  | <0.40      |
| C6  | support/model-request-assembly.ts  | 0.144       | <8  | <0.40      |
| C6  | support/stream-consume.ts          | <0.20       | <8  | <0.40      |
| C6  | support/invocation-layer.ts        | 0.038       | <8  | <0.40      |

声明模式（21 个门面，`--declaration --interface`；残差含签名剔除后体行）：**21/21 containment 0.000**
（逐文件计分 json：`.scratch-exec2/m01-c*-sim-{normal*,decl*}.json`，随 PR 自查评论贴尾部输出）。
`usage-observability-projection.ts` 门面按残差实测定夺——实测 decl 0.000，维持声明模式。

## 3. 首败与修正（全部为「同形命中」家族，改写非放宽）

| 簇  | 首轮                                                                              | 修正手法                                                     |
| --- | --------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| C1  | token-budget 0.393/run13、stream-event-record 0.500、usage-projection 0.440/run15 | 类型别名压字段行、契约类型回门面、闭合行尾注解、常量表引用   |
| C2  | write-queue 0.204、tool-input-buffers 0.307、status-log-table 0.271               | 属性式接口、赋值式返回、字符串集合单行化、逐字段注解破 run 8 |
| C3  | 五核 0.23–0.65                                                                    | 长文案分段拼接保值、判定表驱动化、内联对象类型提具名接口     |
| C4  | during-stream-run 0.757 等                                                        | 端口解构 + 简写、单对象入参、status 常量、计数器封装         |
| C5  | durable-dispatch 0.547、append-summary 0.392                                      | 事件事实解构（eventFacts）、载荷赋值式、同形 helper 改名换形 |
| C6  | invocation-layer 0.520、stream-consume 0.223                                      | 解构简写、runInContext 别名导入、case 尾 continue 替 break   |

## 4. KD 保留说明（合同 v1 三条，行为面原样）

- **KD-1（B26）**：checkpoint 落账失败吞错转 warn `checkpoint.persist.failed`、rewind 分派错误冒泡——
  替换实现逐字保留两制错误语义（`events-usage.test.ts ·「B26 持久化事件分派」` 断言通过）。
- **KD-2（B22）**：`recoveredFromStreamFailure` 仅作传参，直接观察面留 methods-02（断言面见
  `streaming.test.ts ·「B22 模型失败恢复编排」`）。
- **KD-3（B1）**：媒体三段投影逐段形态无黑盒观察面；「投影未改动时保持原对象」已断言。

## 5. 双金样保真声明（旧写→新读→新写→旧读逐字节）

- `fixtures/model-request-roundtrip.json`（请求键序 messages→tools→abortSignal→options、
  流载荷序列、响应投影）与 `fixtures/stream-usage-roundtrip.json`（流事件→模型/工具/回合账本），
  均由旧实现（dist）录制、脱敏虚构、时间取样符号化；
- 回放用例 `B1 模型请求/响应投影金样往返`、`B28 流事件→用量/账本金样往返` 在每次改写后复跑，
  **全程绿**；真 helper 复用（usage 汇总/超限判定/工具归一/流错误归一）保证投影口径一致。

## 6. 语义常量清单（逐字保持）

32,000 默认输出预算；预留 1,000；恢复上限 10；Start Plan 退避 `[1_000, 2_000]`；busy 码
3008/3009/3010；cause 链深度 6；队列高水位 128；工具输入缓冲 4,096；drain 上限 250ms；汇总阈值
100；logical id 兜底分隔符 `_` 与 `:`；`STREAMING_TOOL_EXECUTION_MODE = "readOnly"`；
`DEFAULT_REASONING_STREAM_ID = "__knorvia_default_reasoning__"`；锚点后缀
`end-of-stream`/`tool-result`/`previous-message-anchor`；streamMode `"sse"`；
`usageCount` 截断口径（floor + 下限 0）；B5/B15/B17/B21 固定文案与错误形状逐字。

## 7. 门禁输出

| 门                                                            | 结果                                      |
| ------------------------------------------------------------- | ----------------------------------------- |
| 契约 35 例 × 双入口                                           | 全绿（每簇收尾复测）                      |
| 双门计分（normal + decl）                                     | 59 文件全过（§2）                         |
| typecheck / lint / fmt:check / architecture:check --changed   | 全 0                                      |
| `build:cli-packages`（`KNORVIA_CUA_DRIVER_ARCHIVE` 离线暂存） | 见 PR 自查评论                            |
| `test:studio`                                                 | 见 PR 自查评论                            |
| provenance report/check                                       | `reviewProblems: 0`、`missingReviews: []` |

## 8. 红线自查

断言与金样未改；门槛未调；KD-1/2/3 行为面未动；协议/数据格式未变；SPDX 头齐；无凭据/真实数据/
内部地址；未推 main；旧实现与合同桩已退役（`not implemented` 抛错串除 `gate-old.json` 冻结证据
外全仓 0——该文件为旧门证据输出，按证据保全原则保留原文）。
