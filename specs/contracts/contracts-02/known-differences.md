# contracts-02 与旧实现的已知差异（known-differences.md）

本包合同是**兼容合同**：公开导出名、签名、schema 语义与常量取值必须与旧实现一致，因此本文件记录的是「合同明确不覆盖」与「替换阶段允许改变」的部分，而不是行为差异。

## 1. 合同不覆盖的内部实现细节

| 项                                      | 旧实现                                      | 合同口径                                                                             |
| --------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------ |
| `tools/target.ts` 的 `Target*` 兼容别名 | 26 个别名（`TargetStatus = GoalStatus` 等） | knip 报未使用 + 全仓搜索 0 处引用 → 合同前单独提交删除（`edc59645`）；不再属于兼容面 |
| `tracing/span-residence.ts`             | 包内私有模块（不经公开入口导出）            | 由 B3 经公开 `createSpan`/`createTracer` 间接覆盖；替换时可自由重组内部实现          |
| 各工具文件的内部 helper                 | 文件内私有函数                              | 不属兼容面；替换时按行为等价重写                                                     |
| `tools/node-repl.ts`                    | 已登记 `independent-replacement`            | 不在本合同范围                                                                       |

## 1b. 必须逐字一致的签名与字段（冻结面）

下列内容由 `interface.md` 冻结，替换实现**必须逐字保留**；它们也是相似度工具按 `--declaration --interface` 计分时被剔除的部分（逐文件算式见 `docs/knorvia-contracts-02-acceptance.md`）：

| 冻结内容                                                                                                                                                                                | 位置                                | 为什么必须一致                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| `TraceContext` / `ExecutionContext` / `Span` / `Tracer` 的字段名、可选性与方法签名                                                                                                      | `tracing/tracer-types.ts`           | 跨模块与跨进程传播 `traceId` 的结构化子标识依赖这些字段名；`Span` 的字段就是日志与 UI 读取的契约 |
| `createTracer` / `getCurrentTraceContext` / `runWithContext(Async)` / `createSpan` / `createRootTraceContext` / `createChildTraceContext` / `traceContextToLogContext` 的参数与返回类型 | `tracing/tracer.ts`                 | 调用方按这些签名传参与取值；`traceContextToLogContext` 的字段平铺顺序是日志上下文契约            |
| `LocalTurnPreparationFact` 的字段与可选性、`observeLocalTurnPreparation` / `beginLocalTurnPreparation` 的签名                                                                           | `tracing/local-turn-preparation.ts` | CLI recorder 按字段名消费事实；`id` 形如 `prepare:<n>`、`outcome` 取值集合是协议面               |
| 各工具 schema 的导出名、`z` schema 的接受/拒绝集合、常量取值（上限、超时、错误码）                                                                                                      | `tools/*`                           | 工具描述与模型可见文案按常量生成；错误码被上层映射为用户提示                                     |
| `RewindScope` / `RewindStrategy` / `RewindTargetStatus` 取值、三个 `parse*` 与 `evaluateRewindTarget` / `selectActiveConversationBranch` 的签名与判定结果                               | `rewind/index.ts`                   | 会话回滚的判定结果直接驱动 UI 与存储行为                                                         |
| `WorkflowStrategySchema` / `WorkflowRunSnapshotSchema` 及其 `Expert*` 别名同一性                                                                                                        | `workflow/*`                        | 别名必须指向同一 schema 对象（B9 断言），策略字段名被运行器读取                                  |

**冻结语义点**（行为层面，必须一致）：span 只允许 `running → completed | error` 一次结算、`onEnd` 钩子以同一个已结算 record 只调用一次、`addEvent` 无副作用（不存事件集合）、`runWithContext`/`runWithContextAsync` 作用域结束后 ambient 不残留、child 上下文的 `parentSpanId` 与 `parentId` 同时指向父 `spanId`、`attributes` 按父→子合并且子覆盖同键。

## 2. 替换阶段允许改变的部分

- 模块内部组织方式（类型分组、常量表结构、谓词实现方式、文件拆分）。
- 注释、日志文案、内部错误消息（**例外**：B4 与 B6 中逐字断言的模型可见文案不得改变）。
- 导出名与签名不得改变；schema 的接受/拒绝集合不得放宽（可收紧到合同断言的集合，但不得比旧实现更宽）。

## 3. 待替换阶段验证的项

- `CreateWorkflowInputSchema` 的「script / path / saved 三选一」来源互斥不在 schema 内（旧实现由工具处理层校验），替换实现必须保持同一分工；本合同的断言只覆盖 schema 自身可见行为（见 `behavior.md` B8）。
- 未被 B1–B9 触达的 schema（各工具文件的输入/输出 schema 大部分只做导出面断言）：替换阶段按 `interface.md` 保持签名，行为按「schema 语义等价」自查，并在替换 PR 的验收文档中逐项列出。
