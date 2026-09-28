<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# 会话元数据存储

2026-09-28。基线 `d430a2b`。范围为 `repositories/sessions.ts` 的十个存储入口；保留公开类型、表结构、现有 codec 和远程身份修复边界。旧实现用于提取行为与先行回归，隔离作者仅接收本规格、批准的公共类型和依赖签名，不读取旧目标、旧构建、历史或测试探针。

SQLite 会话行是唯一状态所有者；不存在新的镜像状态、队列或缓存。更新经现有写事务边界串行化；各修复操作继续仅拥有合同列。不修改 schema、migration、权限系统、完整 facade、UI 或用户存储，也不把本批替换视为整包独立。

物理表名为 `session`。setRevert 的第二参数是 `{ sessionID, revert, summary? }`，summary 存在时 additions/deletions/files 为必需数值、diffs 为可选 FileDiff 数组；clearRevert 第二参数是 SessionId。

有限历史输入兼容：虽公共类型不提供 null，运行时 directory/title/titleSource 的 null 继续按空值合并保留当前值；title 显式 null 仍按原比较规则参与标题 gate 和标题时间判断。setRevert 的 summary 为 null 时按缺席处理。这不扩展其他无效输入的支持范围。

```text
补丁 → SQLite 写锁 → 当前行 → 标题 gate → 本次更新 → 读取结果 → 自有事务提交
                                     └→ gate 拒绝：返回当前行
外层事务已有 → 借用同一同步更新过程 → 返回结果，提交/回滚仍由调用者负责
```

## 公开表面：实际是 10 个导出

所有函数首参均为 `DatabaseSync`。表中的返回类型是仓储函数本身；SessionStorePort 的公开 facade 对应方法返回 Promise，不得混淆。

| 导出                               | 其余参数                                | 仓储返回                  | 所有权和作用                                         |
| ---------------------------------- | --------------------------------------- | ------------------------- | ---------------------------------------------------- |
| createSession                      | CreateSessionInput                      | SessionInfo，同步         | 单条创建/冲突更新，再读取已存行                      |
| getSession                         | SessionId                               | SessionInfo 或 null，同步 | 精确 ID 读取                                         |
| listSessions                       | 可选 ListSessionsInput，默认空对象      | Promise<SessionInfo[]>    | 过滤、排序、解码；当前没有内部异步等待               |
| updateSession                      | UpdateSessionInput                      | Promise<SessionInfo>      | 对可修改字段应用一次补丁；本批建立同步原子读改写边界 |
| setRevert                          | sessionID、revert，以及可选 summary     | Promise<void>             | 通过同一更新所有者保存回滚信息和可选摘要             |
| clearRevert                        | SessionId                               | Promise<void>             | 通过同一更新所有者清除回滚及摘要                     |
| touchSession                       | SessionId、timeUpdated:number           | void，同步                | 仅单调提升活动时间                                   |
| claimLegacySessionWorkspace        | ClaimLegacySessionWorkspaceInput        | number，同步              | 精确 ID 白名单下认领空 workspace                     |
| repairLegacyRemoteSessionWorkspace | RepairLegacyRemoteSessionWorkspaceInput | boolean，同步             | 精确匹配旧身份/旧路径后迁移归属和路径                |
| repairRemoteSessionPaths           | RepairRemoteSessionPathsInput           | boolean，同步             | 路径比较并交换，及单调活动时间                       |

`normalizeSessionTaskTypes` 和写后必取记录的辅助逻辑不是导出，不需保留其私有命名或实现方式。不存在第 11 个公开仓储函数；不要为符合数量而新增 API。

## 唯一状态与事务合同

SQLite 会话行是唯一持久状态。新实现不得增加与行并存的业务快照缓存、进程内更新队列、重试缓冲或另一套授权状态。JSON 编码、行解码继续调用现有依赖，不复制其实现。

本批改变的是 updateSession 及其 setRevert/clearRevert 调用链：在存储写入锁内同步完成读取、标题保护判断、字段补丁、写入和返回值读取。不得在取得当前行之后、完成写入之前插入 await，亦不得在锁外先读取旧行再拿锁写回。

