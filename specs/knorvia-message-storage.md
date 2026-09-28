<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# 消息与片段存储合同

2026-09-28，固定基线 `dbce9b6`。本批独立替换 adapters 的 messages 仓储全部六个导出，保留公开 SessionStorePort、SQLite schema、当前编解码、时间线和分叉协议。先行合同/回归由主代理维护；隔离实现任务只读取本规格、公共签名和批准的类型，不读取旧目标源码、历史、编译产物、旧基线或其他仓储实现。主代理与复核者可以查看旧版提取行为，不能宣称全流程无接触。

## 所有者与调用边界

- SQLite 行仍为唯一持久状态；不增加业务缓存、重试、后台队列、迁移或回退旧实现。
- 六个导出均保留 async Promise 签名；内部 DB 操作在调用时同步完成，不在一次读写流程中插入 await。
- 所有 SQL 都留在 adapter。复用已独立实现的 JSON/row codec 和 `withWriteTransaction(db, "borrow", syncWrite)`；sessions.touchSession 只通过既有接口使用，仍保留其原来源状态。
- 两个保存方法独立调用时，复制来源读取、目标 upsert 和 session touch 在同一自有事务内；有外层事务时直接借用，由调用者收尾。BEGIN 失败不回滚别人的事务，数据库自动结束事务后不再次清理，清理双失败保留两个原因。
- 独立写入及 touch 必须全有或全无。这是相对旧实现的明确可靠性改进，用真实触发器和延迟外键先失败测试验证。借用分支不主动回滚，但 SQLite 的 RAISE(ROLLBACK) 自身仍能结束外层事务。

```text
MessageInfo / MessagePart → 当前存储文档投影与时间
                         → SQLite 写入归属准入
                         → 可选精确来源快照 → 目标 upsert → touch → 自有提交
                                                        └→ 借用则外层决定提交/清理
```

## 消息写入

`saveMessage(db, input: MessageInfo, copyFrom?: {sessionID: SessionId; id: string}): Promise<void>`。

- data 包含 input 的可枚举自有成员，剔除 id、sessionID；未知成员照常 JSON 编码。对 user，写入一个旧 reader 必需的 model 对象：有 modelSelection 则使用 providerId/modelId 对应旧 providerID/modelID，truthy reasoningLevel 对应 variant；缺选择写 `{}`。assistant 不合成这个对象。
- 创建时间为 input.time.created；更新时间为 assistant 的 completed ?? Date.now()，其他角色为创建时间。0 是有效值；session 活动时间通过现有 touch 保持单调。
- 新行 sequence 为该 session 最大非空 sequence 加一，空集/全空为 0。同 ID 同 session 更新保留旧 rowid、创建时间和 sequence（包括 NULL），只更新 scope、更新时间和文档；改绑 session 取新 session 队尾 sequence，原创建身份仍保留。
- 同 scope 更新：只强制保留旧文档中存在的 `model`、`providerID`、`modelID`、`variant`。存在与 null 不同于缺席；不递归合并 metadata/options 或其余旧字段，明确清空必须生效。不存在的保留字段沿用新文档值。旧 JSON 的 SQLite JSON1 行为保持：对象/数组值保留结构，boolean 读取作为 0/1，损坏 JSON 在同 scope 更新时报数据库错误。改绑不读取/解析旧目标 JSON。
- 旧目标所有 legacy 字段均缺席时，直接保存新编码文档，不让它多经过 JSON1；公开 metadata 可包含 JSON.stringify/JSON.parse 支持但超过 SQLite JSON1 深度上限的对象。有旧 legacy 字段时仍遵循既有 JSON1 限制；这不扩大为任意 SQL JSON 操作均支持深文档。

## 片段写入

`savePart(db, input: MessagePart, copyFrom?: {sessionID: SessionId; id: string}): Promise<void>`。

- 文档剔除 id、sessionID、messageID，其他可枚举自有成员保留。一般类型不转换。
- timeline/model_change 把输入 fromModel/toModel 分别存入 fromModelSelection/toModelSelection；旧 toModel 必需对象由新 toModel 的 providerId/modelId、truthy reasoningLevel 和 label 构成，缺选择为 `{}`；不合成旧 fromModel。移除两个输入字段后，新增字段按旧 toModel、fromModelSelection、toModelSelection 的次序加入；已存在的其他自有键保留其位置，避免原始 JSON 序列化出现不必要差异。
- subtask 的 model 存为 modelSelection，当前值不写进旧 model。数据读回继续使用现有 decodePartRow 投影，不改变 runtime 字段名称。
- 每次捕获一次当前时间作为 updated，created 使用既有 partCreatedAt(input, now) 合同。同 ID 再写始终保留旧创建时间和 rowid。
- 新 sequence 按 messageID 最大值加一。同 sessionID 且同 messageID 更新保留旧 sequence（包括 NULL）；任一 scope 改变则取目标 message 队尾。目标队列选择本来仅按 messageID，不扩大过滤范围。
- 同 scope 只保留旧 `fromModel`、`toModel`、`model`，JSON1/替换规则同消息；改绑使用新文档不解析旧目标。

