<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# 工具批次执行与调度续接

2026-09-28。在工具调用与 deadline 独立替换后，替换 executor/batch-runner.ts。依赖排序器 tool/scheduler.ts 不在本批范围。已访问旧源码，不作无接触声明；固定公开字段、顺序、文案和标准 Promise 行为属于兼容合同，不以改名、拆分或测试数量证明独立。

## 所有者与结构

每次 executeBatch 的波次账本独占下一段输入位置和累计结果；一次只提交一波，整波成功结算才放行下一波。小批仍直接传入原 options。每次 executeSchedule 的调度账本独占本次 ID 查找表、当前组游标和结果；调用者拥有原 schedule 与 options，本层按原时点读取，不能提前克隆为另一个调度真相。

纯账本只负责选择、记录和投影，不执行工具、事件或日志。公开异步驱动是唯一副作用路径，沿用 executeOne、executeBatch 和 emitToolCallError 端口，不另建队列、重试器或状态持久化。外部 API、types 和工具安全合同不变。CLI 是现有 unmanaged 模块，不在此次新增跨模块依赖。

```text
工具序列 → 波次账本 → 同步启动整波 → Promise.all 屏障 → 记录结果 → 下一波
调度与工具 → 调度账本 → batch_start yield → 消费者持久化/恢复
                                    ↓
                         执行一组 → 记录 → batch_complete yield
                                                 ↓ 消费者恢复
                            继续下一组 ← 检查严格 stop 标志 → 尾部逐项取消
```

Desktop continuous 与 Web replayable 继续由 Runtime 消费批事件、持久化并转发；batch_start 之后消费者的 onBatchStart 等待仍先于 handler。没有新增 session、owner/lease、重放或跨进程状态。

## 波次合同

- maxConcurrency 在入口按 options 值、deps 值选择一次；不增加取整、夹值或新的异常策略。生产调用者提供有效正数，异常宽度的治理不混入本次修复。
- 输入数量不超过并发数时，立即按输入顺序普通调用 executeOne，使用同一 options 对象；空输入不派发。
- 超过并发数时按已有 slice 数字边界分波。每个回调在派发时新建 options，字段顺序为 automationTurn、offPeakTurn、signal、traceContext、subagentModelOverride、model，不转 maxConcurrency。每波完全完成才派发下一波；结果按输入次序而非完成次序。
- 执行回调保持普通函数 receiver；不加额外异步延迟。同波返回 rejected Promise 不阻止其他回调同步启动；同步 throw 则停止当前 map 的后续调用。任一波拒绝原值透传，不启动下一波，也不替已启动工具补取消。
- 本层不检查 signal.aborted，仍交给各工具 Invocation 生成取消结果。普通失败结果不会终止后续波次。

## 调度与暂停合同

- 迭代器创建不开始工作；首次 next 时按输入建立查找表，同 ID 后者覆盖前者，随后捕获并发数。
- 按 parallelGroups 的现有顺序读取；缺失 ID 过滤，重复 ID 保留。空有效组不发事件；batch_start 保留原组数组与原索引，包括数组中的缺失 ID。
- batch_start yield 后才读取其余 options 并调用 executeBatch。batch_complete 的 results 保留实际返回数组身份，累计结果在 yield 之前加入；消费者恢复后才读取 stopTurnAfterResult。
- 仅严格 true 停止后续组，不看 success，不提前终止本组剩余波次；消费者在 batch_complete 暂停期间修改返回数组会影响 stop 判定，但不会重写此前已追加的累计成员。
- consumer return/throw 沿原 async generator 语义结束，不在 finally 自动执行未派发组或补取消。派发与续接使用当前 next 所在的异步上下文，不绑定创建时上下文。
- 普通失败结果继续后续组；执行回调拒绝、事件拒绝或日志异常原样传播，不能吞错后伪造完成。

## 停止尾部与明确修复

停止后在恢复时投影剩余组（原顺序、重复保留、缺失过滤），一次选取本次 trace：options、deps、root；turnId 为 trace.turnId 或 deps.turnId。逐项创建原 ToolCancelled 错误和结果，先加入累计，再 await ToolCallError，最后 warn。无额外 batch_start/complete。保留消息、字段、可恢复标记和 trace 日志形状。

**唯一预期行为修复**：Runtime 已提供 offPeakTurn，但 schedule 调用 batch 时遗漏。本次将该字段与 automationTurn 一起透传，true、false 和 undefined 都不改写，分波与小批最终到达同一个工具 context。先用真实 executor 包装层建立旧版失败测试；中文实现注释记录原因。其他字段、策略与审批不因修复变化。

## 验收与范围

先验证旧版正常基线和标志漏传失败，再实现。覆盖整波屏障、输出排序、对象身份、惰性 getter、同步/异步异常、generator 暂停/return、取消/普通失败/严格 stop、补取消的事件与日志顺序、trace fallback、异步上下文及真实 executor 包装层。测试只用内存工具与端口，不触发模型、shell、浏览器或设备。

运行根与 CLI 类型/lint、严格变更文件检查、架构、格式、来源清单、CLI 构建、产物和完整离线回归；有限新旧差分不包括本次有意修复。独立复核和来源决定仅覆盖本批账本、驱动、规格及测试，不能给相邻 scheduler、事件、Runtime 和合同自动授予 MIT。根许可、版本、旧发行及用户数据保持；整体独立和稳定发布仍待完成。