使用已存在的同步 `withWriteTransaction(db, 'borrow', write)` 合同。它的 callback 返回 void；如需要返回 SessionInfo，结果属于本次调用的局部值，不成为长期缓存。具体实现组织由隔离作者决定。

- 独立调用取得自己的写事务，在完整更新和写后解码成功后提交；对外 Promise 只有成功提交后才履行。
- 已有外层事务则借用，不自行 BEGIN、COMMIT、ROLLBACK 或创建 savepoint；调用方负责最终提交。普通异常传播后，不主动结束该外层事务。
- BEGIN 失败表示未取得所有权，不清理调用者事务、不执行补丁。
- 写入、读取/解码或 COMMIT 失败时，自有事务仍活动才回滚；SQLite 已自动终止事务时不再次回滚遮蔽首因。回滚也失败时沿用现有 helper 的 AggregateError/cause 合同。
- 借用不能阻止 SQLite 自身 RAISE(ROLLBACK) 结束外层事务；此时保留数据库首因，不补发事务控制。
- 标题 gate 拒绝时仍基于锁内读取的当前记录返回，不写任何会话字段；不能只拒绝 title 而继续应用同一补丁的 permission 等字段。
- 单条 claim/repair/touch 仍由 SQLite 语句完成原子条件更新，借用连接已有事务，不添加多余事务 owner。createSession 的既有单次 upsert/写后读取合同本规格不额外改成新的事务保证；如要改变其失败原子性须另行审定。

这一改进有意取消旧 updateSession 在同步读取后让出一次微任务的窗口：保留 async 返回类型，但本次数据库工作在返回 Promise 之前同步完成。setRevert/clearRevert 保持 Promise<void> 和通过同一更新所有者完成的方式，不制造第二套补丁逻辑。

## 创建和同 ID 冲突

创建时使用一次当前时钟作为缺省来源。time.created 缺席时用当前时间；time.updated 缺席时用本次创建时间。数值 0 有效。taskType 缺席取 interactive，titleSource 缺席取 first_input；这两个默认值不等于显式传入标记。

新行中，workspaceID、parentID、traceID、path、titleMessageID、shareURL 的缺席值写为空列；摘要四项、revert、compacting、archived 初始为空。permission 经既有 encodeJson 编码。time.titleUpdated 仅在调用者给出真值 titleSource 或 titleMessageID 时取本次更新时间；两者均未给出，即使默认 titleSource 为 first_input，也保持缺席。

同 ID 再创建必须保留行身份，不用删除重插：

| 分类         | 冲突行为                                                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| 创建身份     | 保留原 rowid、time.created                                                                                                        |
| 历史状态     | 保留摘要四项、revert、time.compacting、time.archived                                                                              |
| traceID      | 原数据库值非 NULL 时保留，包含空字符串；只有原列为 NULL 才接收本次值                                                              |
| permission   | 本次编码结果为 SQL NULL 时保留原值；有效非 NULL JSON 则替换，不深合并                                                             |
| 其他创建字段 | 使用本次 projectID、workspaceID、parentID、taskType、slug、directory、path、title、titleSource、titleMessageID、version、shareURL |
| 时间         | time.updated 与 time.titleUpdated 使用本次创建投影，可比旧值小或清空标题时间；不套用 update/touch 的单调规则                      |

返回值来自写后已存行的现有解码器，而非简单返回输入；应反映触发器的最终行值及上述保留字段。未提供某个创建参数可能清空其列，不能误套成 update 的“缺席即保留”规则。

## 更新字段和标题保护

只允许更新公开 UpdateSessionInput 定义的字段。projectID、workspaceID、parentID、traceID、taskType、slug、version、创建时间和 rowid 不由此入口修改。

