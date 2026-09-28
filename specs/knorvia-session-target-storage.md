<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# 会话目标持久存储的独立实现

2026-09-29。基线为 `3e01922` 后未改动的 `session-target.ts`，旧目标 SHA-256 `fe71035659f3c097028b5c65aa5a17ba7edeb33ccf8334ee1578c9c137181c28`。按[总规格](knorvia-independent-implementation.md)保留功能，并在先行反例支持下改进多语句写入的原子性；本规格先于实现。

## 范围、状态与来源

仅替换 adapters 存储目录的会话目标 helper，允许新增少量本域内部模块。保留十二个同步导出及公开 Store 的 Promise 入口、故障门图、schema、迁移身份、已有数据库、运行时协议、目标工具和 UI。迁移 SQL、其他仓储、公开 GoalStatus/SessionGoal 声明不在本批许可重授范围。

调用者持有唯一 DatabaseSync；本域没有第二连接、缓存、运行计时器或业务队列。持久目标以 sessionID 为作用域，targetID 不全局唯一，分叉必须可以保留同一 targetID。上层负责何时允许创建/替换/暂停/完成，存储层不重复运行 Zod schema 的 trim/预算正数校验。

```text
运行时或 Store → 同步目标入口 → 既有事务所有者（borrow）
  → 目标事实写入 → 同一会话更新时间 → 按入口顺序读回 → 返回
已有调用者事务：参与调用者事务；提交/回滚仍由调用者决定
无调用者事务：本次完整操作成功才提交；失败由唯一 owner 清理
```

作者只接收批准的行为合同、公开签名、必要结构/表约束事实及既有事务 helper 声明，不读旧目标正文、历史、旧 bundle、测试或比较器。测试/对照角色可读旧实现；只有主代理整合。接口、字段投影、固定 SQL 语汇和短操作必然有相似，不靠改名、拆文件或许可头主张独立。复用会话已有上下文的限制如实记入来源依据。

## 数据与读回

最终 session_target 以 session_id 为主键，外键指向 session(id) 并级联删除；target_id、objective、status、tokens_used、time_used_seconds、time_created、time_updated 非空。status 的 CHECK 接受 active/paused/budget_limited/complete；token_budget、summary_title、三个 active_run 字段可空。target_id 不唯一，active_input_id 没有单独外键，不新增数据库层校验。

精确列名为 `session_id`、`target_id`、`objective`、`status`、`token_budget`、`tokens_used`、`time_used_seconds`、`time_created`、`time_updated`、`summary_title`、`active_input_id`、`active_run_started_at`、`active_run_last_seen_at`；时间列没有 `_ms` 后缀。字符串列为 TEXT，其余为 INTEGER 亲和性；预算可空，三个活动字段和摘要新增时缺省 null，两个用量字段默认 0。set/clone 在 session_id 冲突时是原行 UPDATE 的 upsert 语义，不能使用 INSERT OR REPLACE 的删除再插入语义；保留触发器与引用关系差别。create 保留 INSERT OR IGNORE 的约束/忽略语义。

目标读取缺失返回 null。读回为普通对象，依次包含 sessionID、targetID、objective、summaryTitle、status、tokenBudget、tokensUsed、timeUsedSeconds、activeInputId、activeRunStartedAtMs、activeRunLastSeenAtMs、time；time 内先 created 后 updated。原始数据库 null 和类型保持，不省略三项可选活动字段，不通过 schema 修正历史行。

所有成功触碰 session 的操作执行 max(旧 time_updated,本次时间)，不因目标时间回退而降低会话时间。目标的 updated 并非所有入口都单调，不能统一成 max。触碰不检查 UPDATE changes，不另加“会话缺失”错误。

必须读回时，查询错误原样抛出；只有查询成功却没有目标才抛 `Session target not found after write: <sessionID>`。正常写的目标 SQL、触碰、读回错误按实际先后保留。新增自有事务的 BEGIN/COMMIT/清理行为按下节处理，不声称内部 SQL 调用序列完全不变。

## 十二个公开入口

以下取时次数描述正常执行到数据库操作之前的合同；时钟/UUID 本身抛错则后续步骤不发生。传入值没有隐含净化，Math.max 的截负行为不是 finite/type 校验。

