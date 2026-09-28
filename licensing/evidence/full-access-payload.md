<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# 完全访问载荷投影的迁移来源

在检查点 `da8f6e0`，`apps/cli/packages/adapters/src/storage/session-store/repositories/permission-full-access-payload.ts` 从原仓储保留了 JSON 解析、intent/conversationInputIntent 两字段判断和 mode 覆写，只有帮助函数提取与常量命名调整。该版本采用 Apache-2.0，不计作 Knorvia 原创或独立替换；本证据文档本身是新编写的说明。

固定来源为根来源清单记录的 ZCode 提交 `872ad960de7ec172591f7e1952f7849229f94521`，原路径 `apps/zcode-cli/packages/adapters/src/storage/session-store/repositories/permission-full-access.ts`，Git blob `7e607a2a63d6e9e0ae8e61adffb1e102d0521f31`，归一化 SHA-256 `17214c7e0a67ba7cc219e7d4f5c3faa7f2d08921e1de21a623bd26dd18dbf7f3`。本轮前本地 `fd4bc58` 文件只有 contracts 包导入改名，不据此判为独立实现。

该检查点的动作程序、事务 owner 与保留投影关系见 [提交协调规格](../../specs/knorvia-full-access-storage.md)。当时摘要复核记录为继承的第三方 Apache-2.0；新路径不代表无上游来源，协调层的 MIT 不能覆盖它。

后续 [存储值编解码规格](../../specs/knorvia-storage-value-codecs.md) 定义相同产品合同，并交给未读取目标旧实现的隔离实现任务。当前投影先收集本次分支更新，再使用共享有序投影生成输出，替换此前原地逐字段修改的实现。当前来源决定依据新的表达和实现记录，见 [本批来源证据](storage-value-codecs.md)，不是追溯改掉 `da8f6e0` 的许可。主代理和复核者已接触旧源码，不声称全流程无接触；根 LICENSE、历史记录、公共类型、JSON 校验器和相邻仓储仍保留各自适用许可。