| 输入                         | 缺席/undefined                     | 有效显式值                                                            |
| ---------------------------- | ---------------------------------- | --------------------------------------------------------------------- |
| directory                    | 保留当前值                         | 替换，空字符串也有效                                                  |
| path                         | 保留当前值或空列                   | 字符串替换；null 清空                                                 |
| title                        | 保留当前值                         | 替换，空字符串也有效；适用标题 gate                                   |
| titleSource                  | 保留当前解码来源，缺省 first_input | 替换为给定来源                                                        |
| titleMessageID               | 保留当前值或空列                   | 指定 ID 替换；null 清空                                               |
| shareURL                     | 保留当前值或空列                   | 字符串替换；null 清空                                                 |
| summary                      | 保留当前四个摘要成员               | null 全部清空；对象整体替换四项，未提供的成员清空，不与旧摘要逐项合并 |
| revert、permission           | 保留当前解码值并按既有 codec 编码  | null 清空；对象整体替换，不递归合并                                   |
| timeCompacting、timeArchived | 保留当前值或空列                   | number 替换（0 有效）；null 清空                                      |
| timeUpdated                  | 使用本次当前时钟                   | 使用给定数值（0 有效）；最终活动时间取存储时已有值与候选值的较大者    |

摘要 additions/deletions/files 分别落为数值或空；diffs 使用既有 JSON codec。summary={} 清空全部摘要成员；summary={additions:0} 保留该 0，同时清空其余三项。

标题 gate 仅在本次 title !== undefined 且 expectedTitleSources 是非空列表时启用。当前 titleSource 使用现有解码默认值；不在允许列表中则整个补丁无效，返回当前 SessionInfo。expectedTitleSources 空列表不限制；只修改 titleSource/titleMessageID、没有 title 时不触发该 gate。即使新 title 与当前文本相同，只要本次给出 title，gate 仍应执行。

标题时间采用本次当前时钟，当且仅当：本次实际改变 title 文本，或本次明确提供 titleSource，或本次明确提供 titleMessageID（包括 null）。同文本 title 单独更新不刷新标题时间；给出相同 titleSource 或显式清除 titleMessageID 仍刷新。timeUpdated 的显式旧值不决定标题时间。标题时间不额外取 max。

空补丁仍执行正常更新流程，推进活动时间至 max(旧值, 当前时钟)。guard 拒绝则连这一活动时间更新也不发生。返回 SessionInfo 是本次完整存储结果，而非返回旧快照或按输入在外部合成。

正常空补丁也会把当前 permission、summary_diffs、revert 解码后重新编码，因此合法 JSON 的空白可被去除，不能用跳过未提供列代替合同。读取和解码当前行先于标题 gate：坏旧 JSON 仍报错，即使补丁要清空该列或将被 gate 拒绝。gate 拒绝后不编码新补丁的 permission 等字段；循环对象可在拒绝路径不报错，放行后原生序列化错误仍传播。

## 精确读取、列表和错误

getSession 只按 ID 获取，缺行返回 null。读取不补迁移、不写回、不缓存、不吞掉 JSON/SQLite 错误。列表和写后读取继续使用现有 decodeSessionRow，保留其字段、默认值、空值与坏 JSON 行为；本批不重新实现该解码器。

列表所有启用的过滤条件取交集；未给参数等价空对象。

| 参数            | 行为                                                                                                                          |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| projectID       | 真值时精确匹配；缺席和空字符串不筛选                                                                                          |
| workspaceID     | undefined 不筛选；null 只匹配 SQL NULL；字符串精确匹配，空字符串不同于 NULL                                                   |
| directory       | 真值时精确匹配；缺席和空字符串不筛选                                                                                          |
| path            | undefined 不筛选；空字符串匹配 SQL NULL 或空字符串；非空按下面的目录边界规则匹配                                              |
| roots           | 真值时仅 parentID 列为 NULL，空字符串 parentID 不算 root                                                                      |
| taskTypes       | 只保留公共 SESSION_TASK_TYPES 中的合法值并去重；空列表或过滤后全无有效值均不加条件，而非返回空集合                            |
| includeArchived | 缺席/false 排除 time.archived 非 NULL 的行；0 也属于已归档。true 同时返回归档与未归档                                         |
| limit           | 正数才启用；0、负数及非正比较的数值不限制。不擅自取整、钳制或新设默认上限；正小数等当前由 SQLite 处理的无效上限继续报原生错误 |