1. **readSessionTarget**：按 sessionID 读全行；0 次时钟/UUID，无写入或事务。
2. **setSessionTarget**：先一次 Date.now 作为行/触碰时间，再生成 ID，工厂另取一次 Date.now 的 base36 及一个 randomUUID，形态 `target_<time>_<uuid>`。插入或按 sessionID 替换，写入目标身份/文本/状态/预算；空值预算为 null，摘要 null、计数 0、三个活动字段 null、created/updated 均为第一个时间。写后 touch，再必须读回。
3. **cloneSessionTargetForFork**：一次 Date.now 只用于子会话 touch；目标 ID/文本/摘要/预算/累计量/created/updated 均取 source，状态取独立输入，三个活动字段清空。按子 sessionID 新增/替换，touch 后必须读回；没有 UUID，不把 source.updated 改为当前时间。
4. **createSessionTarget**：仍先取两次时钟和一个 UUID，然后 insert or ignore，状态 active、摘要 null、计数 0、预算空值 null。总会读回；只有读到的 targetID 恰等于本次生成 ID 时才 touch 并返回，否则 null。已有目标也消耗时间与 UUID，不能以 changes 或事前存在查询代替身份判定；返回 touch 前读取的对象，不在 touch 后重读。
5. **updateSessionTargetStatus**：先一次 Date.now；按 sessionID 只改状态和 updated（直接赋值），不清活动字段。changes 0 返回 null，不 touch；命中 touch 后必须读回。
6. **startSessionTargetRun**：0 次时钟；startedAt=Math.max(0,startedAtMs)。仅匹配 sessionID/targetID 且状态 active，写 input/start/lastSeen，可以覆盖已有运行。updated 用 SQL max。未命中返回当前读值，不 touch；命中以 startedAt touch 后必须读回。
7. **heartbeatSessionTargetRun**：0 次时钟；seenAt=Math.max(0,seenAtMs)。匹配 sessionID/targetID/inputID 且 start 非 null，不另外要求 active 状态。lastSeen=max(coalesce(旧值,0),seenAt)，updated=max(旧值,seenAt)。未命中返回当前；命中以 seenAt touch 后必须读回。
8. **finishSessionTargetRun**：先读当前，缺失、目标/input 身份不匹配或 start 为空则返回当前，不计算增量。endedAt=Math.max(0,输入)，tokens=Math.max(0,delta??0)，时长=Math.max(0,ceil((end-start)/1000))。受 sessionID/targetID/inputID/读取 start 约束的更新累加计数；显式非 null 状态优先，否则仅原 active、有预算且更新后 tokens>=预算时改为 budget_limited。清三活动字段，updated 取 max。CAS 未命中重读当前；命中以 endedAt touch 后必须读回。无 Date.now，不用 lastSeen 结算，重复 finish 不再次累计。
9. **recoverInterruptedSessionTargetRun**：先读当前；缺失、activeInputId 假值或 start 为空则返回当前。end=lastSeen??start，以相同 ceil/截零规则累计时间；active 改 paused，其余状态保留。沿用上述四项 CAS，清三活动字段，updated 用 max。未命中重读；命中以 end touch 后必须读回。无时钟/UUID，不能将应用离线时间计入。
10. **accountSessionTargetUsage**：先一次 Date.now，再以 Math.max(0,delta??0) 求两项增量；两者恰为 0 时只读返回。非零时按 sessionID/targetID 用 SQLite 加法累加，原 active+预算非空+新 tokens 达标时才改 budget_limited，其他状态不变；updated 直接赋 now，不清活动字段。未命中返回当前；命中 touch/read。保留 SQLite 亲和性、异常数值和原生约束行为，不改成 JS 读改写计数。
11. **updateSessionTargetSummaryTitle**：先一次 Date.now；按 sessionID/targetID 更新原样标题和 updated（直接赋值），不 trim、不清活动字段。未命中返回当前；命中 touch/read，旧目标的异步标题不能覆盖新目标。
12. **clearSessionTarget**：先一次 Date.now，按 sessionID 删除；changes 0 返回 false、不 touch，否则 touch 后 true。不读目标；缺失也取时，无 UUID。

Store 门面保持 set 默认 active、clone 默认 source.status，其余参数直接转发；只有已有 clone 入口执行前置文件故障门，不扩大该图。

