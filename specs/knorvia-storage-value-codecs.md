<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# 存储值编解码与投影

2026-09-28，固定基线 `da8f6e0`。本批替换 session-store 的通用 JSON 边界、行解码和完全访问载荷投影。先登记行为和测试，再根据合同实现。仓储、表结构、事务、迁移、公共领域类型、模型选择校验器及 UI 保持原职责；新代码不访问真实用户数据或模型。

## 所有权与设计

SQL 行是输入事实；每次调用只拥有本次输出，不缓存行、不修复数据库、不查询供应商。模型选择是否合法仍由公开 contracts 的 parseModelSelectionValue 决定。采用有序字段投影，区分固定列映射、未知 JSON 成员保留、移除旧成员、规范化后追加和身份覆盖。只有需要修改的输出分支生成新对象；不建立第二份业务状态，也不把工作流专用的显式 null 编码合并进来。

纯同步路径为：调用者提供行/JSON → 解码原语 → 本次有序投影 → 返回领域值。数据库事务、时间生成、写方法取得和序列化时点仍由现有调用者控制，没有 await、事件或新的失败重试。

## 固定合同

### JSON 与权限载荷

- encodeJson(undefined/null) 得 SQL null；其他值使用原生 JSON 编码，保留 toJSON、循环/BigInt 异常和根函数/Symbol 得 undefined 的实际行为。已有 string|null 声明不完整，本批记录这一限制，不偷偷改成 SQL null，也不扩大所有 SQL 写调用的接口。
- decodeJson(null/空字符串) 得 undefined；字符串 "null" 得真正 null；其余使用原生 JSON 解析，空白坏数据、异常对象不吞掉。未遵循现有 TypeScript 声明的调用传入 undefined/false/0/NaN 时，仍保留原有 falsy 缺席结果；不据此扩大声明。
- fullAccessPayload 解析一次，只覆写现有非数组对象 intent 和 conversationInputIntent 的 mode 为 yolo。缺席、null、数组和标量 intent 原样保留；不补建 intent。根 null 仍抛 TypeError，根数组和其他原始值仍原样返回。保留未知字段、**proto** 自有键、普通对象原型和既有 mode 键的位置；新增 mode 追加。调用方仍在投影后取得 write.run，之后才序列化。

### Session / Todo 的列映射

Session 输出键顺序：id、projectID、workspaceID、parentID、traceID、taskType、slug、directory、path、title、titleSource、titleMessageID、version、shareURL、summaryAdditions、summaryDeletions、summaryFiles、summaryDiffs、revert、permission、time。

| 输出                                               | SQL 列                                                                             | 规则                                                            |
| -------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| id / projectID                                     | id / project_id                                                                    | 原值，品牌类型仅为类型边界                                      |
| workspaceID / parentID / traceID                   | workspace_id / parent_id / trace_id                                                | 真值才保留，空字符串变 undefined                                |
| taskType                                           | task_type                                                                          | 在 SESSION_TASK_TYPES 中保留，否则 interactive                  |
| slug / directory / title / version                 | 同名                                                                               | 原值                                                            |
| path / shareURL                                    | path / share_url                                                                   | 仅 null/undefined 变 undefined，空串保留                        |
| titleSource                                        | title_source                                                                       | 在 SESSION_TITLE_SOURCES 中保留，否则 first_input               |
| titleMessageID                                     | title_message_id                                                                   | 真值才保留                                                      |
| summaryAdditions / summaryDeletions / summaryFiles | summary_additions / summary_deletions / summary_files                              | 仅空值变 undefined，零保留                                      |
| summaryDiffs / revert / permission                 | summary_diffs / revert / permission                                                | 通用 JSON 解码                                                  |
| time                                               | time_created / time_updated / time_title_updated / time_compacting / time_archived | created、updated 原值，其余仅空值变 undefined；键顺序如左列所列 |

缺席可选值仍有自有 undefined 键；未知 SQL 列丢弃。Todo 仅投影 content、status、priority，不新增枚举验证。isCollaborationMode 只接受 plan/build/edit/yolo/auto 五个字符串。

### Message / Part

先用原生 JSON.parse 解析必需的 row.data，再做 JSON 投影，最后读取 SQL 身份。必需正文的空字符串必须报 SyntaxError，不能套用可选单元的空串缺席规则。非对象根（包括数组）当空对象；JSON 身份若已存在，覆写值但不移动键；不存在的身份依次追加。Message 身份 id/sessionID；Part 身份 id/sessionID/messageID。未知 JSON 成员保留，不修改输入行或数据库。

- user 移除 model 和 modelSelection，严格解析后仅追加有效 modelSelection。
- assistant 移除 providerID/modelID/variant，其他成员原样保留；其他 role 原样保留。
- timeline 且 timelineType=model_change：移除 fromModel/toModel/fromModelSelection/toModelSelection。分别解析新两侧选择并依次追加有效 fromModel/toModel。解析时先去掉 label；只有字符串 label（含空字符串）跟随有效选择保留。无效侧省略，绝不从旧模型快照补值。
- subtask：移除 model/modelSelection，只把有效选择追加为 model。其他类型原样保留。
- parseModelSelectionValue 的 trim、严格未知字段拒绝、options 规则沿用公开接口，不在 codec 放宽或复制校验器。

### Entry / 时间

Entry 先解析 JSON，再按 id、sessionID、type、time、data 构造；time 是 created/updated。type 等于公开 SESSION_ENTRY_MODEL_SELECTION 时，从对象根解包 modelSelection，有效值规范化，无效值原样返回（包括 null）；非对象 wrapper 得 undefined。其他 entry 数据完整保留。这和 Message/Part 的无效即省略是不同合同。

partCreatedAt：text/reasoning/compaction/timeline 取 time?.start ?? fallback；tool 的 running/completed/error 直接取 state.time.start，不自动容错；retry 直接取 time.created；其他类型和 tool 状态取 fallback。保留零值及原错误传播。

## 验收与来源

先对基线运行值、键顺序、自有字段、原型、未知成员、错误和时间矩阵测试。再运行有限生成对照及源码/编译公开仓储验收；对照只是兼容证据，不是独立来源证明。根/CLI typecheck、lint、架构、构建、完整离线和来源/密钥检查均实际执行，失败如实记录。

行入口的范围是同步物化 SQLite 行，时间入口为领域 part 值，不承诺任意动态 getter 之间的读取次数。复核确认：真值身份 getter 的旧二读变一读、合法 task/title 的新分支可能读两次、时间选择使用 switch 的首次 type/status；人为在读取间改变属性可能得到不同值。必须披露此有限差异，不能宣称全输入等价。坏必需 JSON 先于 SQL 身份读取的错误优先级仍是明确合同。

以规格提供给隔离实现任务，禁止其阅读目标旧实现、冻结对照包或 Git 历史；主代理已经接触原代码，不能把整个流程称为无接触 clean-room。逐文件判断依据新设计、实际表达、隔离任务记录与复核；如只是提取或逐行改写，继续保留原许可。rows.ts、公共 schema 和相邻仓储不因调用新 codec 而成为独立实现。根 Apache-2.0、预览版号和历史发布均保持，整仓迁移仍未完成。
