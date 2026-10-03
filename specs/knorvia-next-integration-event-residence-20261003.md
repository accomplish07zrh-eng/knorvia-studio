# Session event 驻留与淘汰完整替换候选

2026-10-03。整合者独占 `apps/cli/packages/contracts/**`；在固定 lane 基线 `3b1ff0f715a43cbc51c576fd524479a08e58e203` 上确认 `events/in-memory-session-event-store.ts` 与 `events/session-event-retention.ts` 仍为继承实现，读取原实现、端口与直接调用方后选定本完整模块。不是据新文件或 stale inventory 推定原创。当前整合分支先行归属提交为 `cb72b10dad4ed569c18616f89db9463c19669ba2`。

## 范围与单一所有者

替换原 store 和 retention 工厂的完整实现；增加包内私有 `events/session-event-journal.ts`，不公开重导出。`SessionEventStorePort`、`SessionEventStoreStats`、事件 schema/type、public events barrel 和 adapters storage re-export 保持既有公开 API。reducer、runtime、持久化、真实 session 和四路任务文件不修改。

```text
append → InMemorySessionEventStore 的 session 注册表
          → 每 session 唯一 EventJournal（序号高水位、驻留链、淘汰累计）
          → 现有 retention 合同的 turn window → 同一 journal 删除瞬态节点
read/replay/stats ← 同一 journal 的新数组/派生计数
```

事件驻留改用单向链，避免淘汰时复制所有 retained entries；turn retention 改用唯一 sealed-entry 链，查重索引只引用同一节点，移除对外没有行为作用的 open-turn 副本。重复 seal 仍为常数时间查找，过期扫描保留顺序且不假定注入时钟单调。序号不依赖驻留长度，不增加另一份业务事件或 accepted command queue。公开 schemas、协议字段和标准 Set/Map/Promise 表达不计新原创表达。

## 必须保留的行为

- 原 class、options、factory 与 append/getEvents/getEventsAfter/getLatestSequenceNumber/deleteSession/getStats/pruneTransientEvents 参数和 Promise/synchronous 边界不变。默认 turn-window、可选 unbounded/按 session policy 工厂、注入时钟/default Date.now 不变；显式 undefined/null fallback 沿用当前公开行为。
- 第一次 append 才创建 session/policy，未知 session 的读取返回新空数组或 0，不创建状态。delete 丢弃该 session 的全部驻留、高水位、累计与 policy；再次 append 重新创建。
- append 接受正 sequenceNumber，否则取高水位 + 1；高水位取既有 max 规则。保留输入序号的顺序，不排序/去重或强制递增，不因淘汰降序号。存入一次 shallow copy，覆盖 sequenceNumber，返回与后续 replay 相同的存入对象；输入对象不被改写，payload 引用仍共享。
- 更新高水位并驻留之后才调用时钟和 policy.onAppend。时钟或 policy 抛错，append Promise 原错误拒绝，已驻留事件/高水位不回滚。factory 在注册 session 前调用；policy/clock 的既有 receiver 边界保持。
- getEvents 返回新数组、同一事件引用；getEventsAfter 保留插入顺序，按每次读取的 event.sequenceNumber 严格大于阈值筛选。外部修改返回事件自身的 type/turn/seq 时，后续读和 stats 看实际现存对象，不维护第二份缓存值。
- 仅现有 transient Set 中的四类事件且具有目标 turnId 时可淘汰；持久事实不删除。累计按实际删除条数增加，prune 返回本次删除数；session 删除后的 stats 不包含其历史累计。
- 默认策略：无 turnId/无关事件不淘汰；TurnComplete/TurnError 只记录该 turn 第一次 sealed 时间；新 TurnStarted 淘汰此前所有 sealed turn 的 transient，排除当前 turn，然后消费全部 sealed entries。重复 seal 不改时间，re-open 行为不变。
- collectExpired 以 nowMs - sealedAt >= graceMs 按 sealed 顺序消费，默认 grace 120,000ms。不设置新 timer，不读真实时钟以外的业务状态。unbounded 两方法均不淘汰；公开 transient Set 和 grace 常量、返回空集合的既有边界保留。

## 候选来源与验收状态

本整合者已经读取旧实现，属于 source-exposed authoring/兼容替换候选，不能声称独立隔离作者或 clean room。新的完整结构选择不自动建立 whole-expression 或 MIT 权利结论；继承的 API、类型、字段、常量、策略和第三方义务继续保留，根 Apache LICENSE/NOTICE、global reviews/current-files 与历史来源决定不修改。

按用户当前实现阶段指令，不运行测试、lint、类型检查、构建、格式/架构验证或完整审计，不为统计另开扫描。后续统一验收覆盖序号/删除重建、返回对象与输入身份、policy/clock 抛错后的已提交状态、receiver、live/replay、全部 transient/terminal 类别、re-open、grace 边界、unbounded、custom policy、多 session 和真实 direct consumer。现有测试文件仅阅读，不能把旧通过或源码审阅当成当前候选通过。实际实现 commit 和轻量模块状态只追加到 docs/lane-integration-20261003.md，不额外生成重复审计包。