先行审查补充：finish 的显式状态判断沿用 SQLite 参数绑定后的空值语义，不能先用 JS 非 null 标志取代数据库判断。三个旧版公开 Store 原生探针确认，越出 GoalStatus 的 NaN 绑定为空值时不会强制写入空状态；active 且用量达预算仍变为 budget_limited，paused 保持 paused，两者正常累计并清理运行字段。null 对照行为一致。这只是异常参数的原生兼容观察，不新增受支持的状态值或放宽上层校验；新增回归先在旧版通过再验候选。

clone 的 source 按结构化属性访问需要保留的事实，不限制为可枚举自有字段，也不读取将被清空的三个活动字段。两个旧版公开 Store 原生探针确认：属性从原型提供的 source 可以复制；活动字段访问器即使会抛错也无需调用，子目标仍正常生成。候选不能以整体展开 source 的方式额外触发这些访问器或丢失继承属性。该合成输入观察不代表真实用户数据曾包含访问器，schema 和持久化形态不变。

## 批准的原子性改进

替换前一次三场景原生调查使用真实当前 schema 的新内存库。两个自提交场景分别在 set/clear 成功改变目标后，由所属 session 的原生 RAISE(ABORT) 触发器使 touch 失败；调用抛错但目标新增/删除仍留下。第三个外层 BEGIN 对照，失败后仍由调用者持有事务，调用者 ROLLBACK 恢复完整前态。原始证据摘要 `d43c0475606852748429f333381ab43059824edd67f2351cdfcd45dfa3290167`；主代理独立核对三项错误、完整 session 行、目标行数和外层回滚前后状态。仅证实这些合成内存场景，不推断真实数据事故或磁盘损坏。

本批据此批准：所有可写入口复用既有 `withWriteTransaction(db,"borrow",...)`，使无外层事务时的目标写、touch 和相应读回成为一个原子单元。已有外层事务则直接借用，不提交/回滚、不另加保存点，也不复制该 helper 的错误清理逻辑。

- set/clone/create/status/account/title/clear 的规定时钟/UUID/增量计算保留在原先首次数据库操作之前。start/heartbeat 的输入截零同样在首次数据库操作前。新增事务不应改变这些计算次数。
- read、account 的双零增量以及 finish/recover 明确不适用的只读早退保持无新事务。finish/recover 若初读表明可能写入，进入借用/自有临界段后重读当前，再判定并计算；不得使用锁前读值进行最终结算。中途状态变化以锁内的当前事实决定，保留原有 CAS 条件。不将静态发现的跨连接风险写成已做并发实证。
- 自有事务内任何目标写、touch、读回或 COMMIT 失败均由同一 owner 处理；原生已自动回滚时不再次回滚，回滚失败保留 `[首因,清理因]` 及 cause。BEGIN 失败不结束调用者事务。借用分支保持调用者决定是否撤销部分语句的责任。
- 同步临界段不 await；没有补偿性第二写路径、不吞错误重试、不做额外历史数据迁移。普通成功结果和相应时间/状态规则保持，失败后的原子性是明确的预期差异。

## 先行验收

- 旧版兼容组先运行：十二入口、缺失/错误身份、四状态、预算边界、时间回拨、重复 finish/recover、旧标题与新目标、分叉同目标身份、真实 active 运行与离线恢复。不能只用 paused/no-op 场景宣称运行记账覆盖。
- 必须观察原始目标/session 行、自有字段与顺序、时间/UUID 次数及原始异常，不只断言某个 helper 被调用。相同生成 ID 的 create 边界、touch 前后读回差别、零增量和空 input 边界单列。
- 原子性新断言在旧版真实失败再验新实现；覆盖 set/clear 原生触发器、其他实际写入口、写后读回失败、自有清理双失败及借用外层事务保留。锁内重读使用明确门闩/端口观察，不靠任意 sleep 或无界并发压力。
- 有限旧新对照冻结输入与脚本、旧 baseline 摘要，先旧/旧自检，再源码/实际编译入口对照。预期改进单列，不能泛化忽略错误、时间或存储差异；进程退出/清理也须真实成功。
- 实际 CLI 构建核对新模块可达字节，运行根/CLI 类型与 lint、测试严格类型/规则、架构、完整离线、格式、来源和暂存密钥门禁。保留首轮失败、平台跳过和未验证边界。

不访问真实数据库、模型、设备或生产服务器；不修改用户界面及已完成工作。根 Apache-2.0 与预览身份保留，单批成功不代表整仓迁移或最终发布完成。