## 精确复制来源

- copyFrom 只查询同表的 id + sessionID；片段来源没有额外 messageID 过滤。缺行抛 `Storage copy source missing: <table>/<id>`。
- 对来源文档做 JSON.parse，只将相应 legacy 键的自有成员覆盖到本次新文档；不复制其他旧内容。JSON null 来源的 Object.hasOwn 错误、损坏 JSON 的 SyntaxError 继续传播，不伪造成功。数组/其他原始值没有这些自有键时不复制。
- 来源值是原始快照，不能按当前模型反推；新建/改绑时来源 boolean 仍为 JSON boolean。若目标为同 scope 已有行，目标自身的存在 legacy 成员优先于复制来源；目标 JSON1 boolean 规则依旧。
- 来源缺失或解析失败不改变目标/会话；调用者外层事务是否清理仍由外层负责。独立写锁覆盖来源读取与写入，避免本次保存流程中释放快照边界。

## 查询与删除

- `messages(db,{sessionID})`：消息按 sequence IS NULL、sequence、time_created、rowid 排序；片段限定 session 并按 message_id、sequence IS NULL、sequence、time_created、id 排序。先解码所有匹配片段再组成消息，孤立片段不会出现在结果，但其损坏 JSON 仍报错。再逐条解码消息；每条都有 parts 数组。
- `messageWithParts(db,{sessionID,messageID})`：精确匹配，缺消息返回 null，不读取片段；有消息时先完成精确 session/message 下的片段查询，按 sequence IS NULL、sequence、time_created、id，再解码消息，最后解码片段。片段 SQL 读取失败先于消息 JSON 解码失败，消息解码又先于片段 JSON 解码，保持阶段和失败归属。
- `removeMessage` 按 id+session 删除，`removePart` 按 id+message+session 删除；不碰其他 scope，不 touch，会话外键的既有级联语义保持。零匹配无错误。
- 读取不写回、不补迁移、不重排 NULL sequence。任何动态 getter 的重复读取计数和任意恶意对象重入不作无限等价承诺；普通 materialized 业务输入、持久 JSON、可观察存储顺序与失败原子性必须覆盖。

## 验收和许可范围

先运行旧版先行合同，单列 atomicity 红例；再接入独立实现。覆盖角色/模型/特殊片段、复制、同 scope 和改绑、旧字段与清空、创建身份、排序/删除、无 await 时点、外层事务和真实 ABORT/ROLLBACK/延迟外键 COMMIT 失败。源码与编译有限对照普通行为，修复分支独立断言；公开 SqliteSessionStore 和实际 CLI bundle 都须验证。

运行根/CLI 类型和 lint、测试严格类型、变更文件严格 lint、架构、CLI 构建、完整离线、格式和来源摘要检查；暂存扫描为 0 才提交。只用新内存库/虚构输入，不访问用户数据库、模型、设备或生产服务器。UI、schema、migrations、sessions 和 facade 未迁移部分保留原适用许可，根 Apache 和预览身份不改；固定 SQL/字段/通用模式不是算法独创证明。

## 同步组合边界（2026-09-28）

会话输入提升需在同一同步原生事务里组合消息与片段，见[会话输入存储合同](knorvia-session-input-storage.md)。同目录的 message-storage.ts 增加 saveMessageSync、savePartSync、messagesSync 三个内部同步入口，分别承载既有保存/查询体；原 Promise 导出仅委派，不复制 SQL、序列化或事务逻辑。直接调用和外层组合共用原有 own/borrow、copyFrom、JSON 错误和时间线规则；公开 SessionStorePort 与跨包入口不新增同步能力。

该调整只为关闭外层提升事务中的 await 让出点。直接删掉 await、忽略依赖 Promise 的失败会错误提交，不属于有效修复。所有同步方法在数据库阶段完成时返回或抛出；原异步导出把相同错误转换为 Promise 拒绝。相关旧消息回归与新同步组合一同验收；不是新一次独立重写或扩大许可范围。
