<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# 会话条目与待办仓储的实现来源

本批基线 `0758673`，先由主代理与只读审查提炼公开效果和已确认失败，写 [先行规格](../../specs/knorvia-entry-todo-storage.md) 及 21 项测试，再提供给隔离实现任务。主代理保留冻结包用于对照；实现者不得读取旧目标、dist/source map、Git 历史、冻结包、sessions.ts 或其他事务实现。实现者只在隔离目录输出三个文件，主代理整合时仅作格式处理，未将旧函数体粘回。

## 允许输入与限制

本次实现者报告阅读任务说明/合同、contracts 的 interfaces/session-store.port.ts 第 801–845 行、tools/todo.ts 前 35 行、adapters 的 session-store/rows.ts，以及 Node 类型声明中 DatabaseSync 的公开 exec/prepare/isTransaction 等定义。已读的根/CLI AGENTS、架构技能、公共 SessionId/exports 沿用上下文；上一次隔离 codec 任务的对话仍在，但未重新读取其实现作为本批模板。encodeJson、decodeSessionEntryRow、decodeTodoRow、touchSession 仅提供导入位置和签名。

主代理和审查者已经接触旧代码，不声称整个过程为无接触 clean-room。实现报告说明受限输入和自述操作，不能替代独立检查所有读取历史，也不是整仓许可保证。公开类型、固定表/列、JSON1 路径及标准 SQL/事务词汇是兼容要求，不据此主张新算法。

## 当前表达

| 文件（均位于 session-store/repositories） | 本次设计与范围                                                                                                                                                       |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| session-entries.ts                        | 从合同组合编码、单条 UPSERT 和明确的借用/自有事务策略；嵌套条件限定旧 JSON 投影，独立条目及 touch 原子提交。保留创建身份和旧成员是合同，不以 CASE 改写本身证明独立。 |
| todos.ts                                  | 将捕获的单次时间和有序替换交给自有事务边界，空列表不准备无用 INSERT；循环、SQL 及时间调用都是常规技术，依据是受限输入下的新编写记录。                                |
| write-transaction.ts                      | 本次两策略的同步执行边界，明确谁可提交/回滚，区别自动终止与仍活动的事务，聚合清理双失败；无业务缓存、savepoint 或新异步链。通用事务模式不是 Knorvia 独创算法。       |

当前三文件记录为 independent-replacement/MIT，基于实际新表达、隔离任务记录和主代理验收；不是因新增路径、拆文件、包装 SQL、AI 生成或测试通过。整合格式后的代码共 157 行，旧两文件共 131 行，净增 26、最大 79；行数不作为来源证据。

对应新测试、规格和验收/证据文档记录为原创说明及验证。摘要绑定 reviews.json；后续字节变化必须复核。既有 sessions.ts/touchSession、公共数据类型、其他仓储和迁移继续保留各自适用许可，没有因调用关系变成 MIT。

## 有限验收

旧 21 项为 18 通过、3 个预期失败；新版补入两项真实延迟外键回归后，本批 23 项与相关组合共 47 项通过。有限源码/编译对照比较正常值和状态，缺陷修复另外断言预期差异；实际结果及局限见 [验收](../../docs/knorvia-entry-todo-storage-acceptance.md)。这些结果支持行为验证，不代替来源判断。根 Apache-2.0、预览版号和全部历史发行不变，全量迁移仍未完成。