SESSION_TASK_TYPES 的当前合法项为 interactive、fork、selection_side_chat、workflow_parent、workflow_child、subagent_child、nested_workflow_child；使用公共常量，不另外维护业务名单。

排序固定为活动时间降序，再 ID 降序，最后应用 limit。继续使用连接已有比较/collation 行为，不新增 locale 排序。存在一个坏行时不静默跳过该行或只返回部分解码结果。

非空 path 的范围是“精确路径本身，或该输入路径加一个 `/` 后的后代”。本批有意把输入中的 `%`、`_` 和反斜线当作字面路径字符，而不是放大筛选范围的通配/转义指令。只有实现自己添加的后代部分允许匹配任意后缀。仍不规范化大小写、斜线、点段、尾部斜线或文件系统路径，也不把反斜线另当层级分隔符；延续 SQLite 当前 LIKE 的大小写策略，而非偷偷改成新的二进制前缀语义。输入尾部已有 `/` 时不自动去掉它。

确切错误文案：updateSession 输入 ID 缺失时 `Session not found: <id>`；createSession 或已进入更新写入后的最终读取缺行时 `Session not found after write: <id>`。getSession 的缺行仍为 null。setRevert/clearRevert 传播更新错误。SQLite 约束、编码、解码错误保留原异常类别/原因，不变成空 SessionInfo；只有本次自有事务清理双失败按既有 helper 聚合。

## 回滚状态与活动时间快捷入口

setRevert 接受 sessionID 和 SessionRevert，以及可选包含 additions/deletions/files 和可选 diffs 的 summary。有 summary 时只传递这四个摘要成员；未给 summary 则保留当前摘要。它不会清空未要求的 permission、归档、标题或路径。

clearRevert 同时清空 revert 与全部摘要，不改变其他业务字段；其活动时间仍经 update 的规则推进。两者都必须经过同一个同步原子更新所有者，而非独立读取全行后再覆盖。

touchSession 只把指定会话活动时间提升到旧值与输入值的较大者，不能回退时间、不更新标题时间或任何业务字段。没有匹配 ID 时无错误，无返回计数；数据库失败仍同步抛出。

## 认领和路径修复的严格范围

### 旧会话 workspace 认领

输入 sessionIDs 按精确值去重；空列表同步返回 0，不执行修改。只能改变同时满足“ID 在白名单、directory 与输入完全相等、workspace 列是 NULL”的行；只写 workspaceID，不补 projectID、路径或活动时间。返回 SQLite 实际匹配更新数量的 number。重复 ID 不造成重复计数；相同目录的白名单外行或已有 workspace 的行不得被认领。

### 旧远程身份修复

仅单个 sessionID，并且原 workspace 列为 NULL、原 directory 完全等于 legacyWorkspaceDirectory、原 path 为 NULL 或完全等于同一个旧目录时才生效。同时写入本次 projectID、workspaceID、directory=workspacePath、path=workspacePath。其他字段和活动时间保持。

匹配并更新恰好一行返回 true，零行返回 false；不通过宽松路径搜索、前缀、猜测大小写或先读后不带条件更新来放宽边界。原 path 是空字符串时不等于 NULL，除非它确实等于指定旧目录。匹配但新旧值相同仍按 SQLite matched-change 行为处理。

### 已有远程身份的路径修复

必须同时匹配精确 sessionID、workspaceID、expectedDirectory、expectedPath。expectedPath 为 null 时只接受数据库 NULL；字符串（包括空字符串）必须完全相等。成功只更新 directory、path、活动时间=max(旧活动时间,input.timeUpdated)。不触及标题、权限、revert、归档、projectID 或 workspaceID。

条件比较和写入必须同一原子操作完成。并发其他更新改掉预期路径后应返回 false，不能覆盖新路径。匹配且更新恰好一行返回 true；同值操作仍以 SQLite 变化计数为准，不另做“值相同所以失败”的判断。

## 两项有意修复的先失败验收

以下已有有限内存复现证据，但本规格不声称正式回归已落地。主代理应在冻结旧版先证明失败，再对新实现验收。

### 原子补丁与标题 gate

