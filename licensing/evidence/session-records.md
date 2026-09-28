<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# 会话元数据存储来源记录

基线 `d430a2b`，2026-09-28。先写[行为规格](../../specs/knorvia-session-records.md)和先行测试，主代理冻结旧模块于仓库外供有限对照，再由隔离任务编写替换。主代理和只读复核者读取过旧目标，用于提取功能、错误及兼容边界；不是全流程无源码接触，也不声称本批即完成整体 MIT 迁移。

## 作者实际输入

作者只在仓库外输出三份新源码，没有编辑主仓库。允许且报告已读取的输入为：

- 本批合同全文：准备时 181 行，补充表名、包装器参数和 JSON 边界后 185 行；最终有限 null 行为由主代理文字补充，不提供旧函数或 SQL 模板。
- `apps/cli/packages/contracts/src/interfaces/session-store.port.ts` 中任务/标题来源常量、SessionInfo、CreateSessionInput、UpdateSessionInput、FileDiff、SessionRevert、ListSessionsInput、ClaimLegacySessionWorkspaceInput 和两份 repair 输入声明。由主代理提取公开声明到隔离输入，未提供实现。
- `apps/cli/packages/adapters/src/storage/session-store/rows.ts` 的 SessionRow 声明；decodeSessionRow、encodeJson 和 withWriteTransaction 的明确签名和合同。它们继续沿用既有来源记录，不在本批复制实现。
- 文字澄清表名 `session`、setRevert 参数形状、普通补丁重编码 JSON、当前行解码先于标题 gate、拒绝后不编码新补丁，以及有限历史 null 的既有行为。
- 早前公共类型和隔离任务上下文仍保留；没有重开或复用那些实现正文作本次模板。

禁止作者读取旧目标、其他仓储正文、Git 历史、冻结基线、构建代码/映射和先行测试；作者报告未访问。其语法检查和假连接探针只读取本次输出及签名替身，主代理另行完成原生 SQLite 验收。AI 编写、移动文件、变量不同、测试通过都不单独作为独立来源充分证明。

## 逐文件判断

| 文件                              | 依据与限定                                                                                                                                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `repositories/session-records.ts` | 由合同构造创建投影和允许字段的补丁参数，以一个同步 patch 操作在现有写事务边界内完成读取、整次标题判断、保存和结果解码。三个异步补丁入口共用该操作；创建、读取和 touch 保持规定边界，没有复用旧目标函数正文。 |
| `repositories/session-scopes.ts`  | 新列表条件构造、路径字面转义和限定范围的认领/修复。路径 CAS 用 SQLite NULL 安全比较，输入和值均绑定；原归属、排序、活动时间及列所有权由合同约束。                                                            |
| `repositories/sessions.ts`        | 十个既有导出的新转发入口，运行逻辑全部来自本批新文件。薄转发本身不宣称独创算法，替换不是把旧实现迁移到另一路径。                                                                                             |

格式化后共 **327 行**，相较原 346 行净减 19、最大 198 行。公共名称、固定表列、必要错误文本、标准 SQL 和事务模式是互操作及通用表达，不据此主张新颖性。将本批审查的独立表达及新规格/测试/记录纳入 MIT 并绑定摘要，不给未审文件或依赖自动换许可。

facade、schema、migration、行声明、其他仓储和调用者维持各自许可；SQLite/Node 和其他第三方照常保留许可与归属。根 Apache-2.0 与预览版本不改。主代理验收与实际失败修正见[验收记录](../../docs/knorvia-session-records-acceptance.md)；没有访问真实用户数据、设备、模型、UI 或生产服务器。
