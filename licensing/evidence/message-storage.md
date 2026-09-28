<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# 消息与片段仓储来源记录

基线 `dbce9b6`，2026-09-28。[先行规格](../../specs/knorvia-message-storage.md) 与独立测试先写，旧版运行记录保留在 [验收](../../docs/knorvia-message-storage-acceptance.md)。主代理冻结旧模块在仓库外供有限对照；没有把旧实现或对照包交给实现者。主代理和只读复核者都接触过旧源码，不能称全流程无接触或据此保证整个项目许可迁移完成。

## 实现者输入

隔离任务只允许写仓库外目录；主代理接入三份新源码。实现者声明的实际读取如下：

- 本批规格全篇，以及主代理补充的行为边界：序列化 undefined 不兜底，单条查询先完成片段 SQL 再解码消息，timeline 按旧 toModel/两 Selection 次序插入新字段；旧 legacy 字段全缺席时不额外把新文档送入 JSON1，保持深层 metadata 的原可接受范围。
- `apps/cli/packages/contracts/src/interfaces/session-store.port.ts` 341–445、531–786 行的公开消息/片段类型，以及 1121–1125、1129 行方法声明。
- `apps/cli/packages/adapters/src/storage/session-store/rows.ts` 29–49 行公开行类型。
- Node SQLite 类型文件的 DatabaseSync/statement/SQL 值公开声明片段。精确片段范围随隔离报告保存；该文件只作为标准运行时接口，不是产品仓储实现。
- 延续早前 root/CLI 指令与公开类型上下文；重用 encodeJson、decodeMessageRow、decodePartRow、partCreatedAt、touchSession、withWriteTransaction 的明确签名，没有重开它们的实现。

禁止输入包含目标旧源码、Git 历史、编译代码/映射、固定基线、测试及其他仓储实现；作者报告没有访问这些内容。主代理用规格和实际输出复核；文件移动、AI 编写、名称差异与测试通过本身均不作为独立来源的充分条件。

## 逐文件判断

| 文件                                | 新实现依据与限制                                                                                                                                                                                                                  |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `repositories/message-documents.ts` | 新建临时文档，统一剔除 SQL 身份，再按当前公开类型投影所需旧 reader 字段；精确自有成员覆盖复制来源。兼容字段、JSON 术语和顺序要求来自合同，不主张这些名称独创。                                                                    |
| `repositories/message-storage.ts`   | 从阶段合同编排两个保存及四个查询/删除；保存复用显式事务归属，native JSON1 多路径更新保留旧快照，scope 改变绕开旧目标 JSON。未提取原嵌套 SQL helper 或复制旧函数正文；固定表列、排序规则及通用 UPSERT/事务模式仍属兼容与通用操作。 |
| `repositories/messages.ts`          | 六个既有导出的新转发面，运行实现全部指向本批文件。该薄入口不单独声称复杂算法原创，也不是靠移动旧文件完成替换。                                                                                                                    |

三文件共 255 行，较原 281 行净减 26；最大 185 行。只将本批确认的独立表达和新测试/规格/记录纳入 MIT，摘要写入 reviews。原 sessions/touchSession、行类型、facade、schema、migrations 及其他仓储不由本批重新许可。借用的编解码和同步事务边界沿用已有来源记录；第三方运行时照常保留其许可。

实现者仅执行语法、纯投影和假连接编排冒烟；SQLite、实际编解码/事务、源码及编译对照、类型/lint、完整回归由主代理完成。没有真实数据、设备、模型、UI 或打包/官网操作，根 Apache 和预览版本继续保留。

## 会话输入事务依赖调整（2026-09-28）

会话输入批次在先行测试确认事务跨 await 的缺陷后，由已读本文件的主代理给 `message-storage.ts` 的保存消息、保存片段和读取时间线增加同目录同步出口。原公开异步函数委派到同一函数体，序列化、SQL、复制与事务行为不另写一份；此有限调整延续此前独立实现的来源依据，不声称主代理重新从无接触状态独立重建。本批其余入口、schema 和公开端口不变。消息存储原 32 项回归通过；整体验收与新增提升事务覆盖见 [会话输入验收](../../docs/knorvia-session-input-storage-acceptance.md)。