准备同一会话，标题来源 first_input、初始标题 Original 和一份权限。先启动把标题设为 Custom/titleSource=custom 的 update，再在同一事件轮次启动只修改 permission 的 update，最后 Promise.all。旧版两次读取同一旧行后分别覆盖，可把 Custom 还原；新版两项都必须保留。

另一例先启动上述 custom 更新，再启动 title=Generated、titleSource=generated、expectedTitleSources=['first_input'] 的更新。旧版后者可凭过时来源通过并覆盖 custom；新版必须依据锁内最新来源拒绝整个后者补丁。给后者同时携带 permission 或 archive 改动，确认拒绝是整次补丁而非只保护文本。交换启动顺序另测，结果按实际成功先后线性化，不强行规定跨连接公平顺序。

边界补测：同连接显式外层事务下两次调用不提交外层；caller rollback 能撤销；更新不存在 ID/编码失败/写触发器失败后自有事务关闭；真实延迟约束在 COMMIT 才失败时不得返回成功快照；自动回滚与清理双失败沿用已有 helper 的专门验收，不复制事务策略。若多个独立连接测试，应让写锁在读取当前行之前生效；BUSY/超时按现有连接策略失败，不得声称自动重试。

### 字面目录筛选

种子路径至少包含精确目录、真实后代、相似但不属于该目录的路径，以及邻接兄弟目录：

- `/work/my_project`、`/work/my_project/child` 应命中；`/work/myXproject/child` 不应命中。
- `/work/rate%done` 及其后代应命中；`/work/rate-any-done/child` 不应因 `%` 被包含。
- 包含反斜线并邻接 `%`/`_` 的字面目录应仍可匹配自身和真实后代；反斜线不能把后面的字面字符或实现添加的后代匹配弄成另一种范围。
- `/work/base-other`、`/work/base2/child` 不属于 `/work/base`；空 path 的 NULL/空字符串规则保持。

加入 project/workspace/archived/taskType 和 limit 的交集检查，确认修复仅收紧 path 字面范围，而非放宽其他过滤。该修复不进行文件系统访问。

## 最少其余兼容矩阵

测试覆盖：创建的显式/缺省零时间和标题时间；同 ID 再创建的每类保留/替换、原 trace 非 NULL 优先及创建更新时间可回退；更新 undefined/null/空字符串/summary={} 与部分摘要；标题 gate 有无 title/空来源列表/同文本、来源或 messageID 单独更新；get 缺行与坏 JSON；列表所有过滤、归档时间 0、同时间 ID 排序、无有效 taskTypes、limit 边界；claim 的 allowlist/空 identity/精确目录；两个 repair 的 NULL/空路径、CAS 失败不改其他字段；revert 包装与 touch 缺行/单调时间。

优先断言普通有效输入、原始数据库列、公开解码结果、错误原因及实际事务归属。不要把任意可变 getter/Proxy 的所有读取次数纳入无限等价目标。API 名称、列名和必要错误文案可以保持，但不据此宣称新颖性。

## 验证与剩余边界

先冻结旧实现并执行合同测试，再隔离实现；先失败测试分别说明新保证和已确认缺陷。保留普通输入的原始行、解码值、错误类别与调用表面，对比源文件和最终编译入口；检查实际 CLI 产物包含本次实现。独立实现与旧版存在有意的更新同步时点和 path 字面匹配差异，不能抹去差异而声称完全等价。

跨连接写锁在读取前取得，竞争的 BUSY/超时按 SQLite 连接策略传播，不引入自动重试、公平性承诺或跨进程压力结论；以新建临时数据库验证有限的两连接锁竞争，执行结束清理夹具。自有事务异常后无部分提交，借用事务仍由外层决定；SQLite 自动回滚例外照实验证。

每个源文件及测试文件小于 400 行。验收包括相关离线回归、根和 CLI 类型/lint、测试严格类型、架构、格式、CLI 构建、全量离线回归、来源摘要与提交前密钥扫描。真实用户数据、模型调用及生产环境不在本批范围；根 Apache-2.0 与预览版本保持，MIT 只覆盖有证据的独立文件。
