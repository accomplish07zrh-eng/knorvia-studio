# Session event projection 完整替换候选

2026-10-03。整合者独占 contracts；基线为已推送的 `6343ee5fb806049c4c4f636747997e4c17410ee9`。已读取继承的 event-reducer、helpers、SessionProjection/EventReducerPort/事件 payload 合同，以及 core 的 rebuildProjection/resume 调用方。该 owner 仍待实现，不能由已经替换的 event store 推定完成。本候选属于 source-exposed authoring；不声称隔离作者、clean room、已接受原创或 MIT 权利。

## 范围与写入模型

完整替换 `apps/cli/packages/contracts/src/events/event-reducer.ts` 与 helpers 的运行时转换 owner，增加包内 projection-transition / projection-ledgers / projection-queue 实现文件。保留 EventReducer、reduce、apply、helpers 既有导出及签名；不改 SessionProjection、SessionEvent、ports、schemas、barrels、core/runtime、shared 或其他 lane 文件。

原每实例 handlers closure 集合改成无实例状态的事件转换：只从输入 projection 读取，各领域计算一个 typed Partial<SessionProjection>；统一 commit 创建新 projection 并写 updatedAt。collection 更新只产生新数组及命中项，不修改输入 projection、事件或未命中项，不设额外队列、后台任务仓库、状态 cache 或真实副作用。压缩/rewind/目标 verifier 继续通过现有 canonical parser/helper，解析错误原样传播。

```text
EventReducer.reduce: 既有 initial template + first session id → 顺序调用 this.apply
EventReducer.apply: session event → lifecycle / queue / tools / permission /
                                    target / ledger 的纯字段 changes
                   → 一个 commit → 新 SessionProjection
runtime rebuild/resume ← 原公开入口；schema、port 与其他 lane 不改
```

## 必须保留的行为

- reduce 从原 initialSessionProjection 浅拷贝开始；空事件 id 仍为 unknown，原 module 初始化 Date、默认 mode/build/status/idle、窗口 200000、字段存在性和共享初始数组边界保留。按输入顺序 fold，不排序/去重、不借 sequenceNumber 排序；稀疏数组沿用 native reduce 跳洞/初始长度语义；this.apply 的 subclass override 仍有效。apply 对未知/未处理事件只写 updatedAt，返回新对象。
- SessionCreated/ModeChanged 保留显式 planEnabled 优先，否则 mode===plan；createdAt/id/contextWindow/status 边界不变。mode grant 只把选定 queue item 已有 intent 改为 yolo，不重新 admission。
- TurnStarted 设置 currentTurnId、清旧 lastError、增加 turnCount 并 running；TurnComplete 增加累计 token 并 idle；ToolBatchComplete 仅清指定 active tools，不把仍工作的 turn 提前 idle。TurnError 保存 type/message，以及 truthy code/detail/attribution 的完整根因，不吞错误。
- 主 ModelComplete 只在显式 main_turn 或历史缺 querySource 且非 tool_internal 时通过 getModelUsageContextTokens 更新 contextUsed；undefined usage 不清旧值。goal verifier querySource 优先进入摘要；其他 sidecar 只更新时间。
- queued 以第一个同 pendingInputId 原位置替换，保留旧 queuedAt 和 payload 缺失时的 commandKind/source/presentation/intent/disallowlist；input/preview/size/targetTurnId/traceId 采用本事件。delivery change 只改匹配项，完整 intent 优先；否则在原 intent 上覆盖 delivery/fallback。reorder 保留请求顺序/重复 id、未知 id 跳过、未列项原顺序和每项 queuePosition；drain/discard 清全部目标 id，不改变其他项。
- scheduled 追加 pending tool；started/result/error 变更全部同 toolCallId 项，未命中项保留引用；成功/失败判定不变。permission requested 保留 request/input/reason/risk/image display/origin/options/update 等字段；resolve/deny 清同 toolCallId 所有 pending 请求并写工具 completed/denied。不取消或代决策任何真实权限。
- background started 删除全部同 taskId 旧项后追加完整原白名单快照；updated 对全部同 id 项覆盖 payload 的 enumerable string keys，undefined 不覆盖，其他 falsy/扩展字段保留；completed 更新全部同 id 或无匹配时追加，completedAt 缺失用事件时间，startedAt 缺失不抹旧值。对应 fields、累计输出、文件路径、状态和序列顺序保持。
- streaming ledger 按 attemptId+toolCallId 更新所有匹配项或追加，保留 payload 中显式 undefined 的既有覆盖行为；anchor 保留原 payload 全字段与事件 updatedAt。compact 校验原合同、token fallback truePost/post/旧值、完整边界快照；checkpoint/rewind 保留全部既有字段和原 parser 异常。
- target set 的 previous/current targetID 不同才清两个 verification 列表。verification timeline 首个匹配 verificationId 或（显式 iteration + target）沿用 startedAt/anchors/iteration；按引用替换匹配项，不按新 verificationId 重复追加。failed_closed/cancelled 补失败摘要，completed 由 model_complete 汇入，不双计。

## 来源与后续验收

公开字段、默认 template、固定业务策略、标准数值 helper 与 canonical parser/API 表达沿用既有来源，不把字段搬家或通用 spread/array 表达计为原创。本次 complete-owner 候选的新的转换结构也不自动建立表达独立性或贡献权利。根 LICENSE/NOTICE、global inventory/reviews、既有 accepted hash/材料义务/HOLD 不修改。

当前实现阶段不运行测试、lint、typecheck、format/architecture 检查、构建或完整审计，不为进度统计另跑扫描。以上场景、cold/live projection 一致性、真实 runtime 消费者、返回对象/嵌套引用和 parser 失败都留待统一验收；源码阅读不是通过证明。实际 source commit 只追加到已有 docs/lane-integration-20261003.md。父任务现行累计工程估计约 75%（65%–80%），不是本模块验证或权利验收率，不另行统计。
